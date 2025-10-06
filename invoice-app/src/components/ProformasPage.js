import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, getDocs, orderBy, limit, startAfter, deleteDoc, doc, updateDoc, addDoc, runTransaction } from 'firebase/firestore';
import { auth, db } from '../firebase/config';

const ProformasPage = ({ navigateTo }) => {
    const [proformas, setProformas] = useState([]);
    const [deletedProformas, setDeletedProformas] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showHistoryModal, setShowHistoryModal] = useState(false);
    const [showDeletedModal, setShowDeletedModal] = useState(false);
    const [historyInvoices, setHistoryInvoices] = useState([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [lastVisible, setLastVisible] = useState(null);
    const [hasMore, setHasMore] = useState(true);
    const [historyFilter, setHistoryFilter] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [displayLimit, setDisplayLimit] = useState(20);
    const [confirmDelete, setConfirmDelete] = useState(null);

    useEffect(() => {
        if (!auth.currentUser) return;
        
        // Fetch all proformas first, then filter in memory
        const proformaQuery = query(
            collection(db, `documents/${auth.currentUser.uid}/userDocuments`),
            where('type', '==', 'proforma')
        );
        
        const unsubscribe = onSnapshot(proformaQuery, (querySnapshot) => {
            const activeDocs = [];
            const deletedDocs = [];
            
            querySnapshot.forEach((doc) => {
                const data = { id: doc.id, ...doc.data() };
                
                // Check if it's converted to invoice - exclude from all lists to avoid double counting
                if (data.converted || data.convertedToInvoice || data.transformedToInvoice) {
                    // Skip converted proformas from all lists
                    return;
                }
                
                if (data.deleted === true || data.cancelled === true) {
                    deletedDocs.push(data);
                } else {
                    activeDocs.push(data);
                }
            });
            
            activeDocs.sort((a, b) => b.date.toDate() - a.date.toDate());
            deletedDocs.sort((a, b) => (b.deletedAt?.toDate() || new Date()) - (a.deletedAt?.toDate() || new Date()));
            
            setProformas(activeDocs);
            setDeletedProformas(deletedDocs);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching proformas: ", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);


    const fetchHistoryInvoices = async (loadMore = false) => {
        if (!auth.currentUser) return;
        setHistoryLoading(true);

        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        let q = query(
            collection(db, `documents/${auth.currentUser.uid}/userDocuments`),
            where('type', '==', 'invoice'),
            where('date', '>=', thirtyDaysAgo),
            orderBy('date', 'desc'),
            limit(10)
        );

        if (loadMore && lastVisible) {
            q = query(
                collection(db, `documents/${auth.currentUser.uid}/userDocuments`),
                where('type', '==', 'invoice'),
                where('date', '>=', thirtyDaysAgo),
                orderBy('date', 'desc'),
                startAfter(lastVisible),
                limit(10)
            );
        }

        try {
            const documentSnapshots = await getDocs(q);
            const newInvoices = documentSnapshots.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            const newLastVisible = documentSnapshots.docs[documentSnapshots.docs.length - 1];
            setLastVisible(newLastVisible);

            setHistoryInvoices(prev => loadMore ? [...prev, ...newInvoices] : newInvoices);
            setHasMore(newInvoices.length === 10);
        } catch (error) {
            console.error("Error fetching invoice history: ", error);
        } finally {
            setHistoryLoading(false);
        }
    };

    const handleOpenHistoryModal = () => {
        setShowHistoryModal(true);
        setHistoryInvoices([]);
        setLastVisible(null);
        setHasMore(true);
        fetchHistoryInvoices();
    };

    const handleConvertToInvoice = async (proforma) => {
        if (!auth.currentUser) return;

        try {
            // Get next invoice number
            const year = new Date().getFullYear();
            const counterRef = doc(db, `counters/${auth.currentUser.uid}/documentCounters`, 'invoiceCounter');
            const newInvoiceNumber = await runTransaction(db, async (transaction) => {
                const counterDoc = await transaction.get(counterRef);
                let newLastId = 1;
                if (counterDoc.exists()) {
                    newLastId = counterDoc.data().lastId + 1;
                }
                transaction.set(counterRef, { lastId: newLastId }, { merge: true });
                return `INV-${year}-${String(newLastId).padStart(3, '0')}`;
            });

            // Create new invoice document
            // NOTE: Do NOT transfer payments from proforma - payments should only be on invoices or client accounts
            const invoiceData = {
                ...proforma,
                type: 'invoice',
                documentNumber: newInvoiceNumber,
                invoiceNumber: newInvoiceNumber,
                proformaNumber: proforma.documentNumber,
                convertedFrom: proforma.id,
                date: new Date(),
                // Clear any old payment data (proformas should not have had payments)
                payments: [],
                totalPaid: 0,
                paid: false,
                lastPaymentDate: null
            };

            // Remove proforma-specific fields
            delete invoiceData.id;
            delete invoiceData.converted;
            delete invoiceData.proformaNumber; // Already stored separately

            // Add the new invoice
            const newInvoiceRef = await addDoc(collection(db, `documents/${auth.currentUser.uid}/userDocuments`), invoiceData);

            // Mark original proforma as converted
            const proformaRef = doc(db, `documents/${auth.currentUser.uid}/userDocuments`, proforma.id);
            await updateDoc(proformaRef, {
                converted: true,
                convertedToInvoice: true,
                convertedAt: new Date(),
                convertedToInvoiceNumber: newInvoiceNumber,
                convertedToInvoiceId: newInvoiceRef.id
            });

            // Navigate to invoices page
            navigateTo('invoices');
        } catch (error) {
            console.error("Error converting proforma to invoice: ", error);
            alert('Error converting proforma to invoice. Please try again.');
        }
    };

    const handleDeleteProforma = async (proformaId) => {
        if (!auth.currentUser) return;
        
        try {
            const docRef = doc(db, `documents/${auth.currentUser.uid}/userDocuments`, proformaId);
            await updateDoc(docRef, {
                deleted: true,
                deletedAt: new Date()
            });
            setConfirmDelete(null);
        } catch (error) {
            console.error("Error deleting proforma: ", error);
        }
    };

    const handleRestoreProforma = async (proformaId) => {
        if (!auth.currentUser) return;
        
        try {
            const docRef = doc(db, `documents/${auth.currentUser.uid}/userDocuments`, proformaId);
            await updateDoc(docRef, {
                deleted: false,
                deletedAt: null
            });
        } catch (error) {
            console.error("Error restoring proforma: ", error);
        }
    };

    const handlePermanentDelete = async (proformaId) => {
        if (!auth.currentUser) return;
        
        try {
            const docRef = doc(db, `documents/${auth.currentUser.uid}/userDocuments`, proformaId);
            await deleteDoc(docRef);
        } catch (error) {
            console.error("Error permanently deleting proforma: ", error);
        }
    };

    const filteredHistoryInvoices = historyInvoices.filter(invoice => {
        const filter = historyFilter.toLowerCase();
        return (
            invoice.documentNumber.toLowerCase().includes(filter) ||
            invoice.client.name.toLowerCase().includes(filter)
        );
    });

    // Filter proformas based on search query
    const filteredProformas = proformas.filter(doc => {
        const search = searchQuery.toLowerCase();
        return (
            doc.documentNumber.toLowerCase().includes(search) ||
            doc.client.name.toLowerCase().includes(search) ||
            doc.date.toDate().toLocaleDateString().includes(search) ||
            doc.total.toString().includes(search)
        );
    });

    // Limit displayed proformas
    const displayedProformas = filteredProformas.slice(0, displayLimit);

    // Calculate statistics
    const totalAmount = displayedProformas.reduce((sum, doc) => sum + doc.total, 0);

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold text-gray-800">Proformas</h1>
                <div className="flex gap-2">
                    <button 
                        onClick={() => setShowDeletedModal(true)} 
                        className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded-lg shadow-md transition-colors"
                    >
                        Cancelled ({deletedProformas.length})
                    </button>
                    <button 
                        onClick={handleOpenHistoryModal} 
                        className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg shadow-md"
                    >
                        Invoice History
                    </button>
                </div>
            </div>

            {/* Search Bar */}
            <div className="mb-6">
                <input
                    type="text"
                    placeholder="Search by number, client, date, amount, or payment status..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
            </div>

            {/* Proforma Summary */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div className="bg-yellow-50 p-4 rounded-lg">
                    <p className="text-sm text-yellow-600">Total Proforma Value</p>
                    <p className="text-2xl font-bold text-yellow-800">${totalAmount.toFixed(2)}</p>
                    <p className="text-xs text-yellow-600 mt-1">Active proformas (not yet converted to invoices)</p>
                </div>
                <div className="bg-blue-50 p-4 rounded-lg">
                    <p className="text-sm text-blue-600">Total Active Proformas</p>
                    <p className="text-2xl font-bold text-blue-800">{displayedProformas.length}</p>
                    <p className="text-xs text-blue-600 mt-1">Convert proformas to invoices to enable payments</p>
                </div>
            </div>

            <div className="bg-blue-50 border-l-4 border-blue-400 p-4 mb-6">
                <div className="flex">
                    <div className="flex-shrink-0">
                        <svg className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                        </svg>
                    </div>
                    <div className="ml-3">
                        <p className="text-sm text-blue-700">
                            <strong>Note:</strong> Proformas are temporary quotes and cannot receive direct payments.
                            To accept payments, either:
                            <br/>• Add payment to client account (via Payments page), or
                            <br/>• Convert the proforma to an invoice first
                        </p>
                    </div>
                </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-lg">
                <div className="overflow-x-auto">
                    {loading ? <p>Loading proformas...</p> :
                     displayedProformas.length === 0 ? 
                        <p className="text-gray-500">
                            {searchQuery ? 'No proformas found matching your search.' : 'No proformas found.'}
                        </p> :
                    <table className="min-w-full bg-white">
                        <thead className="bg-gray-200 text-gray-600 uppercase text-sm leading-normal">
                            <tr>
                                <th className="py-3 px-6 text-left">Number</th>
                                <th className="py-3 px-6 text-left">Client</th>
                                <th className="py-3 px-6 text-center">Date</th>
                                <th className="py-3 px-6 text-right">Total</th>
                                <th className="py-3 px-6 text-center">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="text-gray-600 text-sm font-light">
                            {displayedProformas.map(doc => {
                                return (
                                    <tr key={doc.id} className="border-b border-gray-200 hover:bg-gray-100">
                                        <td className="py-3 px-6 text-left">{doc.documentNumber}</td>
                                        <td className="py-3 px-6 text-left">{doc.client.name}</td>
                                        <td className="py-3 px-6 text-center">{doc.date.toDate().toLocaleDateString()}</td>
                                        <td className="py-3 px-6 text-right font-semibold">${doc.total.toFixed(2)}</td>
                                        <td className="py-3 px-6 text-center">
                                            <div className="flex item-center justify-center gap-1">
                                                <button
                                                    onClick={() => navigateTo('viewDocument', doc)}
                                                    className="text-gray-600 hover:text-indigo-600 font-medium py-1 px-2 rounded-lg text-sm"
                                                >
                                                    View
                                                </button>
                                                <button
                                                    onClick={() => navigateTo('newDocument', doc)}
                                                    className="text-gray-600 hover:text-purple-600 font-medium py-1 px-2 rounded-lg text-sm"
                                                >
                                                    Edit
                                                </button>
                                                <button
                                                    onClick={() => handleConvertToInvoice(doc)}
                                                    className="text-green-600 hover:text-green-800 font-medium py-1 px-2 rounded-lg text-sm"
                                                    title="Convert to Invoice"
                                                >
                                                    Convert
                                                </button>
                                                <button
                                                    onClick={() => setConfirmDelete(doc.id)}
                                                    className="text-red-600 hover:text-red-800 font-medium py-1 px-2 rounded-lg text-sm"
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
                    }
                </div>
                
                {/* Show More Button */}
                {filteredProformas.length > displayLimit && (
                    <div className="mt-4 text-center">
                        <button
                            onClick={() => setDisplayLimit(prev => prev + 20)}
                            className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-6 rounded-lg"
                        >
                            Show More ({filteredProformas.length - displayLimit} remaining)
                        </button>
                    </div>
                )}
            </div>

            {/* Delete Confirmation Modal */}
            {confirmDelete && (
                <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center p-4">
                    <div className="bg-white rounded-lg shadow-2xl p-6 max-w-md">
                        <h3 className="text-lg font-bold mb-4">Confirm Delete</h3>
                        <p className="mb-6">Are you sure you want to delete this proforma? You can restore it later from the deleted items.</p>
                        <div className="flex justify-end gap-2">
                            <button
                                onClick={() => setConfirmDelete(null)}
                                className="px-4 py-2 bg-gray-300 hover:bg-gray-400 rounded-lg"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => handleDeleteProforma(confirmDelete)}
                                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg"
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Deleted Proformas Modal */}
            {showDeletedModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center p-4">
                    <div className="bg-white rounded-lg shadow-2xl w-full max-w-4xl max-h-full flex flex-col">
                        <div className="flex justify-between items-center p-4 border-b">
                            <h2 className="text-xl font-bold">Cancelled Proformas</h2>
                            <button onClick={() => setShowDeletedModal(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                                </svg>
                            </button>
                        </div>
                        <div className="overflow-y-auto flex-grow p-4">
                            {deletedProformas.length === 0 ? (
                                <p className="text-gray-500">No deleted proformas.</p>
                            ) : (
                                <table className="min-w-full bg-white">
                                    <thead className="bg-gray-200 text-gray-600 uppercase text-sm leading-normal">
                                        <tr>
                                            <th className="py-3 px-6 text-left">Number</th>
                                            <th className="py-3 px-6 text-left">Client</th>
                                            <th className="py-3 px-6 text-center">Deleted On</th>
                                            <th className="py-3 px-6 text-right">Total</th>
                                            <th className="py-3 px-6 text-center">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="text-gray-600 text-sm font-light">
                                        {deletedProformas.map(doc => (
                                            <tr key={doc.id} className="border-b border-gray-200 hover:bg-gray-100">
                                                <td className="py-3 px-6 text-left">{doc.documentNumber}</td>
                                                <td className="py-3 px-6 text-left">{doc.client.name}</td>
                                                <td className="py-3 px-6 text-center">
                                                    {doc.deletedAt?.toDate().toLocaleDateString() || 'Unknown'}
                                                </td>
                                                <td className="py-3 px-6 text-right font-semibold">${doc.total.toFixed(2)}</td>
                                                <td className="py-3 px-6 text-center">
                                                    <div className="flex item-center justify-center gap-2">
                                                        <button
                                                            onClick={() => handleRestoreProforma(doc.id)}
                                                            className="text-green-600 hover:text-green-800 font-medium py-1 px-2 rounded-lg text-sm"
                                                        >
                                                            Restore
                                                        </button>
                                                        <button
                                                            onClick={() => handlePermanentDelete(doc.id)}
                                                            className="text-red-600 hover:text-red-800 font-medium py-1 px-2 rounded-lg text-sm"
                                                        >
                                                            Permanent Delete
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

            {/* Invoice History Modal */}
            {showHistoryModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center p-4">
                    <div className="bg-white rounded-lg shadow-2xl w-full max-w-4xl max-h-full flex flex-col">
                        <div className="flex justify-between items-center p-4 border-b">
                            <h2 className="text-xl font-bold">Invoice History (Last 30 Days)</h2>
                            <button onClick={() => setShowHistoryModal(false)} className="text-gray-400 hover:text-gray-600">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                                </svg>
                            </button>
                        </div>
                        <div className="p-4">
                            <input
                                type="text"
                                placeholder="Filter by invoice # or client name..."
                                value={historyFilter}
                                onChange={e => setHistoryFilter(e.target.value)}
                                className="w-full px-4 py-2 border rounded-lg mb-4"
                            />
                        </div>
                        <div className="overflow-y-auto flex-grow p-4">
                            {historyLoading && historyInvoices.length === 0 ? <p>Loading history...</p> :
                             filteredHistoryInvoices.length === 0 ? <p>No invoices found in the last 30 days.</p> :
                            <table className="min-w-full bg-white">
                                <thead className="bg-gray-200 text-gray-600 uppercase text-sm leading-normal">
                                    <tr>
                                        <th className="py-3 px-6 text-left">Number</th>
                                        <th className="py-3 px-6 text-left">Client</th>
                                        <th className="py-3 px-6 text-center">Date</th>
                                        <th className="py-3 px-6 text-right">Total</th>
                                        <th className="py-3 px-6 text-center">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="text-gray-600 text-sm font-light">
                                    {filteredHistoryInvoices.map(doc => (
                                        <tr key={doc.id} className="border-b border-gray-200 hover:bg-gray-100">
                                            <td className="py-3 px-6 text-left">{doc.documentNumber}</td>
                                            <td className="py-3 px-6 text-left">{doc.client.name}</td>
                                            <td className="py-3 px-6 text-center">{doc.date.toDate().toLocaleDateString()}</td>
                                            <td className="py-3 px-6 text-right font-semibold">${doc.total.toFixed(2)}</td>
                                            <td className="py-3 px-6 text-center">
                                                <button 
                                                    onClick={() => navigateTo('viewDocument', doc)} 
                                                    className="text-gray-600 hover:text-indigo-600 font-medium py-1 px-3 rounded-lg text-sm"
                                                >
                                                    View
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            }
                        </div>
                        <div className="p-4 border-t">
                            {hasMore && (
                                <button
                                    onClick={() => fetchHistoryInvoices(true)}
                                    disabled={historyLoading}
                                    className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded w-full disabled:bg-blue-300"
                                >
                                    {historyLoading ? 'Loading...' : 'Show More'}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ProformasPage;
