import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, orderBy, limit, startAfter } from 'firebase/firestore';
import { auth, db } from '../firebase/config';

const InvoicesPage = ({ navigateTo }) => {
    const [invoices, setInvoices] = useState([]);
    const [loading, setLoading] = useState(true);
    const [lastVisible, setLastVisible] = useState(null);
    const [hasMore, setHasMore] = useState(true);
    const [searchFilter, setSearchFilter] = useState('');

    const fetchInvoices = async (loadMore = false) => {
        if (!auth.currentUser) return;
        setLoading(true);

        let q = query(
            collection(db, `documents/${auth.currentUser.uid}/userDocuments`),
            where('type', '==', 'invoice'),
            orderBy('date', 'desc'),
            limit(20)
        );

        if (loadMore && lastVisible) {
            q = query(
                collection(db, `documents/${auth.currentUser.uid}/userDocuments`),
                where('type', '==', 'invoice'),
                orderBy('date', 'desc'),
                startAfter(lastVisible),
                limit(20)
            );
        }

        try {
            const documentSnapshots = await getDocs(q);
            const newInvoices = documentSnapshots.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            const newLastVisible = documentSnapshots.docs[documentSnapshots.docs.length - 1];
            setLastVisible(newLastVisible);

            setInvoices(prev => loadMore ? [...prev, ...newInvoices] : newInvoices);
            setHasMore(newInvoices.length === 20);
        } catch (error) {
            console.error("Error fetching invoices: ", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchInvoices();
    }, []);

    const filteredInvoices = invoices.filter(invoice => {
        const filter = searchFilter.toLowerCase();
        return (
            invoice.documentNumber.toLowerCase().includes(filter) ||
            invoice.client.name.toLowerCase().includes(filter) ||
            invoice.date.toDate().toLocaleDateString().includes(filter)
        );
    });

    return (
        <div>
            <h1 className="text-3xl font-bold text-gray-800 mb-6">Invoices</h1>
            <div className="bg-white p-6 rounded-lg shadow-lg">
                <div className="mb-4">
                    <input
                        type="text"
                        placeholder="Search by number, client, or date..."
                        value={searchFilter}
                        onChange={e => setSearchFilter(e.target.value)}
                        className="w-full px-4 py-2 border rounded-lg"
                    />
                </div>
                <div className="overflow-x-auto">
                    {loading && invoices.length === 0 ? <p>Loading invoices...</p> :
                     filteredInvoices.length === 0 ? <p className="text-gray-500">No invoices found.</p> :
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
                            {filteredInvoices.map(doc => (
                                <tr key={doc.id} className="border-b border-gray-200 hover:bg-gray-100">
                                    <td className="py-3 px-6 text-left">{doc.documentNumber}</td>
                                    <td className="py-3 px-6 text-left">{doc.client.name}</td>
                                    <td className="py-3 px-6 text-center">{doc.date.toDate().toLocaleDateString()}</td>
                                    <td className="py-3 px-6 text-right font-semibold">${doc.total.toFixed(2)}</td>
                                    <td className="py-3 px-6 text-center">
                                        <div className="flex item-center justify-center">
                                            <button onClick={() => navigateTo('viewDocument', doc)} className="text-gray-600 hover:text-indigo-600 font-medium py-1 px-3 rounded-lg text-sm">View</button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    }
                </div>
                {hasMore && (
                    <div className="mt-4">
                        <button
                            onClick={() => fetchInvoices(true)}
                            disabled={loading}
                            className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded w-full disabled:bg-blue-300"
                        >
                            {loading ? 'Loading...' : 'Show More'}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default InvoicesPage;
