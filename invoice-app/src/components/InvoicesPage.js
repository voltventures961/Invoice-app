import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc, deleteDoc, addDoc, getDocs } from 'firebase/firestore';
import { auth, db } from '../firebase/config';

const InvoicesPage = ({ navigateTo }) => {
    const [invoices, setInvoices] = useState([]);
    const [cancelledInvoices, setCancelledInvoices] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [displayLimit, setDisplayLimit] = useState(20);
    const [showCancelledModal, setShowCancelledModal] = useState(false);
    const [confirmCancel, setConfirmCancel] = useState(null);
    const [showPaymentRefundModal, setShowPaymentRefundModal] = useState(false);
    const [pendingCancelInvoice, setPendingCancelInvoice] = useState(null);

    // Payment modal state
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [selectedInvoice, setSelectedInvoice] = useState(null);
    const [paymentAmount, setPaymentAmount] = useState('');
    const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
    const [paymentMethod, setPaymentMethod] = useState('cash');
    const [paymentReference, setPaymentReference] = useState('');
    const [paymentNote, setPaymentNote] = useState('');
    const [clientBalance, setClientBalance] = useState(0);
    const [payFromAccount, setPayFromAccount] = useState(false);
    const [payments, setPayments] = useState([]);
    const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);

    useEffect(() => {
        if (!auth.currentUser) return;

        // Listen to payments (filtered by current user)
        const paymentsQuery = query(
            collection(db, 'payments'),
            where('userId', '==', auth.currentUser.uid)
        );
        const unsubscribePayments = onSnapshot(paymentsQuery, (snapshot) => {
            const paymentsData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setPayments(paymentsData);
        });

        const q = query(
            collection(db, `documents/${auth.currentUser.uid}/userDocuments`),
            where('type', '==', 'invoice')
        );

        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const activeDocs = [];
            const cancelledDocs = [];
            
            querySnapshot.forEach((doc) => {
                const data = { id: doc.id, ...doc.data() };
                
                if (data.cancelled === true) {
                    cancelledDocs.push(data);
                } else {
                    activeDocs.push(data);
                }
            });
            
            // Sort by creation date (newest first)
            activeDocs.sort((a, b) => {
                const dateA = a.date?.toDate ? a.date.toDate() : new Date(a.date);
                const dateB = b.date?.toDate ? b.date.toDate() : new Date(b.date);
                return dateB - dateA;
            });
            cancelledDocs.sort((a, b) => (b.cancelledAt?.toDate() || new Date()) - (a.cancelledAt?.toDate() || new Date()));
            
            setInvoices(activeDocs);
            setCancelledInvoices(cancelledDocs);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching invoices: ", error);
            setLoading(false);
        });

        return () => {
            unsubscribe();
            unsubscribePayments();
        };
    }, []);

    // Calculate client account balance (unallocated payments)
    const getClientBalance = (clientId) => {
        const clientPayments = payments.filter(p => p.clientId === clientId && !p.settledToDocument);
        return clientPayments.reduce((sum, p) => sum + p.amount, 0);
    };

    // Calculate payment status
    const getPaymentStatus = (invoice) => {
        const totalPaid = invoice.totalPaid || 0;
        const total = invoice.total || 0;

        if (totalPaid >= total) {
            return { status: 'paid', label: 'Paid', color: 'bg-green-100 text-green-800' };
        } else if (totalPaid > 0) {
            return { status: 'partial', label: `Partial ($${totalPaid.toFixed(2)})`, color: 'bg-yellow-100 text-yellow-800' };
        } else {
            const daysSinceIssued = Math.floor((new Date() - invoice.date.toDate()) / (1000 * 60 * 60 * 24));
            if (daysSinceIssued > 30) {
                return { status: 'overdue', label: 'Overdue', color: 'bg-red-100 text-red-800' };
            }
            return { status: 'unpaid', label: 'Unpaid', color: 'bg-gray-100 text-gray-800' };
        }
    };

    // Handle payment modal
    const openPaymentModal = (invoice) => {
        setSelectedInvoice(invoice);
        const remaining = invoice.total - (invoice.totalPaid || 0);
        const balance = getClientBalance(invoice.client.id);
        setClientBalance(balance);
        setPaymentAmount(remaining.toFixed(2));
        setPaymentNote('');
        setPaymentDate(new Date().toISOString().split('T')[0]);
        setPayFromAccount(false);
        setShowPaymentModal(true);
    };

    // Handle add payment
    const handleAddPayment = async () => {
        // Prevent double submission
        if (isSubmittingPayment) {
            console.log('Payment submission already in progress, ignoring duplicate request');
            return;
        }

        if (!selectedInvoice || !paymentAmount || parseFloat(paymentAmount) <= 0) return;

        setIsSubmittingPayment(true);

        try {
            const amount = parseFloat(paymentAmount);

            if (payFromAccount) {
                // Pay from client account balance
                if (clientBalance < amount) {
                    alert(`Insufficient client balance. Available: $${clientBalance.toFixed(2)}, Required: $${amount.toFixed(2)}`);
                    return;
                }

                // Get unallocated payments for this client (FIFO)
                const clientPayments = payments.filter(p => p.clientId === selectedInvoice.client.id && !p.settledToDocument);
                clientPayments.sort((a, b) => {
                    const dateA = a.paymentDate?.toDate ? a.paymentDate.toDate() : new Date(a.paymentDate);
                    const dateB = b.paymentDate?.toDate ? b.paymentDate.toDate() : new Date(b.paymentDate);
                    return dateA - dateB;
                });

                let remainingToSettle = amount;
                for (const payment of clientPayments) {
                    if (remainingToSettle <= 0) break;

                    const amountToAllocate = Math.min(payment.amount, remainingToSettle);

                    if (amountToAllocate === payment.amount) {
                        // Full payment allocated to this invoice
                        await updateDoc(doc(db, 'payments', payment.id), {
                            documentId: selectedInvoice.id,
                            settledToDocument: true,
                            settledAt: new Date(),
                            notes: (payment.notes || '') + ` | Allocated to invoice ${selectedInvoice.invoiceNumber}`,
                            updatedAt: new Date()
                        });
                        remainingToSettle -= amountToAllocate;
                    } else {
                        // Partial payment - split
                        await updateDoc(doc(db, 'payments', payment.id), {
                            amount: amountToAllocate,
                            documentId: selectedInvoice.id,
                            settledToDocument: true,
                            settledAt: new Date(),
                            notes: (payment.notes || '') + ` | Partially allocated to invoice`,
                            updatedAt: new Date()
                        });

                        // Create new payment for remaining unallocated amount
                        const remainingUnallocated = payment.amount - amountToAllocate;
                        const newPaymentData = {
                            ...payment,
                            userId: auth.currentUser.uid, // Ensure userId is set for split payment
                            amount: remainingUnallocated,
                            settledToDocument: false,
                            documentId: null,
                            notes: (payment.notes || '') + ` | Split from original payment`,
                            createdAt: new Date(),
                            updatedAt: new Date()
                        };
                        delete newPaymentData.id;
                        await addDoc(collection(db, 'payments'), newPaymentData);
                        remainingToSettle = 0;
                    }
                }
            } else {
                // Add new payment to the payments collection (allocated to this invoice)
                const paymentData = {
                    userId: auth.currentUser.uid, // CRITICAL: Add userId for data isolation
                    clientId: selectedInvoice.client.id,
                    documentId: selectedInvoice.id,
                    amount: amount,
                    paymentDate: new Date(paymentDate),
                    paymentMethod: paymentMethod,
                    reference: paymentReference || `Invoice #${selectedInvoice.invoiceNumber}`,
                    notes: paymentNote,
                    settledToDocument: true, // Payment is allocated to this invoice
                    createdAt: new Date(),
                    updatedAt: new Date()
                };

                await addDoc(collection(db, 'payments'), paymentData);
            }

            // Update document payment status
            await updateDocumentPaymentStatus(selectedInvoice.id);

            // Reset form and close modal
            setShowPaymentModal(false);
            setSelectedInvoice(null);
            setPaymentAmount('');
            setPaymentNote('');
            setPaymentReference('');
            setPaymentMethod('cash');
            setPaymentDate(new Date().toISOString().split('T')[0]);
            setPayFromAccount(false);
        } catch (error) {
            console.error("Error adding payment: ", error);
            alert("Error adding payment. Please try again.");
        } finally {
            // Re-enable submission after operation completes
            setIsSubmittingPayment(false);
        }
    };

    // Update document payment status based on payments collection
    const updateDocumentPaymentStatus = async (documentId) => {
        try {
            // Get all payments for this document
            const paymentsQuery = query(collection(db, 'payments'), where('documentId', '==', documentId));
            const paymentsSnapshot = await getDocs(paymentsQuery);
            
            let totalPaid = 0;
            paymentsSnapshot.forEach(doc => {
                totalPaid += doc.data().amount;
            });

            // Update the document
            const documentRef = doc(db, `documents/${auth.currentUser.uid}/userDocuments`, documentId);
            const document = await getDocs(query(collection(db, `documents/${auth.currentUser.uid}/userDocuments`), where('__name__', '==', documentId)));
            const docData = document.docs[0]?.data();
            
            await updateDoc(documentRef, {
                totalPaid: totalPaid,
                paid: totalPaid >= (docData?.total || 0),
                lastPaymentDate: new Date(),
                updatedAt: new Date()
            });
            console.log(`Updated invoice ${documentId} with totalPaid: ${totalPaid}`);
        } catch (error) {
            console.error('Error updating document payment status:', error);
        }
    };

    // Handle cancel payment - redirect to payments page for management
    const handleCancelPayment = async (invoice, paymentIndex) => {
        alert('To manage payments, please go to the Payments page in the sidebar.');
    };

    const handleCancelInvoice = async (invoiceId) => {
        if (!auth.currentUser) return;

        // Check if invoice has payments
        const invoice = invoices.find(inv => inv.id === invoiceId);
        const hasPaidAmount = invoice && (invoice.totalPaid || 0) > 0;

        if (hasPaidAmount) {
            // Show payment refund modal
            setPendingCancelInvoice(invoice);
            setShowPaymentRefundModal(true);
            setConfirmCancel(null);
        } else {
            // No payments, just cancel
            await cancelInvoiceNow(invoiceId, false);
        }
    };

    const cancelInvoiceNow = async (invoiceId, movePaymentsToClientAccount) => {
        if (!auth.currentUser) return;

        try {
            const docRef = doc(db, `documents/${auth.currentUser.uid}/userDocuments`, invoiceId);
            await updateDoc(docRef, {
                cancelled: true,
                cancelledAt: new Date(),
                paymentsMovedToClientAccount: movePaymentsToClientAccount
            });

            if (movePaymentsToClientAccount) {
                // Get all payments for this invoice
                const paymentsQuery = query(collection(db, 'payments'), where('documentId', '==', invoiceId));
                const paymentsSnapshot = await getDocs(paymentsQuery);

                // Move payments to client account (unallocate them)
                for (const paymentDoc of paymentsSnapshot.docs) {
                    await updateDoc(doc(db, 'payments', paymentDoc.id), {
                        documentId: null,
                        settledToDocument: false,
                        notes: (paymentDoc.data().notes || '') + ' | Moved to client account due to invoice cancellation',
                        updatedAt: new Date()
                    });
                }
            }

            setConfirmCancel(null);
            setShowPaymentRefundModal(false);
            setPendingCancelInvoice(null);
        } catch (error) {
            console.error("Error cancelling invoice: ", error);
        }
    };

    const handleRestoreInvoice = async (invoiceId) => {
        if (!auth.currentUser) return;
        
        try {
            const docRef = doc(db, `documents/${auth.currentUser.uid}/userDocuments`, invoiceId);
            await updateDoc(docRef, {
                cancelled: false,
                cancelledAt: null
            });
        } catch (error) {
            console.error("Error restoring invoice: ", error);
        }
    };

    const handlePermanentDelete = async (invoiceId) => {
        if (!auth.currentUser) return;
        
        if (!window.confirm('Are you sure you want to permanently delete this invoice? This action cannot be undone.')) {
            return;
        }
        
        try {
            const docRef = doc(db, `documents/${auth.currentUser.uid}/userDocuments`, invoiceId);
            await deleteDoc(docRef);
        } catch (error) {
            console.error("Error permanently deleting invoice: ", error);
        }
    };

    // Filter invoices based on search query
    const filteredInvoices = invoices.filter(doc => {
        const search = searchQuery.toLowerCase();
        const dateStr = doc.date.toDate().toLocaleDateString();
        const paymentStatus = getPaymentStatus(doc);

        return (
            doc.documentNumber.toLowerCase().includes(search) ||
            doc.client.name.toLowerCase().includes(search) ||
            dateStr.includes(search) ||
            doc.total.toString().includes(search) ||
            paymentStatus.label.toLowerCase().includes(search) ||
            (doc.proformaNumber && doc.proformaNumber.toLowerCase().includes(search))
        );
    });

    // If searching, show all results; otherwise limit to displayLimit (default 20)
    const displayedInvoices = searchQuery ? filteredInvoices : filteredInvoices.slice(0, displayLimit);

    // Calculate statistics
    const totalAmount = displayedInvoices.reduce((sum, doc) => sum + doc.total, 0);
    const totalPaidAmount = displayedInvoices.reduce((sum, doc) => sum + (doc.totalPaid || 0), 0);
    const totalUnpaidAmount = totalAmount - totalPaidAmount;

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold text-gray-800">Invoices</h1>
                <div className="flex gap-2">
                    <button 
                        onClick={() => setShowCancelledModal(true)} 
                        className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded-lg shadow-md transition-colors"
                    >
                        Cancelled ({cancelledInvoices.length})
                    </button>
                    <div className="text-sm text-gray-600 flex items-center">
                        Total: {invoices.length} active invoices
                    </div>
                </div>
            </div>

            {/* Search Bar */}
            <div className="mb-6">
                <input
                    type="text"
                    placeholder="Search by invoice number, client name, date, amount, or payment status..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
            </div>

            {/* Payment Summary */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="bg-green-50 p-4 rounded-lg">
                    <p className="text-sm text-green-600">Total Paid</p>
                    <p className="text-2xl font-bold text-green-800">${totalPaidAmount.toFixed(2)}</p>
                </div>
                <div className="bg-red-50 p-4 rounded-lg">
                    <p className="text-sm text-red-600">Outstanding</p>
                    <p className="text-2xl font-bold text-red-800">${totalUnpaidAmount.toFixed(2)}</p>
                </div>
                <div className="bg-blue-50 p-4 rounded-lg">
                    <p className="text-sm text-blue-600">Total Invoiced</p>
                    <p className="text-2xl font-bold text-blue-800">${totalAmount.toFixed(2)}</p>
                </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-lg">
                <div className="overflow-x-auto">
                    {loading ? (
                        <div className="flex justify-center items-center py-8">
                            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
                        </div>
                    ) : displayedInvoices.length === 0 ? (
                        <p className="text-gray-500">
                            {searchQuery ? 'No invoices found matching your search.' : 'No invoices found.'}
                        </p>
                    ) : (
                        <table className="min-w-full bg-white">
                            <thead className="bg-gray-200 text-gray-600 uppercase text-sm leading-normal">
                                <tr>
                                    <th className="py-3 px-6 text-left">Number</th>
                                    <th className="py-3 px-6 text-left">Client</th>
                                    <th className="py-3 px-6 text-center">Date</th>
                                    <th className="py-3 px-6 text-right">Total</th>
                                    <th className="py-3 px-6 text-right">Paid</th>
                                    <th className="py-3 px-6 text-center">Payment Status</th>
                                    <th className="py-3 px-6 text-center">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="text-gray-600 text-sm font-light">
                                {displayedInvoices.map(doc => {
                                    const paymentStatus = getPaymentStatus(doc);
                                    const remaining = doc.total - (doc.totalPaid || 0);
                                    
                                    return (
                                        <tr key={doc.id} className="border-b border-gray-200 hover:bg-gray-100">
                                            <td className="py-3 px-6 text-left font-medium">{doc.documentNumber}</td>
                                            <td className="py-3 px-6 text-left">{doc.client.name}</td>
                                            <td className="py-3 px-6 text-center">{doc.date.toDate().toLocaleDateString()}</td>
                                            <td className="py-3 px-6 text-right font-semibold">${doc.total.toFixed(2)}</td>
                                            <td className="py-3 px-6 text-right font-semibold">${(doc.totalPaid || 0).toFixed(2)}</td>
                                            <td className="py-3 px-6 text-center">
                                                <span className={`px-2 py-1 text-xs rounded-full ${paymentStatus.color}`}>
                                                    {paymentStatus.label}
                                                </span>
                                            </td>
                                            <td className="py-3 px-6 text-center">
                                                <div className="flex item-center justify-center gap-1">
                                                    <button
                                                        onClick={() => navigateTo('viewDocument', doc)}
                                                        className="text-gray-600 hover:text-indigo-600 font-medium py-1 px-2 rounded-lg text-sm"
                                                    >
                                                        View
                                                    </button>
                                                    {remaining > 0 && (
                                                        <button
                                                            onClick={() => openPaymentModal(doc)}
                                                            className="text-green-600 hover:text-green-800 font-medium py-1 px-2 rounded-lg text-sm"
                                                            title="Add payment to this invoice"
                                                        >
                                                            Add Payment
                                                        </button>
                                                    )}
                                                    <button 
                                                        onClick={() => setConfirmCancel(doc.id)} 
                                                        className="text-red-600 hover:text-red-800 font-medium py-1 px-2 rounded-lg text-sm"
                                                        title="Cancel Invoice"
                                                    >
                                                        Cancel
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>
                
                {/* Load More Button - only show when not searching */}
                {!searchQuery && filteredInvoices.length > displayLimit && (
                    <div className="mt-4 text-center">
                        <button
                            onClick={() => setDisplayLimit(prev => prev + 20)}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-6 rounded-lg transition-colors"
                        >
                            Load More Invoices ({filteredInvoices.length - displayLimit} remaining)
                        </button>
                    </div>
                )}
            </div>

            {/* Payment Refund Modal */}
            {showPaymentRefundModal && pendingCancelInvoice && (
                <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center p-4">
                    <div className="bg-white rounded-lg shadow-2xl p-6 max-w-lg">
                        <h3 className="text-lg font-bold mb-4 text-orange-600">⚠️ Invoice Has Payments</h3>
                        <div className="mb-6">
                            <p className="mb-4">This invoice has received <strong className="text-green-600">${(pendingCancelInvoice.totalPaid || 0).toFixed(2)}</strong> in payments.</p>
                            <p className="mb-4">What would you like to do with these payments?</p>

                            <div className="bg-blue-50 border-l-4 border-blue-400 p-4 mb-4">
                                <p className="text-sm text-blue-800">
                                    <strong>Option 1:</strong> Move payments to client account balance<br/>
                                    → Payments remain on record and can be used to settle other invoices
                                </p>
                            </div>

                            <div className="bg-red-50 border-l-4 border-red-400 p-4">
                                <p className="text-sm text-red-800">
                                    <strong>Option 2:</strong> Payment was reimbursed externally<br/>
                                    → Keeps payment history but marks invoice as cancelled
                                </p>
                            </div>
                        </div>
                        <div className="flex flex-col gap-2">
                            <button
                                onClick={() => cancelInvoiceNow(pendingCancelInvoice.id, true)}
                                className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium"
                            >
                                Move to Client Account Balance
                            </button>
                            <button
                                onClick={() => cancelInvoiceNow(pendingCancelInvoice.id, false)}
                                className="w-full px-4 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors font-medium"
                            >
                                Payment Reimbursed (Keep History Only)
                            </button>
                            <button
                                onClick={() => {
                                    setShowPaymentRefundModal(false);
                                    setPendingCancelInvoice(null);
                                }}
                                className="w-full px-4 py-2 bg-gray-300 hover:bg-gray-400 rounded-lg transition-colors"
                            >
                                Cancel (Keep Invoice Active)
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Cancel Confirmation Modal */}
            {confirmCancel && (
                <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center p-4">
                    <div className="bg-white rounded-lg shadow-2xl p-6 max-w-md">
                        <h3 className="text-lg font-bold mb-4">Confirm Cancel Invoice</h3>
                        <p className="mb-6">Are you sure you want to cancel this invoice? This will remove it from financial reports and move it to the cancelled invoices history.</p>
                        <div className="flex justify-end gap-2">
                            <button
                                onClick={() => setConfirmCancel(null)}
                                className="px-4 py-2 bg-gray-300 hover:bg-gray-400 rounded-lg transition-colors"
                            >
                                Keep Invoice
                            </button>
                            <button
                                onClick={() => handleCancelInvoice(confirmCancel)}
                                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                            >
                                Cancel Invoice
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Cancelled Invoices Modal */}
            {showCancelledModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center p-4">
                    <div className="bg-white rounded-lg shadow-2xl w-full max-w-4xl max-h-full flex flex-col">
                        <div className="flex justify-between items-center p-4 border-b">
                            <h2 className="text-xl font-bold">Cancelled Invoices History</h2>
                            <button onClick={() => setShowCancelledModal(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                                </svg>
                            </button>
                        </div>
                        <div className="overflow-y-auto flex-grow p-4">
                            {cancelledInvoices.length === 0 ? (
                                <p className="text-gray-500">No cancelled invoices.</p>
                            ) : (
                                <table className="min-w-full bg-white">
                                    <thead className="bg-gray-200 text-gray-600 uppercase text-sm leading-normal">
                                        <tr>
                                            <th className="py-3 px-6 text-left">Number</th>
                                            <th className="py-3 px-6 text-left">Client</th>
                                            <th className="py-3 px-6 text-center">Original Date</th>
                                            <th className="py-3 px-6 text-center">Cancelled On</th>
                                            <th className="py-3 px-6 text-right">Total</th>
                                            <th className="py-3 px-6 text-center">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="text-gray-600 text-sm font-light">
                                        {cancelledInvoices.map(doc => (
                                            <tr key={doc.id} className="border-b border-gray-200 hover:bg-gray-100">
                                                <td className="py-3 px-6 text-left">{doc.documentNumber}</td>
                                                <td className="py-3 px-6 text-left">{doc.client.name}</td>
                                                <td className="py-3 px-6 text-center">{doc.date.toDate().toLocaleDateString()}</td>
                                                <td className="py-3 px-6 text-center">
                                                    {doc.cancelledAt?.toDate().toLocaleDateString() || 'Unknown'}
                                                </td>
                                                <td className="py-3 px-6 text-right font-semibold">${doc.total.toFixed(2)}</td>
                                                <td className="py-3 px-6 text-center">
                                                    <div className="flex item-center justify-center gap-2">
                                                        <button
                                                            onClick={() => navigateTo('viewDocument', doc)}
                                                            className="text-gray-600 hover:text-indigo-600 font-medium py-1 px-2 rounded-lg text-sm"
                                                        >
                                                            View
                                                        </button>
                                                        <button
                                                            onClick={() => handleRestoreInvoice(doc.id)}
                                                            className="text-green-600 hover:text-green-800 font-medium py-1 px-2 rounded-lg text-sm"
                                                        >
                                                            Restore
                                                        </button>
                                                        <button
                                                            onClick={() => handlePermanentDelete(doc.id)}
                                                            className="text-red-600 hover:text-red-800 font-medium py-1 px-2 rounded-lg text-sm"
                                                        >
                                                            Delete Permanently
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Payment Modal */}
            {showPaymentModal && selectedInvoice && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-lg shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
                        {/* Header */}
                        <div className="bg-gradient-to-r from-green-600 to-emerald-600 text-white px-6 py-4">
                            <div className="flex justify-between items-center">
                                <div>
                                    <h2 className="text-2xl font-bold">Add Payment</h2>
                                    <p className="text-green-100 text-sm mt-1">
                                        Invoice #{selectedInvoice.invoiceNumber} - {selectedInvoice.client.name}
                                    </p>
                                </div>
                                <button
                                    onClick={() => {
                                        setShowPaymentModal(false);
                                        setSelectedInvoice(null);
                                    }}
                                    className="text-white hover:text-gray-200 transition-colors"
                                >
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                                    </svg>
                                </button>
                            </div>
                        </div>

                        {/* Content */}
                        <div className="p-6 overflow-y-auto flex-1">
                            {/* Invoice Summary */}
                            <div className="bg-gradient-to-br from-gray-50 to-gray-100 p-4 rounded-lg mb-6 border border-gray-200">
                                <div className="grid grid-cols-4 gap-4 text-sm">
                                    <div>
                                        <p className="text-gray-600 font-medium mb-1">Invoice Total</p>
                                        <p className="text-xl font-bold text-gray-900">${selectedInvoice.total.toFixed(2)}</p>
                                    </div>
                                    <div>
                                        <p className="text-gray-600 font-medium mb-1">Paid</p>
                                        <p className="text-xl font-bold text-green-600">${(selectedInvoice.totalPaid || 0).toFixed(2)}</p>
                                    </div>
                                    <div>
                                        <p className="text-gray-600 font-medium mb-1">Outstanding</p>
                                        <p className="text-xl font-bold text-red-600">
                                            ${(selectedInvoice.total - (selectedInvoice.totalPaid || 0)).toFixed(2)}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-gray-600 font-medium mb-1">Client Balance</p>
                                        <p className="text-xl font-bold text-blue-600">${clientBalance.toFixed(2)}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Payment Source Selection */}
                            {clientBalance > 0 && (
                                <div className="mb-6 bg-blue-50 border-2 border-blue-200 rounded-lg p-4">
                                    <p className="text-sm font-semibold text-blue-900 mb-3">Payment Source</p>
                                    <div className="space-y-2">
                                        <label className="flex items-center cursor-pointer">
                                            <input
                                                type="radio"
                                                name="paymentSource"
                                                checked={!payFromAccount}
                                                onChange={() => setPayFromAccount(false)}
                                                className="mr-2"
                                            />
                                            <span className="text-sm text-gray-700">New Payment (Cash/Bank Transfer/etc.)</span>
                                        </label>
                                        <label className="flex items-center cursor-pointer">
                                            <input
                                                type="radio"
                                                name="paymentSource"
                                                checked={payFromAccount}
                                                onChange={() => setPayFromAccount(true)}
                                                className="mr-2"
                                            />
                                            <span className="text-sm text-gray-700">
                                                Pay from Client Account Balance (${clientBalance.toFixed(2)} available)
                                            </span>
                                        </label>
                                    </div>
                                </div>
                            )}

                            {/* Payment Form */}
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                                        Payment Amount *
                                    </label>
                                    <input
                                        type="number"
                                        value={paymentAmount}
                                        onChange={(e) => setPaymentAmount(e.target.value)}
                                        step="0.01"
                                        min="0.01"
                                        max={payFromAccount ? Math.min(clientBalance, selectedInvoice.total - (selectedInvoice.totalPaid || 0)) : (selectedInvoice.total - (selectedInvoice.totalPaid || 0))}
                                        className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent text-lg"
                                        placeholder="0.00"
                                        required
                                    />
                                    <p className="text-xs text-gray-500 mt-1">
                                        {payFromAccount
                                            ? `Maximum from client balance: $${Math.min(clientBalance, selectedInvoice.total - (selectedInvoice.totalPaid || 0)).toFixed(2)}`
                                            : `Maximum: $${(selectedInvoice.total - (selectedInvoice.totalPaid || 0)).toFixed(2)}`
                                        }
                                    </p>
                                </div>

                                {!payFromAccount && (
                                    <>
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-700 mb-2">
                                                Payment Date *
                                            </label>
                                            <input
                                                type="date"
                                                value={paymentDate}
                                                onChange={(e) => setPaymentDate(e.target.value)}
                                                className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                                                required
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-semibold text-gray-700 mb-2">
                                                Payment Method *
                                            </label>
                                            <select
                                                value={paymentMethod}
                                                onChange={(e) => setPaymentMethod(e.target.value)}
                                                className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                                            >
                                                <option value="cash">Cash</option>
                                                <option value="bank_transfer">Bank Transfer</option>
                                                <option value="check">Check</option>
                                                <option value="credit_card">Credit Card</option>
                                                <option value="other">Other</option>
                                            </select>
                                        </div>

                                        <div>
                                            <label className="block text-sm font-semibold text-gray-700 mb-2">
                                                Reference / Transaction ID
                                            </label>
                                            <input
                                                type="text"
                                                value={paymentReference}
                                                onChange={(e) => setPaymentReference(e.target.value)}
                                                className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                                                placeholder="e.g., Check #1234, Transfer ID"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-semibold text-gray-700 mb-2">
                                                Notes
                                            </label>
                                            <textarea
                                                value={paymentNote}
                                                onChange={(e) => setPaymentNote(e.target.value)}
                                                rows={3}
                                                className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                                                placeholder="Additional notes about this payment"
                                            />
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="bg-gray-50 px-6 py-4 flex justify-end space-x-3 border-t">
                            <button
                                onClick={() => {
                                    setShowPaymentModal(false);
                                    setSelectedInvoice(null);
                                }}
                                className="px-6 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition-colors font-medium"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleAddPayment}
                                disabled={!paymentAmount || parseFloat(paymentAmount) <= 0 || isSubmittingPayment}
                                className="px-6 py-2 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg hover:from-green-700 hover:to-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium shadow-md"
                            >
                                {isSubmittingPayment ? 'Processing...' : 'Add Payment'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default InvoicesPage;
