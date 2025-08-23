import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../firebase/config';

const InvoicesPage = ({ navigateTo }) => {
    const [invoices, setInvoices] = useState([]);
    const [loading, setLoading] = useState(true);

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

    return (
        <div>
            <h1 className="text-3xl font-bold text-gray-800 mb-6">Invoices</h1>
            <div className="bg-white p-6 rounded-lg shadow-lg">
                <div className="overflow-x-auto">
                    {loading ? <p>Loading invoices...</p> :
                     invoices.length === 0 ? <p className="text-gray-500">No invoices found.</p> :
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
                            {invoices.map(doc => (
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
            </div>
        </div>
    );
};

export default InvoicesPage;
