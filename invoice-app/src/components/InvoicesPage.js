import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../firebase/config';

const InvoicesPage = ({ navigateTo }) => {
    const [invoices, setInvoices] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [displayLimit, setDisplayLimit] = useState(20);

    useEffect(() => {
        if (!auth.currentUser) return;
        const q = query(
            collection(db, `documents/${auth.currentUser.uid}/userDocuments`),
            where('type', '==', 'invoice')
        );
        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const docs = [];
            querySnapshot.forEach((doc) => {
                docs.push({ id: doc.id, ...doc.data() });
            });
            docs.sort((a, b) => b.date.toDate() - a.date.toDate());
            setInvoices(docs);
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

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold text-gray-800">Invoices</h1>
                <div className="text-sm text-gray-600">
                    Total: {invoices.length} invoices
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
                                                Finalized
                                            </span>
                                        </td>
                                        <td className="py-3 px-6 text-center">
                                            <div className="flex item-center justify-center">
                                                <button 
                                                    onClick={() => navigateTo('viewDocument', doc)} 
                                                    className="text-gray-600 hover:text-indigo-600 font-medium py-1 px-3 rounded-lg text-sm"
                                                >
                                                    View
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
        </div>
    );
};

export default InvoicesPage;
