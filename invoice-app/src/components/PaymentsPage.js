import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { collection, query, where, onSnapshot, addDoc, updateDoc, doc, getDocs, orderBy, deleteDoc, limit as firestoreLimit, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import { migratePayments, verifyMigration, repairMigratedPayments } from '../utils/paymentMigration';

const PaymentsPage = () => {
    const [payments, setPayments] = useState([]);
    const [clients, setClients] = useState([]);
    const [documents, setDocuments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showAddForm, setShowAddForm] = useState(false);
    const [editingPayment, setEditingPayment] = useState(null);
    const [feedback, setFeedback] = useState({ type: '', message: '' });
    const [migrationStatus, setMigrationStatus] = useState(null);
    const [showMigrationModal, setShowMigrationModal] = useState(false);

    // Form state
    const [formData, setFormData] = useState({
        clientId: '',
        documentId: '',
        amount: '',
        paymentDate: new Date().toISOString().split('T')[0],
        paymentMethod: 'cash',
        reference: '',
        notes: '',
        paymentType: 'toDocument' // 'toDocument' or 'toClient' (unallocated)
    });
    const [clientFilter, setClientFilter] = useState('all'); // Filter payments by client
    const [showClientSettlement, setShowClientSettlement] = useState(false);
    const [selectedClientForSettlement, setSelectedClientForSettlement] = useState(null);
    const [showClientBalances, setShowClientBalances] = useState(false);
    const [settlementInProgress, setSettlementInProgress] = useState(false);
    const [customSettlementAmounts, setCustomSettlementAmounts] = useState({});
    const [clientSearchTerm, setClientSearchTerm] = useState('');
    const [isClientDropdownVisible, setIsClientDropdownVisible] = useState(false);
    const [selectedClient, setSelectedClient] = useState(null);
    const clientDropdownRef = React.useRef(null);
    const [selectedPaymentForView, setSelectedPaymentForView] = useState(null);
    const [showPaymentReceipt, setShowPaymentReceipt] = useState(false);
    const [paymentSearchTerm, setPaymentSearchTerm] = useState('');
    const [displayedPaymentsLimit, setDisplayedPaymentsLimit] = useState(20);
    const [userSettings, setUserSettings] = useState(null);

    // Handle click outside client dropdown
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (clientDropdownRef.current && !clientDropdownRef.current.contains(event.target)) {
                setIsClientDropdownVisible(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    // Fetch user settings for receipt
    useEffect(() => {
        const fetchUserSettings = async () => {
            if (!auth.currentUser) return;
            const settingsRef = doc(db, 'settings', auth.currentUser.uid);
            try {
                const docSnap = await getDoc(settingsRef);
                if (docSnap.exists()) {
                    setUserSettings(docSnap.data());
                }
            } catch (error) {
                console.error("Error fetching user settings:", error);
            }
        };
        fetchUserSettings();
    }, []);

    useEffect(() => {
        let unsubscribePayments = null;

        const fetchData = async () => {
            try {
                if (!auth.currentUser) return;

                // Check migration status first (lightweight check)
                const migrationCheck = await verifyMigration(auth.currentUser.uid);
                setMigrationStatus(migrationCheck);

                // Fetch clients (usually small dataset) - use snapshot for real-time updates
                const clientsQuery = query(collection(db, `clients/${auth.currentUser.uid}/userClients`), orderBy('name'));
                const clientsSnapshot = await getDocs(clientsQuery);
                const clientsData = clientsSnapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));
                setClients(clientsData);

                // Fetch all documents and filter in memory (no index required)
                const documentsQuery = query(
                    collection(db, `documents/${auth.currentUser.uid}/userDocuments`)
                );
                const documentsSnapshot = await getDocs(documentsQuery);
                const documentsData = documentsSnapshot.docs
                    .map(doc => ({
                        id: doc.id,
                        ...doc.data()
                    }))
                    .filter(doc => doc.type === 'invoice') // Filter invoices in memory
                    .sort((a, b) => b.date?.toDate?.() - a.date?.toDate?.()); // Sort by date desc
                setDocuments(documentsData);

                // Listen to payments (real-time) - this is the main data source
                // CRITICAL FIX: Filter payments by current user to ensure data isolation
                // Note: We sort in JavaScript to avoid needing a Firebase composite index
                const paymentsQuery = query(
                    collection(db, 'payments'),
                    where('userId', '==', auth.currentUser.uid)
                );

                unsubscribePayments = onSnapshot(paymentsQuery, (snapshot) => {
                    const paymentsData = snapshot.docs.map(doc => ({
                        id: doc.id,
                        ...doc.data()
                    }));
                    // Sort by paymentDate in JavaScript (newest first)
                    paymentsData.sort((a, b) => {
                        const dateA = a.paymentDate?.toDate ? a.paymentDate.toDate() : new Date(a.paymentDate);
                        const dateB = b.paymentDate?.toDate ? b.paymentDate.toDate() : new Date(b.paymentDate);
                        return dateB - dateA;
                    });
                    setPayments(paymentsData);
                    setLoading(false);
                }, (error) => {
                    console.error('Error fetching payments:', error);
                    setLoading(false);
                });

            } catch (error) {
                console.error('Error fetching data:', error);
                setFeedback({ type: 'error', message: 'Failed to load data' });
                setLoading(false);
            }
        };

        fetchData();

        return () => {
            if (unsubscribePayments) unsubscribePayments();
        };
    }, []);

    const handleMigration = async () => {
        if (!auth.currentUser) return;
        
        setLoading(true);
        setFeedback({ type: '', message: '' });
        
        try {
            const result = await migratePayments(auth.currentUser.uid);
            if (result.success) {
                setFeedback({ 
                    type: 'success', 
                    message: `Migration completed successfully! Migrated ${result.migratedCount} payments.` 
                });
                setShowMigrationModal(false);
                
                // Refresh migration status
                const migrationCheck = await verifyMigration(auth.currentUser.uid);
                setMigrationStatus(migrationCheck);
            } else {
                setFeedback({ type: 'error', message: `Migration failed: ${result.error}` });
            }
        } catch (error) {
            console.error('Migration error:', error);
            setFeedback({ type: 'error', message: 'Migration failed. Please try again.' });
        } finally {
            setLoading(false);
        }
    };

    const handleRepair = async () => {
        if (!auth.currentUser) return;

        setLoading(true);
        setFeedback({ type: '', message: '' });

        try {
            const result = await repairMigratedPayments(auth.currentUser.uid);
            if (result.success) {
                const totalFixed = (result.emergencyFixCount || 0) + result.repairedCount;
                setFeedback({
                    type: 'success',
                    message: `Repair completed successfully! Added userId to ${result.emergencyFixCount || 0} payments. Fixed ${result.repairedCount} payment details. Corrected settlement status on ${result.fixedSettlement} payments.`
                });
            } else {
                setFeedback({ type: 'error', message: `Repair failed: ${result.error}` });
            }
        } catch (error) {
            console.error('Repair error:', error);
            setFeedback({ type: 'error', message: 'Repair failed. Please try again.' });
        } finally {
            setLoading(false);
        }
    };

    const handleDeletePayment = async (paymentId, documentId) => {
        if (!window.confirm('Are you sure you want to delete this payment?')) return;
        
        setLoading(true);
        setFeedback({ type: '', message: '' });
        
        try {
            // Delete the payment
            await deleteDoc(doc(db, 'payments', paymentId));
            
            // Update document payment status
            await updateDocumentPaymentStatus(documentId);
            
            setFeedback({ type: 'success', message: 'Payment deleted successfully!' });
        } catch (error) {
            console.error('Error deleting payment:', error);
            setFeedback({ type: 'error', message: 'Failed to delete payment' });
        } finally {
            setLoading(false);
        }
    };

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setFeedback({ type: '', message: '' });

        try {
            // Validate required fields
            if (!formData.clientId || !formData.amount) {
                setFeedback({ type: 'error', message: 'Please select a client and enter an amount.' });
                setLoading(false);
                return;
            }

            // Payment type is auto-detected: if documentId exists, it's toDocument, otherwise toClient
            const paymentType = formData.documentId ? 'toDocument' : 'toClient';

            if (parseFloat(formData.amount) <= 0) {
                setFeedback({ type: 'error', message: 'Payment amount must be greater than 0.' });
                setLoading(false);
                return;
            }

            const paymentData = {
                userId: auth.currentUser.uid, // CRITICAL: Add userId for data isolation
                clientId: formData.clientId,
                documentId: paymentType === 'toDocument' ? formData.documentId : null,
                amount: parseFloat(formData.amount),
                paymentDate: new Date(formData.paymentDate),
                paymentMethod: formData.paymentMethod,
                reference: formData.reference,
                notes: formData.notes,
                settledToDocument: paymentType === 'toDocument', // true if allocated to document, false if on client account
                createdAt: new Date(),
                updatedAt: new Date()
            };


            if (editingPayment) {
                // Update existing payment
                await updateDoc(doc(db, 'payments', editingPayment.id), paymentData);
                setFeedback({ type: 'success', message: 'Payment updated successfully!' });
            } else {
                // Add new payment
                await addDoc(collection(db, 'payments'), paymentData);

                if (paymentType === 'toDocument') {
                    setFeedback({ type: 'success', message: 'Payment added and allocated to invoice successfully!' });
                } else {
                    setFeedback({ type: 'success', message: 'Payment added to client account successfully!' });
                }
            }

            // Update document payment status if payment is allocated to document
            if (paymentType === 'toDocument' && formData.documentId) {
                await updateDocumentPaymentStatus(formData.documentId);
            }

            // Reset form
            setFormData({
                clientId: '',
                documentId: '',
                amount: '',
                paymentDate: new Date().toISOString().split('T')[0],
                paymentMethod: 'cash',
                reference: '',
                notes: '',
                paymentType: 'toDocument'
            });
            setSelectedClient(null);
            setClientSearchTerm('');
            setShowAddForm(false);
            setEditingPayment(null);
        } catch (error) {
            console.error('Error saving payment:', error);
            setFeedback({ type: 'error', message: 'Failed to save payment' });
        } finally {
            setLoading(false);
        }
    };

    const updateDocumentPaymentStatus = async (documentId) => {
        try {
            // Get all payments for this document (filtered by user)
            const paymentsQuery = query(
                collection(db, 'payments'),
                where('userId', '==', auth.currentUser.uid),
                where('documentId', '==', documentId)
            );
            const paymentsSnapshot = await getDocs(paymentsQuery);
            
            let totalPaid = 0;
            paymentsSnapshot.forEach(doc => {
                totalPaid += doc.data().amount;
            });

            // Update the document with correct path
            const documentRef = doc(db, `documents/${auth.currentUser.uid}/userDocuments`, documentId);
            await updateDoc(documentRef, {
                totalPaid: totalPaid,
                paid: totalPaid >= (documents.find(d => d.id === documentId)?.total || 0),
                lastPaymentDate: new Date(),
                updatedAt: new Date()
            });
        } catch (error) {
            console.error('Error updating document payment status:', error);
        }
    };

    const getClientName = (payment) => {
        // First try to get from payment data (for migrated payments)
        if (payment.clientName) {
            return payment.clientName;
        }
        // Then try to find in clients list
        const client = clients.find(c => c.id === payment.clientId);
        return client ? client.name : `Client ID: ${payment.clientId}`;
    };

    const getDocumentInfo = (documentId) => {
        const document = documents.find(d => d.id === documentId);
        if (!document) return { type: 'Unknown', number: 'N/A', total: 0 };
        
        return {
            type: document.type || 'Invoice',
            number: document.invoiceNumber || document.proformaNumber || document.documentNumber || 'N/A',
            total: document.total || 0
        };
    };

    const getFilteredDocuments = (clientId) => {
        // IMPORTANT: Only show invoices for payment allocation (not proformas)
        // Proformas should not have payments - payments should be added to client account instead
        // Also exclude fully paid/settled invoices
        if (!clientId) {
            // Show all active unpaid invoices if no client selected
            const filtered = documents.filter(doc => {
                const totalPaid = doc.totalPaid || 0;
                const outstanding = doc.total - totalPaid;
                return (
                    doc.type === 'invoice' && // Only invoices
                    !doc.cancelled &&
                    !doc.deleted &&
                    !doc.transformedToInvoice &&
                    !doc.convertedToInvoice &&
                    !doc.converted &&
                    outstanding > 0.01 // Has outstanding balance (not fully paid)
                );
            });
            return filtered;
        }

        // Show only unpaid invoices for the selected client
        const filtered = documents.filter(doc => {
            const totalPaid = doc.totalPaid || 0;
            const outstanding = doc.total - totalPaid;
            return (
                doc.type === 'invoice' && // Only invoices
                doc.client && doc.client.id === clientId &&
                !doc.cancelled &&
                !doc.deleted &&
                !doc.transformedToInvoice &&
                !doc.convertedToInvoice &&
                !doc.converted &&
                outstanding > 0.01 // Has outstanding balance (not fully paid)
            );
        });
        return filtered;
    };

    const getFilteredPayments = () => {
        let filtered = payments;

        // Filter by client if selected
        if (clientFilter !== 'all') {
            filtered = filtered.filter(payment => payment.clientId === clientFilter);
        }

        // Filter by search term if provided
        if (paymentSearchTerm) {
            const search = paymentSearchTerm.toLowerCase();
            filtered = filtered.filter(payment => {
                const clientName = getClientName(payment).toLowerCase();
                const docInfo = payment.documentId ? getDocumentInfo(payment.documentId) : null;
                const amount = payment.amount.toString();
                const method = payment.paymentMethod.toLowerCase();
                const reference = (payment.reference || '').toLowerCase();
                const notes = (payment.notes || '').toLowerCase();

                return clientName.includes(search) ||
                       amount.includes(search) ||
                       method.includes(search) ||
                       reference.includes(search) ||
                       notes.includes(search) ||
                       (docInfo && docInfo.number.toLowerCase().includes(search));
            });
        }

        // Sort by date (newest first)
        filtered.sort((a, b) => {
            const dateA = a.paymentDate?.toDate ? a.paymentDate.toDate() : new Date(a.paymentDate);
            const dateB = b.paymentDate?.toDate ? b.paymentDate.toDate() : new Date(b.paymentDate);
            return dateB - dateA;
        });

        // If no search term, limit to first 20, otherwise show all search results
        if (!paymentSearchTerm) {
            return filtered.slice(0, displayedPaymentsLimit);
        }

        return filtered;
    };

    // Memoized client payments lookup
    const getClientPayments = useCallback((clientId) => {
        return payments.filter(payment => payment.clientId === clientId);
    }, [payments]);

    // Memoized client documents lookup
    const getClientDocuments = useCallback((clientId) => {
        // Only return invoices (not proformas)
        return documents.filter(doc =>
            doc.type === 'invoice' && // Only invoices
            doc.client && doc.client.id === clientId &&
            !doc.cancelled &&
            !doc.deleted &&
            !doc.transformedToInvoice &&
            !doc.convertedToInvoice &&
            !doc.converted
        );
    }, [documents]);

    // Memoized client account balances
    const clientBalancesMap = useMemo(() => {
        const balances = {};
        clients.forEach(client => {
            const clientPayments = payments.filter(payment => payment.clientId === client.id);
            const unallocatedPayments = clientPayments
                .filter(payment => !payment.settledToDocument)
                .reduce((sum, payment) => sum + payment.amount, 0);
            balances[client.id] = unallocatedPayments;
        });
        return balances;
    }, [payments, clients]);

    // Calculate client account balance (unallocated payments)
    const getClientAccountBalance = useCallback((clientId) => {
        return clientBalancesMap[clientId] || 0;
    }, [clientBalancesMap]);

    // Get total outstanding amount for a client (across all invoices)
    const getClientOutstandingAmount = useCallback((clientId) => {
        const clientDocs = getClientDocuments(clientId);
        return clientDocs.reduce((sum, doc) => {
            const outstanding = doc.total - (doc.totalPaid || 0);
            return sum + Math.max(0, outstanding);
        }, 0);
    }, [getClientDocuments]);

    const getOutstandingAmount = (documentId) => {
        const document = documents.find(d => d.id === documentId);
        if (!document) return 0;
        const totalPaid = document.totalPaid || 0;
        return Math.max(0, document.total - totalPaid);
    };

    const handleClientChange = (clientId) => {
        setFormData(prev => ({
            ...prev,
            clientId,
            documentId: '', // Reset document when client changes
            amount: '' // Reset amount when client changes
        }));
    };

    const handleDocumentChange = (documentId) => {
        const outstanding = getOutstandingAmount(documentId);
        const selectedDocument = documents.find(d => d.id === documentId);

        // Auto-select client when invoice is chosen
        if (selectedDocument && selectedDocument.client) {
            const client = clients.find(c => c.id === selectedDocument.client.id);
            if (client) {
                setSelectedClient(client);
                setClientSearchTerm(client.name);
                setFormData(prev => ({
                    ...prev,
                    clientId: client.id,
                    documentId,
                    amount: outstanding > 0 ? outstanding.toFixed(2) : ''
                }));
                return;
            }
        }

        setFormData(prev => ({
            ...prev,
            documentId,
            amount: outstanding > 0 ? outstanding.toFixed(2) : ''
        }));
    };

    const handleSettleDocument = async (clientId, documentId, amount) => {
        // Prevent double-click
        if (settlementInProgress) return;

        try {
            setSettlementInProgress(true);
            setLoading(true);

            // Check if client has enough unallocated balance
            const clientBalance = getClientAccountBalance(clientId);
            const settleAmount = parseFloat(amount);

            if (clientBalance < settleAmount) {
                setFeedback({
                    type: 'error',
                    message: `Insufficient client balance. Available: $${clientBalance.toFixed(2)}, Required: $${settleAmount.toFixed(2)}`
                });
                setLoading(false);
                return;
            }

            // Get unallocated payments for this client
            const clientPayments = payments.filter(p => p.clientId === clientId && !p.settledToDocument);

            // Sort by date (oldest first)
            clientPayments.sort((a, b) => {
                const dateA = a.paymentDate?.toDate ? a.paymentDate.toDate() : new Date(a.paymentDate);
                const dateB = b.paymentDate?.toDate ? b.paymentDate.toDate() : new Date(b.paymentDate);
                return dateA - dateB;
            });

            // Allocate payments to this invoice (FIFO - First In First Out)
            let remainingToSettle = settleAmount;
            const paymentsToUpdate = [];

            for (const payment of clientPayments) {
                if (remainingToSettle <= 0) break;

                const amountToAllocate = Math.min(payment.amount, remainingToSettle);

                if (amountToAllocate === payment.amount) {
                    // Full payment allocated to this invoice
                    paymentsToUpdate.push({
                        id: payment.id,
                        updates: {
                            documentId: documentId,
                            settledToDocument: true,
                            settledAt: new Date(),
                            reference: payment.reference || `Settled to invoice`,
                            notes: (payment.notes || '') + ` | Allocated to invoice ${documentId}`,
                            updatedAt: new Date()
                        }
                    });
                    remainingToSettle -= amountToAllocate;
                } else {
                    // Partial payment - need to split
                    // Update original payment to allocated portion
                    paymentsToUpdate.push({
                        id: payment.id,
                        updates: {
                            amount: amountToAllocate,
                            documentId: documentId,
                            settledToDocument: true,
                            settledAt: new Date(),
                            reference: payment.reference || `Settled to invoice`,
                            notes: (payment.notes || '') + ` | Partially allocated to invoice`,
                            updatedAt: new Date()
                        }
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

            // Update all allocated payments
            for (const paymentUpdate of paymentsToUpdate) {
                await updateDoc(doc(db, 'payments', paymentUpdate.id), paymentUpdate.updates);
            }

            // Update document payment status
            await updateDocumentPaymentStatus(documentId);

            setFeedback({
                type: 'success',
                message: `Invoice settled successfully! Allocated ${paymentsToUpdate.length} payment(s) from client account.`
            });
            setShowClientSettlement(false);
            setSelectedClientForSettlement(null);

        } catch (error) {
            console.error('Error settling document:', error);
            setFeedback({ type: 'error', message: 'Failed to settle invoice. Please try again.' });
        } finally {
            setLoading(false);
            setSettlementInProgress(false);
        }
    };

    if (loading) {
        return <div className="flex justify-center items-center h-64">Loading payments...</div>;
    }

    return (
        <div className="max-w-7xl mx-auto">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold text-gray-800">Payments</h1>
                <div className="flex space-x-3">
                    {migrationStatus?.migrationNeeded && (
                        <button
                            onClick={() => setShowMigrationModal(true)}
                            className="bg-yellow-600 hover:bg-yellow-700 text-white font-medium py-2 px-4 rounded-lg shadow-md"
                        >
                            Migrate Old Payments
                        </button>
                    )}
                    <button
                        onClick={handleRepair}
                        className="bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-4 rounded-lg shadow-md"
                        title="Click to add userId to all your existing payments (run once per account)"
                    >
                        Fix Payment Data (Run Once)
                    </button>
                </div>
            </div>

            {feedback.message && (
                <div className={`mb-6 p-4 rounded-md ${feedback.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    {feedback.message}
                </div>
            )}

            {/* Client Filter */}
            <div className="bg-white p-4 rounded-lg shadow-lg mb-6">
                <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                        <label className="text-sm font-medium text-gray-700">Filter by Client:</label>
                        <select
                            value={clientFilter}
                            onChange={(e) => setClientFilter(e.target.value)}
                            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                            <option value="all">All Clients</option>
                            {clients.map(client => (
                                <option key={client.id} value={client.id}>{client.name}</option>
                            ))}
                        </select>
                    </div>
                    <div className="flex space-x-2">
                        <button
                            onClick={() => setShowClientSettlement(true)}
                            className="bg-purple-600 hover:bg-purple-700 text-white font-medium py-2 px-4 rounded-lg shadow-md"
                        >
                            Client Settlement
                        </button>
                        <button
                            onClick={() => setShowAddForm(true)}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 px-4 rounded-lg shadow-md"
                        >
                            Add Payment
                        </button>
                    </div>
                </div>
            </div>

            {/* Add/Edit Payment Form */}
            {showAddForm && (
                <div className="bg-white p-6 rounded-lg shadow-lg mb-6">
                    <h2 className="text-xl font-semibold text-gray-800 mb-4">
                        {editingPayment ? 'Edit Payment' : 'Add New Payment'}
                    </h2>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="grid grid-cols-1 gap-4">
                            <div ref={clientDropdownRef}>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Client *</label>
                                <div className="relative">
                                    <input
                                        type="text"
                                        placeholder="Search clients by name, email, or location..."
                                        value={selectedClient ? selectedClient.name : clientSearchTerm}
                                        onChange={(e) => {
                                            setClientSearchTerm(e.target.value);
                                            setSelectedClient(null);
                                            setFormData(prev => ({ ...prev, clientId: '', documentId: '' }));
                                            setIsClientDropdownVisible(true);
                                        }}
                                        onFocus={() => setIsClientDropdownVisible(true)}
                                        required
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    />
                                    {isClientDropdownVisible && (
                                        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
                                            {clients
                                                .filter(client =>
                                                    client.name.toLowerCase().includes(clientSearchTerm.toLowerCase()) ||
                                                    client.email?.toLowerCase().includes(clientSearchTerm.toLowerCase()) ||
                                                    client.location?.toLowerCase().includes(clientSearchTerm.toLowerCase())
                                                )
                                                .map(client => {
                                                    const balance = getClientAccountBalance(client.id);
                                                    return (
                                                        <div
                                                            key={client.id}
                                                            onClick={() => {
                                                                setSelectedClient(client);
                                                                setClientSearchTerm(client.name);
                                                                handleClientChange(client.id);
                                                                setIsClientDropdownVisible(false);
                                                            }}
                                                            className="p-3 hover:bg-gray-100 cursor-pointer border-b"
                                                        >
                                                            <div className="font-medium">{client.name}</div>
                                                            <div className="text-sm text-gray-600">
                                                                {client.email && `${client.email} | `}
                                                                {client.location && `${client.location} | `}
                                                                {balance > 0 && <span className="text-green-600 font-semibold">Balance: ${balance.toFixed(2)}</span>}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            {clients.filter(client =>
                                                client.name.toLowerCase().includes(clientSearchTerm.toLowerCase()) ||
                                                client.email?.toLowerCase().includes(clientSearchTerm.toLowerCase()) ||
                                                client.location?.toLowerCase().includes(clientSearchTerm.toLowerCase())
                                            ).length === 0 && (
                                                <div className="p-3 text-gray-500 text-center">No clients found</div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Invoice (Optional)
                                </label>
                                <select
                                    name="documentId"
                                    value={formData.documentId}
                                    onChange={(e) => {
                                        handleDocumentChange(e.target.value);
                                        // Auto-detect payment type based on selection
                                        setFormData(prev => ({
                                            ...prev,
                                            documentId: e.target.value,
                                            paymentType: e.target.value ? 'toDocument' : 'toClient'
                                        }));
                                    }}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    disabled={!formData.clientId}
                                >
                                    <option value="">-- No Invoice (Add to Client Account) --</option>
                                    {getFilteredDocuments(formData.clientId).map(doc => {
                                        const docInfo = getDocumentInfo(doc.id);
                                        const outstanding = getOutstandingAmount(doc.id);
                                        return (
                                            <option key={doc.id} value={doc.id}>
                                                {docInfo.number} - {selectedClient?.name || 'Client'} - ${docInfo.total.toFixed(2)} (Due: ${outstanding.toFixed(2)})
                                            </option>
                                        );
                                    })}
                                </select>
                                <p className="text-xs text-gray-500 mt-1">
                                    {formData.documentId
                                        ? '✓ Payment will be allocated directly to the selected invoice'
                                        : '→ Payment will be added to client account balance for later allocation'}
                                </p>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Amount</label>
                                <input
                                    type="number"
                                    name="amount"
                                    value={formData.amount}
                                    onChange={handleInputChange}
                                    step="0.01"
                                    min="0"
                                    required
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    placeholder="0.00"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Payment Date</label>
                                <input
                                    type="date"
                                    name="paymentDate"
                                    value={formData.paymentDate}
                                    onChange={handleInputChange}
                                    required
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method</label>
                                <select
                                    name="paymentMethod"
                                    value={formData.paymentMethod}
                                    onChange={handleInputChange}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                >
                                    <option value="cash">Cash</option>
                                    <option value="bank_transfer">Bank Transfer</option>
                                    <option value="check">Check</option>
                                    <option value="credit_card">Credit Card</option>
                                    <option value="other">Other</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Reference</label>
                                <input
                                    type="text"
                                    name="reference"
                                    value={formData.reference}
                                    onChange={handleInputChange}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    placeholder="Transaction reference"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                            <textarea
                                name="notes"
                                value={formData.notes}
                                onChange={handleInputChange}
                                rows={3}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                placeholder="Additional notes"
                            />
                        </div>

                        <div className="flex justify-end space-x-4">
                            <button
                                type="button"
                                onClick={() => {
                                    setShowAddForm(false);
                                    setEditingPayment(null);
                                    setFormData({
                                        clientId: '',
                                        documentId: '',
                                        amount: '',
                                        paymentDate: new Date().toISOString().split('T')[0],
                                        paymentMethod: 'bank_transfer',
                                        reference: '',
                                        notes: ''
                                    });
                                }}
                                className="px-4 py-2 text-gray-600 bg-gray-200 rounded-md hover:bg-gray-300"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={loading}
                                className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:bg-indigo-300"
                            >
                                {loading ? 'Saving...' : (editingPayment ? 'Update Payment' : 'Add Payment')}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* Client Balances Summary */}
            <div className="bg-white rounded-lg shadow-lg overflow-hidden mb-6">
                <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                    <h2 className="text-lg font-semibold text-gray-800">Client Account Balances</h2>
                    <button
                        onClick={() => setShowClientBalances(!showClientBalances)}
                        className="text-indigo-600 hover:text-indigo-800 text-sm font-medium"
                    >
                        {showClientBalances ? 'Hide' : 'Show'}
                    </button>
                </div>
                {showClientBalances && (
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Client</th>
                                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Unallocated Balance</th>
                                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Total Outstanding</th>
                                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Unpaid Invoices</th>
                                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {clients
                                    .filter(client => getClientAccountBalance(client.id) > 0)
                                    .map(client => {
                                        const balance = getClientAccountBalance(client.id);
                                        const outstanding = getClientOutstandingAmount(client.id);
                                        const unpaidInvoices = getClientDocuments(client.id).filter(doc => (doc.totalPaid || 0) < doc.total);

                                        return (
                                            <tr key={client.id} className="hover:bg-gray-50">
                                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                                    {client.name}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-green-600 text-right">
                                                    ${balance.toFixed(2)}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-red-600 text-right">
                                                    ${outstanding.toFixed(2)}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
                                                    {unpaidInvoices.length}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-center">
                                                    {balance > 0 && outstanding > 0 && (
                                                        <button
                                                            onClick={() => {
                                                                setSelectedClientForSettlement(client);
                                                                setShowClientSettlement(true);
                                                            }}
                                                            className="text-indigo-600 hover:text-indigo-900 font-medium"
                                                        >
                                                            Settle Invoices
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                {clients.filter(client => getClientAccountBalance(client.id) > 0).length === 0 && (
                                    <tr>
                                        <td colSpan="5" className="px-6 py-4 text-center text-sm text-gray-500">
                                            No clients with unallocated balance
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Client Stats when filtering */}
            {clientFilter !== 'all' && (
                <div className="bg-gradient-to-r from-indigo-50 to-blue-50 border border-indigo-200 rounded-lg p-4 mb-6">
                    <h3 className="text-lg font-semibold text-indigo-900 mb-3">
                        {clients.find(c => c.id === clientFilter)?.name || 'Client'} - Payment Summary
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-white rounded-lg p-3 shadow-sm">
                            <p className="text-xs text-gray-600">Total Paid</p>
                            <p className="text-xl font-bold text-green-600">
                                ${getClientPayments(clientFilter).reduce((sum, p) => sum + p.amount, 0).toFixed(2)}
                            </p>
                        </div>
                        <div className="bg-white rounded-lg p-3 shadow-sm">
                            <p className="text-xs text-gray-600">Unallocated Balance</p>
                            <p className="text-xl font-bold text-blue-600">
                                ${getClientAccountBalance(clientFilter).toFixed(2)}
                            </p>
                        </div>
                        <div className="bg-white rounded-lg p-3 shadow-sm">
                            <p className="text-xs text-gray-600">Total Outstanding</p>
                            <p className="text-xl font-bold text-red-600">
                                ${getClientOutstandingAmount(clientFilter).toFixed(2)}
                            </p>
                        </div>
                        <div className="bg-white rounded-lg p-3 shadow-sm">
                            <p className="text-xs text-gray-600">Payments Count</p>
                            <p className="text-xl font-bold text-gray-800">
                                {getClientPayments(clientFilter).length}
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* Payments List */}
            <div className="bg-white rounded-lg shadow-lg overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200">
                    <div className="flex justify-between items-center">
                        <h2 className="text-lg font-semibold text-gray-800">Payment History</h2>
                        <input
                            type="text"
                            placeholder="Search payments..."
                            value={paymentSearchTerm}
                            onChange={(e) => setPaymentSearchTerm(e.target.value)}
                            className="px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 w-64"
                        />
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Client</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Invoice</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Method</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reference</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {getFilteredPayments().map(payment => {
                                const clientName = getClientName(payment);
                                const docInfo = payment.documentId ? getDocumentInfo(payment.documentId) : null;
                                const isAllocated = payment.settledToDocument;

                                return (
                                    <tr
                                        key={payment.id}
                                        className="hover:bg-indigo-50 cursor-pointer transition-colors"
                                        onClick={() => {
                                            setSelectedPaymentForView(payment);
                                            setShowPaymentReceipt(true);
                                        }}
                                    >
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                            {payment.paymentDate?.toDate ?
                                                payment.paymentDate.toDate().toLocaleDateString() :
                                                new Date(payment.paymentDate).toLocaleDateString()
                                            }
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                            {clientName}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                                isAllocated ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'
                                            }`}>
                                                {isAllocated ? 'Invoice Payment' : 'Client Account'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                            {docInfo ? (
                                                <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                                    docInfo.type === 'Invoice' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'
                                                }`}>
                                                    {docInfo.type} #{docInfo.number}
                                                </span>
                                            ) : (
                                                <span className="text-gray-400">-</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-green-600">
                                            ${payment.amount.toFixed(2)}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 capitalize">
                                            {payment.paymentMethod.replace('_', ' ')}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                            {payment.reference || '-'}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                            <div className="flex space-x-2" onClick={(e) => e.stopPropagation()}>
                                                <button
                                                    onClick={() => {
                                                        setEditingPayment(payment);

                                                        // Find and pre-select client
                                                        const client = clients.find(c => c.id === payment.clientId);
                                                        if (client) {
                                                            setSelectedClient(client);
                                                            setClientSearchTerm(client.name);
                                                        }

                                                        setFormData({
                                                            clientId: payment.clientId,
                                                            documentId: payment.documentId || '',
                                                            amount: payment.amount,
                                                            paymentDate: payment.paymentDate?.toDate ?
                                                                payment.paymentDate.toDate().toISOString().split('T')[0] :
                                                                new Date(payment.paymentDate).toISOString().split('T')[0],
                                                            paymentMethod: payment.paymentMethod,
                                                            reference: payment.reference || '',
                                                            notes: payment.notes || '',
                                                            paymentType: payment.settledToDocument ? 'toDocument' : 'toClient'
                                                        });
                                                        setShowAddForm(true);
                                                    }}
                                                    className="text-indigo-600 hover:text-indigo-900"
                                                >
                                                    Edit
                                                </button>
                                                <button
                                                    onClick={() => handleDeletePayment(payment.id, payment.documentId)}
                                                    className="text-red-600 hover:text-red-900"
                                                >
                                                    Delete
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {/* Load More Button */}
                {!paymentSearchTerm && payments.filter(p => clientFilter === 'all' || p.clientId === clientFilter).length > displayedPaymentsLimit && (
                    <div className="px-6 py-4 border-t border-gray-200 text-center">
                        <button
                            onClick={() => setDisplayedPaymentsLimit(prev => prev + 20)}
                            className="px-6 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors"
                        >
                            Load More Payments ({payments.filter(p => clientFilter === 'all' || p.clientId === clientFilter).length - displayedPaymentsLimit} remaining)
                        </button>
                    </div>
                )}
            </div>

            {/* Payment Receipt Modal */}
            {showPaymentReceipt && selectedPaymentForView && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={() => setShowPaymentReceipt(false)}>
                    <style>{`
                        @media print {
                            @page {
                                size: A4;
                                margin: 20mm;
                            }
                            body * {
                                visibility: hidden;
                            }
                            .print-receipt, .print-receipt * {
                                visibility: visible !important;
                            }
                            .print-receipt {
                                position: absolute;
                                left: 0;
                                top: 0;
                                width: 100%;
                                background: white !important;
                            }
                            .print-hidden {
                                display: none !important;
                            }
                        }
                    `}</style>
                    <div className="bg-white rounded-lg shadow-2xl w-[210mm] max-h-[90vh] overflow-y-auto print-receipt" onClick={(e) => e.stopPropagation()}>
                        {/* Receipt Header */}
                        <div className="bg-indigo-600 text-white px-8 py-6 flex justify-between items-center print:bg-white print:text-black print:border-b-2 print:border-gray-300 print-hidden">
                            <h2 className="text-xl font-bold">Payment Receipt</h2>
                            <button onClick={() => setShowPaymentReceipt(false)} className="text-white hover:text-gray-200">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                                </svg>
                            </button>
                        </div>

                        {/* Receipt Content */}
                        <div className="p-12 print:p-0">
                            {/* Company Header */}
                            <div className="mb-8 pb-6 border-b-2 border-gray-300">
                                <h3 className="text-3xl font-bold text-indigo-600 mb-1">Payment Receipt</h3>
                                <p className="text-lg text-gray-700 font-medium mb-4">{userSettings?.companyName || 'Your Company Name'}</p>
                                <p className="text-sm text-gray-600">Receipt #{selectedPaymentForView.id.substring(0, 8).toUpperCase()}</p>
                            </div>

                            {/* Payment Details */}
                            <div className="grid grid-cols-2 gap-6 mb-6">
                                <div>
                                    <h4 className="text-sm font-semibold text-gray-600 mb-2">PAYMENT FROM</h4>
                                    <p className="text-lg font-medium text-gray-900">{getClientName(selectedPaymentForView)}</p>
                                    {clients.find(c => c.id === selectedPaymentForView.clientId) && (
                                        <div className="text-sm text-gray-600 mt-1">
                                            {clients.find(c => c.id === selectedPaymentForView.clientId)?.email && (
                                                <p>{clients.find(c => c.id === selectedPaymentForView.clientId)?.email}</p>
                                            )}
                                            {clients.find(c => c.id === selectedPaymentForView.clientId)?.location && (
                                                <p>{clients.find(c => c.id === selectedPaymentForView.clientId)?.location}</p>
                                            )}
                                        </div>
                                    )}
                                </div>
                                <div>
                                    <h4 className="text-sm font-semibold text-gray-600 mb-2">PAYMENT DATE</h4>
                                    <p className="text-lg font-medium text-gray-900">
                                        {selectedPaymentForView.paymentDate?.toDate ?
                                            selectedPaymentForView.paymentDate.toDate().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) :
                                            new Date(selectedPaymentForView.paymentDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
                                        }
                                    </p>
                                </div>
                            </div>

                            {/* Payment Amount - Highlighted */}
                            <div className="bg-green-50 border-2 border-green-200 rounded-lg p-6 mb-6">
                                <div className="text-center">
                                    <p className="text-sm font-semibold text-green-700 mb-1">AMOUNT PAID</p>
                                    <p className="text-4xl font-bold text-green-600">${selectedPaymentForView.amount.toFixed(2)}</p>
                                </div>
                            </div>

                            {/* Payment Info Table */}
                            <div className="border border-gray-300 rounded-lg overflow-hidden mb-6">
                                <table className="min-w-full">
                                    <tbody className="divide-y divide-gray-200">
                                        <tr>
                                            <td className="px-4 py-3 bg-gray-50 text-sm font-semibold text-gray-700">Payment Method</td>
                                            <td className="px-4 py-3 text-sm text-gray-900 capitalize">{selectedPaymentForView.paymentMethod.replace('_', ' ')}</td>
                                        </tr>
                                        <tr>
                                            <td className="px-4 py-3 bg-gray-50 text-sm font-semibold text-gray-700">Payment Type</td>
                                            <td className="px-4 py-3 text-sm text-gray-900">
                                                {selectedPaymentForView.settledToDocument ? (
                                                    <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                                                        Invoice Payment
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                                                        Client Account
                                                    </span>
                                                )}
                                            </td>
                                        </tr>
                                        {selectedPaymentForView.documentId && (
                                            <tr>
                                                <td className="px-4 py-3 bg-gray-50 text-sm font-semibold text-gray-700">Invoice</td>
                                                <td className="px-4 py-3 text-sm text-gray-900">
                                                    {getDocumentInfo(selectedPaymentForView.documentId)?.number || 'N/A'}
                                                </td>
                                            </tr>
                                        )}
                                        {selectedPaymentForView.reference && (
                                            <tr>
                                                <td className="px-4 py-3 bg-gray-50 text-sm font-semibold text-gray-700">Reference</td>
                                                <td className="px-4 py-3 text-sm text-gray-900">{selectedPaymentForView.reference}</td>
                                            </tr>
                                        )}
                                        {selectedPaymentForView.notes && (
                                            <tr>
                                                <td className="px-4 py-3 bg-gray-50 text-sm font-semibold text-gray-700">Notes</td>
                                                <td className="px-4 py-3 text-sm text-gray-900">{selectedPaymentForView.notes}</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            {/* Footer */}
                            <div className="text-center text-sm text-gray-500 mb-6">
                                <p>Thank you for your payment!</p>
                                <p className="mt-2">Generated on {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
                            </div>

                            {/* Action Buttons */}
                            <div className="flex justify-center space-x-4 print-hidden">
                                <button
                                    onClick={() => window.print()}
                                    className="px-6 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors flex items-center"
                                >
                                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path>
                                    </svg>
                                    Print / Save as PDF
                                </button>
                                <button
                                    onClick={() => setShowPaymentReceipt(false)}
                                    className="px-6 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 transition-colors"
                                >
                                    Close
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Migration Modal */}
            {showMigrationModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white p-6 rounded-lg shadow-lg max-w-md w-full mx-4">
                        <h3 className="text-lg font-semibold text-gray-800 mb-4">Migrate Old Payments</h3>
                        <p className="text-gray-600 mb-4">
                            We found {migrationStatus?.documentsWithOldPayments?.length || 0} documents with old payment data. 
                            This will migrate them to the new payment system.
                        </p>
                        <div className="flex justify-end space-x-3">
                            <button
                                onClick={() => setShowMigrationModal(false)}
                                className="px-4 py-2 text-gray-600 bg-gray-200 rounded-md hover:bg-gray-300"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleMigration}
                                disabled={loading}
                                className="px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700 disabled:bg-yellow-300"
                            >
                                {loading ? 'Migrating...' : 'Migrate Now'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Client Settlement Modal */}
            {showClientSettlement && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-lg shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col">
                        {/* Header */}
                        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-6 py-4">
                            <div className="flex justify-between items-center">
                                <div>
                                    <h2 className="text-2xl font-bold">Client Settlement</h2>
                                    <p className="text-indigo-100 text-sm mt-1">Allocate client balance to outstanding invoices</p>
                                </div>
                                <button
                                    onClick={() => {
                                        setShowClientSettlement(false);
                                        setSelectedClientForSettlement(null);
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
                            <div className="space-y-6">
                                {/* Client Selector */}
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">Select Client</label>
                                    <select
                                        value={selectedClientForSettlement?.id || ''}
                                        onChange={(e) => {
                                            const client = clients.find(c => c.id === e.target.value);
                                            setSelectedClientForSettlement(client);
                                        }}
                                        className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-lg"
                                    >
                                        <option value="">-- Choose a client to settle invoices --</option>
                                        {clients
                                            .filter(client => getClientAccountBalance(client.id) > 0 || getClientOutstandingAmount(client.id) > 0)
                                            .map(client => {
                                                const balance = getClientAccountBalance(client.id);
                                                const outstanding = getClientOutstandingAmount(client.id);
                                                return (
                                                    <option key={client.id} value={client.id}>
                                                        {client.name} | Balance: ${balance.toFixed(2)} | Outstanding: ${outstanding.toFixed(2)}
                                                    </option>
                                                );
                                            })}
                                    </select>
                                </div>

                                {selectedClientForSettlement && (
                                    <div className="space-y-6">
                                        {/* Client Summary Cards */}
                                        <div className="bg-gradient-to-br from-indigo-50 to-purple-50 p-5 rounded-xl border-2 border-indigo-200">
                                            <h3 className="font-bold text-lg text-gray-800 mb-4 flex items-center">
                                                <svg className="w-5 h-5 mr-2 text-indigo-600" fill="currentColor" viewBox="0 0 20 20">
                                                    <path d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z"></path>
                                                </svg>
                                                {selectedClientForSettlement.name}
                                            </h3>
                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                                <div className="bg-white rounded-lg p-4 shadow-sm">
                                                    <p className="text-xs text-gray-600 font-medium mb-1">Available Balance</p>
                                                    <p className="text-2xl font-bold text-green-600">
                                                        ${getClientAccountBalance(selectedClientForSettlement.id).toFixed(2)}
                                                    </p>
                                                </div>
                                                <div className="bg-white rounded-lg p-4 shadow-sm">
                                                    <p className="text-xs text-gray-600 font-medium mb-1">Total Outstanding</p>
                                                    <p className="text-2xl font-bold text-red-600">
                                                        ${getClientOutstandingAmount(selectedClientForSettlement.id).toFixed(2)}
                                                    </p>
                                                </div>
                                                <div className="bg-white rounded-lg p-4 shadow-sm">
                                                    <p className="text-xs text-gray-600 font-medium mb-1">Total Invoices</p>
                                                    <p className="text-2xl font-bold text-gray-800">
                                                        {getClientDocuments(selectedClientForSettlement.id).length}
                                                    </p>
                                                </div>
                                                <div className="bg-white rounded-lg p-4 shadow-sm">
                                                    <p className="text-xs text-gray-600 font-medium mb-1">Unpaid Invoices</p>
                                                    <p className="text-2xl font-bold text-orange-600">
                                                        {getClientDocuments(selectedClientForSettlement.id).filter(doc => (doc.totalPaid || 0) < doc.total).length}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Invoices List */}
                                        <div>
                                            <h3 className="font-bold text-lg text-gray-800 mb-3 flex items-center">
                                                <svg className="w-5 h-5 mr-2 text-indigo-600" fill="currentColor" viewBox="0 0 20 20">
                                                    <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z"></path>
                                                    <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd"></path>
                                                </svg>
                                                Click on an invoice to settle it
                                            </h3>
                                            <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
                                                {getClientDocuments(selectedClientForSettlement.id)
                                                    .sort((a, b) => {
                                                        // Sort unpaid first, then by outstanding amount (highest first)
                                                        const outstandingA = getOutstandingAmount(a.id);
                                                        const outstandingB = getOutstandingAmount(b.id);
                                                        const isPaidA = outstandingA <= 0;
                                                        const isPaidB = outstandingB <= 0;
                                                        if (isPaidA !== isPaidB) return isPaidA ? 1 : -1;
                                                        return outstandingB - outstandingA;
                                                    })
                                                    .map(doc => {
                                                        const outstanding = getOutstandingAmount(doc.id);
                                                        const isPaid = outstanding <= 0;
                                                        const docInfo = getDocumentInfo(doc.id);
                                                        const clientBalance = getClientAccountBalance(selectedClientForSettlement.id);
                                                        const canSettle = Math.min(outstanding, clientBalance);
                                                        const isPartialSettlement = canSettle > 0 && canSettle < outstanding;
                                                        const cannotSettle = clientBalance <= 0;

                                                        return (
                                                            <div
                                                                key={doc.id}
                                                                className={`p-4 rounded-lg border-2 transition-all ${
                                                                    isPaid
                                                                        ? 'bg-green-50 border-green-300 opacity-60'
                                                                        : cannotSettle
                                                                        ? 'bg-gray-50 border-gray-300 opacity-60'
                                                                        : 'bg-white border-orange-300 hover:border-indigo-500 hover:shadow-lg'
                                                                }`}
                                                            >
                                                                <div className="flex items-start justify-between gap-4">
                                                                    <div className="flex-1 min-w-0">
                                                                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                                                                            <span className="px-3 py-1 text-sm font-semibold rounded-full bg-indigo-100 text-indigo-800">
                                                                                Invoice #{docInfo.number}
                                                                            </span>
                                                                            {isPaid && (
                                                                                <span className="px-3 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                                                                                    ✓ Paid
                                                                                </span>
                                                                            )}
                                                                            {!isPaid && canSettle > 0 && (
                                                                                <span className="px-3 py-1 text-xs font-semibold rounded-full bg-orange-100 text-orange-800 animate-pulse">
                                                                                    Click to settle
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                        <div className="grid grid-cols-3 gap-3 text-sm mb-3">
                                                                            <div>
                                                                                <span className="text-gray-600">Total:</span>
                                                                                <span className="font-bold ml-2 text-gray-900">${docInfo.total.toFixed(2)}</span>
                                                                            </div>
                                                                            <div>
                                                                                <span className="text-gray-600">Paid:</span>
                                                                                <span className="font-bold ml-2 text-green-600">${(doc.totalPaid || 0).toFixed(2)}</span>
                                                                            </div>
                                                                            <div>
                                                                                <span className="text-gray-600">Outstanding:</span>
                                                                                <span className={`font-bold ml-2 ${isPaid ? 'text-green-600' : 'text-red-600'}`}>
                                                                                    ${outstanding.toFixed(2)}
                                                                                </span>
                                                                            </div>
                                                                        </div>
                                                                        {!isPaid && canSettle > 0 && (
                                                                            <div className="mt-2">
                                                                                <label className="block text-xs font-medium text-gray-700 mb-1">Settlement Amount</label>
                                                                                <input
                                                                                    type="number"
                                                                                    step="0.01"
                                                                                    min="0.01"
                                                                                    max={canSettle}
                                                                                    value={customSettlementAmounts[doc.id] || canSettle.toFixed(2)}
                                                                                    onChange={(e) => {
                                                                                        e.stopPropagation();
                                                                                        setCustomSettlementAmounts({
                                                                                            ...customSettlementAmounts,
                                                                                            [doc.id]: e.target.value
                                                                                        });
                                                                                    }}
                                                                                    onClick={(e) => e.stopPropagation()}
                                                                                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                                                    placeholder="0.00"
                                                                                />
                                                                                <p className="text-xs text-gray-500 mt-1">Max: ${canSettle.toFixed(2)}</p>
                                                                            </div>
                                                                        )}
                                                                        {isPartialSettlement && !isPaid && (
                                                                            <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded text-xs text-blue-700">
                                                                                <strong>Partial Settlement:</strong> Will allocate ${canSettle.toFixed(2)} from available balance.
                                                                                Remaining ${(outstanding - canSettle).toFixed(2)} will still be due.
                                                                            </div>
                                                                        )}
                                                                        {cannotSettle && !isPaid && (
                                                                            <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                                                                                ⚠ No available balance. Add payment to client account first.
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                    {!isPaid && canSettle > 0 && (
                                                                        <div className="flex-shrink-0">
                                                                            <button
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    const settleAmount = customSettlementAmounts[doc.id] ? parseFloat(customSettlementAmounts[doc.id]) : canSettle;
                                                                                    if (settleAmount > 0 && settleAmount <= canSettle) {
                                                                                        handleSettleDocument(selectedClientForSettlement.id, doc.id, settleAmount);
                                                                                    }
                                                                                }}
                                                                                disabled={settlementInProgress}
                                                                                className="px-6 py-3 bg-gradient-to-r from-green-600 to-green-700 text-white font-semibold rounded-lg hover:from-green-700 hover:to-green-800 shadow-md hover:shadow-lg transition-all transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                                                                            >
                                                                                <div className="text-center">
                                                                                    <div className="text-sm">{settlementInProgress ? 'Settling...' : 'Settle'}</div>
                                                                                    <div className="text-lg">${(customSettlementAmounts[doc.id] ? parseFloat(customSettlementAmounts[doc.id]) : canSettle).toFixed(2)}</div>
                                                                                    {((customSettlementAmounts[doc.id] ? parseFloat(customSettlementAmounts[doc.id]) : canSettle) < outstanding) && <div className="text-xs opacity-90">(Partial)</div>}
                                                                                </div>
                                                                            </button>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PaymentsPage;
