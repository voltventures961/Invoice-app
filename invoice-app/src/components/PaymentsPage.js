import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, addDoc, updateDoc, doc, getDocs, orderBy, deleteDoc } from 'firebase/firestore';
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
        notes: ''
    });
    const [clientFilter, setClientFilter] = useState('all'); // Filter payments by client
    const [showClientSettlement, setShowClientSettlement] = useState(false);
    const [selectedClientForSettlement, setSelectedClientForSettlement] = useState(null);

    useEffect(() => {
        const fetchData = async () => {
            try {
                // Check migration status first
                if (auth.currentUser) {
                    const migrationCheck = await verifyMigration(auth.currentUser.uid);
                    setMigrationStatus(migrationCheck);
                }

                // Fetch clients from the correct user-specific path
                const clientsQuery = query(collection(db, `clients/${auth.currentUser.uid}/userClients`), orderBy('name'));
                const clientsSnapshot = await getDocs(clientsQuery);
                const clientsData = clientsSnapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));
                console.log(`Loaded ${clientsData.length} clients:`, clientsData.map(c => c.name));
                setClients(clientsData);

                // Fetch documents (invoices and proformas) from the correct path
                const documentsQuery = query(collection(db, `documents/${auth.currentUser.uid}/userDocuments`), orderBy('date', 'desc'));
                const documentsSnapshot = await getDocs(documentsQuery);
                const documentsData = documentsSnapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));
                console.log(`Loaded ${documentsData.length} documents:`, documentsData.map(d => `${d.type} #${d.invoiceNumber || d.proformaNumber || d.documentNumber}`));
                setDocuments(documentsData);

                // Listen to payments with limit for better performance
                const paymentsQuery = query(collection(db, 'payments'), orderBy('paymentDate', 'desc'));
                const unsubscribe = onSnapshot(paymentsQuery, (snapshot) => {
                    const paymentsData = snapshot.docs.map(doc => ({
                        id: doc.id,
                        ...doc.data()
                    }));
                    setPayments(paymentsData);
                    setLoading(false);
                }, (error) => {
                    console.error('Error fetching payments:', error);
                    setLoading(false);
                });

                return () => unsubscribe();
            } catch (error) {
                console.error('Error fetching data:', error);
                setFeedback({ type: 'error', message: 'Failed to load data' });
                setLoading(false);
            }
        };

        fetchData();
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
                setFeedback({ 
                    type: 'success', 
                    message: `Repair completed successfully! Fixed ${result.repairedCount} payments.` 
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
            if (!formData.clientId || !formData.documentId || !formData.amount) {
                setFeedback({ type: 'error', message: 'Please fill in all required fields.' });
                setLoading(false);
                return;
            }

            if (parseFloat(formData.amount) <= 0) {
                setFeedback({ type: 'error', message: 'Payment amount must be greater than 0.' });
                setLoading(false);
                return;
            }

            const paymentData = {
                ...formData,
                amount: parseFloat(formData.amount),
                paymentDate: new Date(formData.paymentDate),
                createdAt: new Date(),
                updatedAt: new Date()
            };

            console.log('Saving payment:', paymentData);

            if (editingPayment) {
                // Update existing payment
                await updateDoc(doc(db, 'payments', editingPayment.id), paymentData);
                setFeedback({ type: 'success', message: 'Payment updated successfully!' });
            } else {
                // Add new payment
                await addDoc(collection(db, 'payments'), paymentData);
                setFeedback({ type: 'success', message: 'Payment added successfully!' });
            }

            // Update document payment status
            await updateDocumentPaymentStatus(formData.documentId);

            // Reset form
            setFormData({
                clientId: '',
                documentId: '',
                amount: '',
                paymentDate: new Date().toISOString().split('T')[0],
                paymentMethod: 'cash',
                reference: '',
                notes: ''
            });
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
            // Get all payments for this document
            const paymentsQuery = query(collection(db, 'payments'), where('documentId', '==', documentId));
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
            console.log(`Updated document ${documentId} with totalPaid: ${totalPaid}`);
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
        console.log('getFilteredDocuments called with clientId:', clientId);
        console.log('Total documents available:', documents.length);
        
        if (!clientId) {
            // Show all active documents if no client selected
            const filtered = documents.filter(doc => 
                !doc.cancelled && !doc.deleted && !doc.transformedToInvoice && !doc.convertedToInvoice
            );
            console.log('No client selected, showing all active documents:', filtered.length);
            return filtered;
        }
        
        const filtered = documents.filter(doc => 
            doc.client && doc.client.id === clientId && 
            !doc.cancelled && !doc.deleted && !doc.transformedToInvoice && !doc.convertedToInvoice
        );
        console.log(`Client ${clientId} selected, showing documents:`, filtered.length);
        return filtered;
    };

    const getFilteredPayments = () => {
        if (clientFilter === 'all') {
            return payments;
        }
        return payments.filter(payment => payment.clientId === clientFilter);
    };

    const getClientPayments = (clientId) => {
        return payments.filter(payment => payment.clientId === clientId);
    };

    const getClientDocuments = (clientId) => {
        return documents.filter(doc => 
            doc.client && doc.client.id === clientId && 
            !doc.cancelled && !doc.deleted && !doc.transformedToInvoice && !doc.convertedToInvoice
        );
    };

    const getOutstandingAmount = (documentId) => {
        const document = documents.find(d => d.id === documentId);
        if (!document) return 0;
        const totalPaid = document.totalPaid || 0;
        return Math.max(0, document.total - totalPaid);
    };

    const handleClientChange = (clientId) => {
        console.log('Client changed to:', clientId);
        console.log('Available clients:', clients);
        setFormData(prev => ({
            ...prev,
            clientId,
            documentId: '', // Reset document when client changes
            amount: '' // Reset amount when client changes
        }));
    };

    const handleDocumentChange = (documentId) => {
        console.log('Document changed to:', documentId);
        const outstanding = getOutstandingAmount(documentId);
        console.log('Outstanding amount for document:', outstanding);
        setFormData(prev => ({
            ...prev,
            documentId,
            amount: outstanding > 0 ? outstanding.toFixed(2) : ''
        }));
    };

    const handleSettleDocument = async (clientId, documentId, amount) => {
        try {
            setLoading(true);
            
            const paymentData = {
                clientId: clientId,
                documentId: documentId,
                amount: parseFloat(amount),
                paymentDate: new Date(),
                paymentMethod: 'settlement',
                reference: `Settlement payment`,
                notes: 'Settlement from client account',
                createdAt: new Date(),
                updatedAt: new Date()
            };

            await addDoc(collection(db, 'payments'), paymentData);
            await updateDocumentPaymentStatus(documentId);
            
            setFeedback({ type: 'success', message: 'Document settled successfully!' });
            setShowClientSettlement(false);
            setSelectedClientForSettlement(null);
            
        } catch (error) {
            console.error('Error settling document:', error);
            setFeedback({ type: 'error', message: 'Failed to settle document. Please try again.' });
        } finally {
            setLoading(false);
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
                        className="bg-orange-600 hover:bg-orange-700 text-white font-medium py-2 px-4 rounded-lg shadow-md"
                    >
                        Repair Payments
                    </button>
                    <button
                        onClick={() => {
                            console.log('=== DEBUG DATA ===');
                            console.log('Clients:', clients);
                            console.log('Documents:', documents);
                            console.log('Payments:', payments);
                            console.log('Form Data:', formData);
                            console.log('Filtered Documents (no client):', getFilteredDocuments(''));
                            console.log('Filtered Documents (with client):', getFilteredDocuments(formData.clientId));
                        }}
                        className="bg-gray-600 hover:bg-gray-700 text-white font-medium py-2 px-4 rounded-lg shadow-md"
                    >
                        Debug Data
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
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Client</label>
                                <select
                                    name="clientId"
                                    value={formData.clientId}
                                    onChange={(e) => handleClientChange(e.target.value)}
                                    required
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                >
                                    <option value="">Select Client</option>
                                    {clients.map(client => (
                                        <option key={client.id} value={client.id}>
                                            {client.name}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Document</label>
                                <select
                                    name="documentId"
                                    value={formData.documentId}
                                    onChange={(e) => handleDocumentChange(e.target.value)}
                                    required
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                >
                                    <option value="">Select Document</option>
                                    {getFilteredDocuments(formData.clientId).map(doc => {
                                        const docInfo = getDocumentInfo(doc.id);
                                        const outstanding = getOutstandingAmount(doc.id);
                                        return (
                                            <option key={doc.id} value={doc.id}>
                                                {docInfo.type} #{docInfo.number} - ${docInfo.total.toFixed(2)} (Outstanding: ${outstanding.toFixed(2)})
                                            </option>
                                        );
                                    })}
                                </select>
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

            {/* Payments List */}
            <div className="bg-white rounded-lg shadow-lg overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200">
                    <h2 className="text-lg font-semibold text-gray-800">Payment History</h2>
                </div>
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Client</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Document</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Method</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reference</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {getFilteredPayments().map(payment => {
                                const clientName = getClientName(payment);
                                const docInfo = getDocumentInfo(payment.documentId);
                                
                                return (
                                    <tr key={payment.id} className="hover:bg-gray-50">
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
                                                docInfo.type === 'Invoice' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'
                                            }`}>
                                                {docInfo.type} #{docInfo.number}
                                            </span>
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
                                            <div className="flex space-x-2">
                                                <button
                                                    onClick={() => {
                                                        setEditingPayment(payment);
                                                        setFormData({
                                                            ...payment,
                                                            paymentDate: payment.paymentDate?.toDate ? 
                                                                payment.paymentDate.toDate().toISOString().split('T')[0] :
                                                                new Date(payment.paymentDate).toISOString().split('T')[0]
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
            </div>

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
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white p-6 rounded-lg shadow-lg max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-semibold text-gray-800">Client Settlement</h2>
                            <button
                                onClick={() => {
                                    setShowClientSettlement(false);
                                    setSelectedClientForSettlement(null);
                                }}
                                className="text-gray-500 hover:text-gray-700"
                            >
                                ✕
                            </button>
                        </div>
                        
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Select Client</label>
                                <select
                                    value={selectedClientForSettlement?.id || ''}
                                    onChange={(e) => {
                                        const client = clients.find(c => c.id === e.target.value);
                                        setSelectedClientForSettlement(client);
                                    }}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                >
                                    <option value="">Select Client</option>
                                    {clients.map(client => (
                                        <option key={client.id} value={client.id}>{client.name}</option>
                                    ))}
                                </select>
                            </div>

                            {selectedClientForSettlement && (
                                <div className="space-y-4">
                                    <div className="bg-gray-50 p-4 rounded-lg">
                                        <h3 className="font-semibold text-gray-800 mb-2">
                                            Client: {selectedClientForSettlement.name}
                                        </h3>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                                            <div>
                                                <span className="text-gray-600">Total Payments:</span>
                                                <span className="font-semibold ml-2">
                                                    ${getClientPayments(selectedClientForSettlement.id).reduce((sum, p) => sum + p.amount, 0).toFixed(2)}
                                                </span>
                                            </div>
                                            <div>
                                                <span className="text-gray-600">Total Documents:</span>
                                                <span className="font-semibold ml-2">
                                                    {getClientDocuments(selectedClientForSettlement.id).length}
                                                </span>
                                            </div>
                                            <div>
                                                <span className="text-gray-600">Unpaid Documents:</span>
                                                <span className="font-semibold ml-2 text-red-600">
                                                    {getClientDocuments(selectedClientForSettlement.id).filter(doc => (doc.totalPaid || 0) < doc.total).length}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    <div>
                                        <h3 className="font-semibold text-gray-800 mb-2">Settle Documents</h3>
                                        <div className="space-y-2 max-h-60 overflow-y-auto">
                                            {getClientDocuments(selectedClientForSettlement.id).map(doc => {
                                                const outstanding = getOutstandingAmount(doc.id);
                                                const isPaid = outstanding <= 0;
                                                const docInfo = getDocumentInfo(doc.id);
                                                
                                                return (
                                                    <div key={doc.id} className={`p-3 border rounded-lg ${isPaid ? 'bg-green-50 border-green-200' : 'bg-orange-50 border-orange-200'}`}>
                                                        <div className="flex items-center justify-between">
                                                            <div className="flex-1">
                                                                <div className="flex items-center space-x-2">
                                                                    <span className={`px-2 py-1 text-xs rounded-full ${
                                                                        doc.type === 'invoice' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'
                                                                    }`}>
                                                                        {docInfo.type} #{docInfo.number}
                                                                    </span>
                                                                    <span className="text-sm text-gray-600">
                                                                        Total: ${docInfo.total.toFixed(2)}
                                                                    </span>
                                                                    <span className="text-sm text-gray-600">
                                                                        Paid: ${(doc.totalPaid || 0).toFixed(2)}
                                                                    </span>
                                                                    <span className={`text-sm font-semibold ${isPaid ? 'text-green-600' : 'text-orange-600'}`}>
                                                                        Outstanding: ${outstanding.toFixed(2)}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                            {!isPaid && (
                                                                <button
                                                                    onClick={() => handleSettleDocument(selectedClientForSettlement.id, doc.id, outstanding)}
                                                                    className="ml-4 px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700"
                                                                >
                                                                    Settle ${outstanding.toFixed(2)}
                                                                </button>
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
            )}
        </div>
    );
};

export default PaymentsPage;
