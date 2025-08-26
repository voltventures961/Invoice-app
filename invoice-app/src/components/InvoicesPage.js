import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { auth, db } from '../firebase/config';

const InvoicesPage = ({ navigateTo }) => {
    const [invoices, setInvoices] = useState([]);
    const [cancelledInvoices, setCancelledInvoices] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [displayLimit, setDisplayLimit] = useState(20);
    const [showCancelledModal, setShowCancelledModal] = useState(false);
    const [confirmCancel, setConfirmCancel] = useState(null);

    useEffect(() => {
        if (!auth.currentUser) return;
        
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
            
            activeDocs.sort((a, b) => b.date.toDate() - a.date.toDate());
            cancelledDocs.sort((a, b) => (b.cancelledAt?.toDate() || new Date()) - (a.cancelledAt?.toDate() || new Date()));
            
            setInvoices(activeDocs);
            setCancelledInvoices(cancelledDocs);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching invoices: ", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    // Filter invoices based on search query
    const filteredInvoices = invoices.filter(doc => {
        const search = searchQuery.toLowerCase();
        const dateStr = doc.date.toDate().toLocaleDateString();
        
        return (
            doc.documentNumber.toLowerCase().includes(search) ||
            doc.client.name.toLowerCase().includes(search) ||
            dateStr.includes(search) ||
            doc.total.toString().includes(search)
        );
    });

    // Limit displayed invoices
    const displayedInvoices = filteredInvoices.slice(0, displayLimit);

    // Calculate statistics
    const totalAmount = displayedInvoices.reduce((sum, doc) => sum + doc.total, 0);
    const averageAmount = displayedInvoices.length > 0 ? totalAmount / displayedInvoices.length : 0;

    const handleCancelInvoice = async (invoiceId) => {
        if (!auth.currentUser) return;
        
        try {
            const docRef = doc(db, `documents/${auth.currentUser.uid}/userDocuments`, invoiceId);
            await updateDoc(docRef, {
                cancelled: true,
                cancelledAt: new Date()
            });
            setConfirmCancel(null);
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
                    placeholder="Search by invoice number, client name, date, or amount..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
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
                                    <th className="py-3 px-6 text-center">Status</th>
                                    <th className="py-3 px-6 text-center">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="text-gray-600 text-sm font-light">
                                {displayedInvoices.map(doc => (
                                    <tr key={doc.id} className="border-b border-gray-200 hover:bg-gray-100">
                                        <td className="py-3 px-6 text-left font-medium">{doc.documentNumber}</td>
                                        <td className="py-3 px-6 text-left">{doc.client.name}</td>
                                        <td className="py-3 px-6 text-center">{doc.date.toDate().toLocaleDateString()}</td>
                                        <td className="py-3 px-6 text-right font-semibold">${doc.total.toFixed(2)}</td>
                                        <td className="py-3 px-6 text-center">
                                            <span className="bg-green-200 text-green-700 py-1 px-3 rounded-full text-xs font-semibold">
                                                {doc.convertedFrom ? 'Converted' : 'Finalized'}
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
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
                
                {/* Show More Button */}
                {filteredInvoices.length > displayLimit && (
                    <div className="mt-4 text-center">
                        <button
                            onClick={() => setDisplayLimit(prev => prev + 20)}
                            className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-6 rounded-lg"
                        >
                            Show More ({filteredInvoices.length - displayLimit} remaining)
                        </button>
                    </div>
                )}
                
                {/* Summary Statistics */}
                {displayedInvoices.length > 0 && (
                    <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <p className="text-sm text-gray-600">Total Amount</p>
                                <p className="text-xl font-bold text-gray-800">${totalAmount.toFixed(2)}</p>
                            </div>
                            <div>
                                <p className="text-sm text-gray-600">Average Invoice</p>
                                <p className="text-xl font-bold text-gray-800">${averageAmount.toFixed(2)}</p>
                            </div>
                            <div>
                                <p className="text-sm text-gray-600">Invoices Shown</p>
                                <p className="text-xl font-bold text-gray-800">{displayedInvoices.length} of {filteredInvoices.length}</p>
                            </div>
                        </div>
                    </div>
                )}
            </div>
            
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
        </div>
    );
};

export default InvoicesPage;
