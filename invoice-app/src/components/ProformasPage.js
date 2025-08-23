import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, getDocs, orderBy, limit, startAfter, doc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../firebase/config';

const ProformasPage = ({ navigateTo }) => {
    const [proformas, setProformas] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showHistoryModal, setShowHistoryModal] = useState(false);
    const [historyDocs, setHistoryDocs] = useState([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [proformaLastVisible, setProformaLastVisible] = useState(null);
    const [hasMoreProformas, setHasMoreProformas] = useState(true);
    const [historyFilter, setHistoryFilter] = useState('');
    const [showDeletedModal, setShowDeletedModal] = useState(false);
    const [deletedProformas, setDeletedProformas] = useState([]);
    const [searchFilter, setSearchFilter] = useState('');

    const fetchProformas = async (loadMore = false) => {
        if (!auth.currentUser) return;
        setLoading(true);

        let q = query(
            collection(db, `documents/${auth.currentUser.uid}/userDocuments`),
            where('type', '==', 'proforma'),
            where('status', '!=', 'deleted'),
            orderBy('date', 'desc'),
            limit(20)
        );

        if (loadMore && proformaLastVisible) {
            q = query(
                collection(db, `documents/${auth.currentUser.uid}/userDocuments`),
                where('type', '==', 'proforma'),
                where('status', '!=', 'deleted'),
                orderBy('date', 'desc'),
                startAfter(proformaLastVisible),
                limit(20)
            );
        }

        try {
            const documentSnapshots = await getDocs(q);
            const newProformas = documentSnapshots.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            const newLastVisible = documentSnapshots.docs[documentSnapshots.docs.length - 1];
            setProformaLastVisible(newLastVisible);

            setProformas(prev => loadMore ? [...prev, ...newProformas] : newProformas);
            setHasMoreProformas(newProformas.length === 20);
        } catch (error) {
            console.error("Error fetching proformas: ", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchProformas();
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

            setHistoryDocs(prev => loadMore ? [...prev, ...newInvoices] : newInvoices);
            setHasMore(newInvoices.length === 10);
        } catch (error) {
            console.error("Error fetching invoice history: ", error);
        } finally {
            setHistoryLoading(false);
        }
    };

    const handleOpenHistoryModal = () => {
        setShowHistoryModal(true);
        setHistoryDocs([]);
        setLastVisible(null);
        setHasMore(true);
        fetchHistoryInvoices();
    };

    const handleOpenDeletedModal = async () => {
        if (!auth.currentUser) return;
        setHistoryLoading(true);
        const q = query(
            collection(db, `documents/${auth.currentUser.uid}/userDocuments`),
            where('type', '==', 'proforma'),
            where('status', '==', 'deleted')
        );
        const querySnapshot = await getDocs(q);
        const docs = [];
        querySnapshot.forEach((doc) => {
            docs.push({ id: doc.id, ...doc.data() });
        });
        docs.sort((a, b) => b.date.toDate() - a.date.toDate());
        setDeletedProformas(docs);
        setHistoryLoading(false);
        setShowDeletedModal(true);
    };

    const handleConvertToInvoice = (proforma) => {
        navigateTo('newDocument', { ...proforma, isConversion: true });
    };

    const handleDelete = async (id) => {
        if (window.confirm("Are you sure you want to delete this proforma?")) {
            const docRef = doc(db, `documents/${auth.currentUser.uid}/userDocuments`, id);
            try {
                await updateDoc(docRef, { status: 'deleted' });
            } catch (error) {
                console.error("Error deleting proforma: ", error);
            }
        }
    };

    const filteredHistoryDocs = historyDocs.filter(invoice => {
        const filter = historyFilter.toLowerCase();
        return (
            invoice.documentNumber.toLowerCase().includes(filter) ||
            invoice.client.name.toLowerCase().includes(filter)
        );
    });

    const filteredProformas = proformas.filter(proforma => {
        const filter = searchFilter.toLowerCase();
        return (
            proforma.documentNumber.toLowerCase().includes(filter) ||
            proforma.client.name.toLowerCase().includes(filter) ||
            proforma.date.toDate().toLocaleDateString().includes(filter)
        );
    });

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold text-gray-800">Proformas</h1>
                <div>
                    <button onClick={handleOpenHistoryModal} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg shadow-md mr-2">
                        View Invoice History
                    </button>
                    <button onClick={handleOpenDeletedModal} className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded-lg shadow-md">
                        View Deleted Proformas
                    </button>
                </div>
            </div>
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
                    {loading && proformas.length === 0 ? <p>Loading proformas...</p> :
                     filteredProformas.length === 0 ? <p className="text-gray-500">No proformas found.</p> :
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
                            {filteredProformas.map(doc => (
                                <tr key={doc.id} className="border-b border-gray-200 hover:bg-gray-100">
                                    <td className="py-3 px-6 text-left">{doc.documentNumber}</td>
                                    <td className="py-3 px-6 text-left">{doc.client.name}</td>
                                    <td className="py-3 px-6 text-center">{doc.date.toDate().toLocaleDateString()}</td>
                                    <td className="py-3 px-6 text-right font-semibold">${doc.total.toFixed(2)}</td>
                                    <td className="py-3 px-6 text-center">
                                        <div className="flex item-center justify-center">
                                            <button onClick={() => navigateTo('viewDocument', doc)} className="text-gray-600 hover:text-indigo-600 font-medium py-1 px-3 rounded-lg text-sm">View</button>
                                            <button onClick={() => navigateTo('newDocument', doc)} className="text-gray-600 hover:text-purple-600 font-medium py-1 px-3 rounded-lg text-sm">Edit</button>
                                            <button onClick={() => handleConvertToInvoice(doc)} className="text-green-600 hover:text-green-800 font-medium py-1 px-3 rounded-lg text-sm">Convert to Invoice</button>
                                            <button onClick={() => handleDelete(doc.id)} className="text-red-600 hover:text-red-800 font-medium py-1 px-3 rounded-lg text-sm">Delete</button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    }
                </div>
                {hasMoreProformas && (
                    <div className="mt-4">
                        <button
                            onClick={() => fetchProformas(true)}
                            disabled={loading}
                            className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded w-full disabled:bg-blue-300"
                        >
                            {loading ? 'Loading...' : 'Show More'}
                        </button>
                    </div>
                )}
            </div>

            {showHistoryModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center p-4">
                    <div className="bg-white rounded-lg shadow-2xl w-full max-w-4xl max-h-full flex flex-col">
                        <div className="flex justify-between items-center p-4 border-b">
                            <h2 className="text-xl font-bold">Invoice History (Last 30 Days)</h2>
                            <button onClick={() => setShowHistoryModal(false)} className="text-gray-400 hover:text-gray-600">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
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
                            {historyLoading && historyDocs.length === 0 ? <p>Loading history...</p> :
                             filteredHistoryDocs.length === 0 ? <p>No invoices found in the last 30 days.</p> :
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
                                    {filteredHistoryDocs.map(doc => (
                                        <tr key={doc.id} className="border-b border-gray-200 hover:bg-gray-100">
                                            <td className="py-3 px-6 text-left">{doc.documentNumber}</td>
                                            <td className="py-3 px-6 text-left">{doc.client.name}</td>
                                            <td className="py-3 px-6 text-center">{doc.date.toDate().toLocaleDateString()}</td>
                                            <td className="py-3 px-6 text-right font-semibold">${doc.total.toFixed(2)}</td>
                                            <td className="py-3 px-6 text-center">
                                                <button onClick={() => navigateTo('viewDocument', doc)} className="text-gray-600 hover:text-indigo-600 font-medium py-1 px-3 rounded-lg text-sm">View</button>
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

            {showDeletedModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center p-4">
                    <div className="bg-white rounded-lg shadow-2xl w-full max-w-4xl max-h-full flex flex-col">
                        <div className="flex justify-between items-center p-4 border-b">
                            <h2 className="text-xl font-bold">Deleted Proformas</h2>
                            <button onClick={() => setShowDeletedModal(false)} className="text-gray-400 hover:text-gray-600">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                            </button>
                        </div>
                        <div className="overflow-y-auto flex-grow p-4">
                            {historyLoading ? <p>Loading...</p> :
                             deletedProformas.length === 0 ? <p>No deleted proformas found.</p> :
                            <table className="min-w-full bg-white">
                                <thead className="bg-gray-200 text-gray-600 uppercase text-sm leading-normal">
                                    <tr>
                                        <th className="py-3 px-6 text-left">Number</th>
                                        <th className="py-3 px-6 text-left">Client</th>
                                        <th className="py-3 px-6 text-center">Date</th>
                                        <th className="py-3 px-6 text-right">Total</th>
                                    </tr>
                                </thead>
                                <tbody className="text-gray-600 text-sm font-light">
                                    {deletedProformas.map(doc => (
                                        <tr key={doc.id} className="border-b border-gray-200 hover:bg-gray-100">
                                            <td className="py-3 px-6 text-left">{doc.documentNumber}</td>
                                            <td className="py-3 px-6 text-left">{doc.client.name}</td>
                                            <td className="py-3 px-6 text-center">{doc.date.toDate().toLocaleDateString()}</td>
                                            <td className="py-3 px-6 text-right font-semibold">${doc.total.toFixed(2)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            }
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ProformasPage;
