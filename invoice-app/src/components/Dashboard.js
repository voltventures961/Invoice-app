import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../firebase/config';

const Dashboard = ({ navigateTo }) => {
    const [documents, setDocuments] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!auth.currentUser) return;
        const q = query(collection(db, `documents/${auth.currentUser.uid}/userDocuments`));
        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const docs = [];
            querySnapshot.forEach((doc) => {
                docs.push({ id: doc.id, ...doc.data() });
            });
            // Sort documents by date, newest first
            docs.sort((a, b) => b.date.toDate() - a.date.toDate());
            setDocuments(docs);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching documents: ", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    return (
        <div>
            <h1 className="text-3xl font-bold text-gray-800 mb-6">Dashboard</h1>
            <div className="flex justify-end mb-6">
                <button onClick={() => navigateTo('newDocument')} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg shadow-md transition-transform transform hover:scale-105 transition-colors duration-200">
                    + Create New Document
                </button>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-lg">
                <h2 className="text-xl font-semibold text-gray-700 mb-4">Recent Documents</h2>
                <div className="overflow-x-auto">
                    {loading ? <p>Loading documents...</p> :
                     documents.length === 0 ? <p className="text-gray-500">No documents found. Create one to get started!</p> :
                    <table className="min-w-full bg-white">
                        <thead className="bg-gray-200 text-gray-600 uppercase text-sm leading-normal">
                            <tr>
                                <th className="py-3 px-6 text-left">Type</th>
                                <th className="py-3 px-6 text-left">Number</th>
                                <th className="py-3 px-6 text-left">Client</th>
                                <th className="py-3 px-6 text-center">Date</th>
                                <th className="py-3 px-6 text-right">Total</th>
                                <th className="py-3 px-6 text-center">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="text-gray-600 text-sm font-light">
                            {documents.map(doc => (
                                <tr key={doc.id} className="border-b border-gray-200 hover:bg-gray-100">
                                    <td className="py-3 px-6 text-left whitespace-nowrap">
                                        <span className={`py-1 px-3 rounded-full text-xs ${doc.type === 'invoice' ? 'bg-green-200 text-green-700' : 'bg-yellow-200 text-yellow-700'}`}>
                                            {doc.type}
                                        </span>
                                    </td>
                                    <td className="py-3 px-6 text-left">{doc.documentNumber}</td>
                                    <td className="py-3 px-6 text-left">{doc.client.name}</td>
                                    <td className="py-3 px-6 text-center">{doc.date.toDate().toLocaleDateString()}</td>
                                    <td className="py-3 px-6 text-right font-semibold">${doc.total.toFixed(2)}</td>
                                    <td className="py-3 px-6 text-center">
                                        <div className="flex item-center justify-center">
                                            <button onClick={() => navigateTo('viewDocument', doc)} className="w-4 mr-2 transform hover:text-purple-500 hover:scale-110">
                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                                            </button>
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

export default Dashboard;
