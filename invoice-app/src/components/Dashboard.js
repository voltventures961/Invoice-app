import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../firebase/config';

const StatCard = ({ title, value, detail, color }) => (
    <div className={`p-6 rounded-lg shadow-lg text-white ${color}`}>
        <h3 className="text-lg font-semibold">{title}</h3>
        <p className="text-3xl font-bold mt-2">{value}</p>
        <p className="text-sm mt-1">{detail}</p>
    </div>
);

const Dashboard = ({ navigateTo }) => {
    const [stats, setStats] = useState({
        proformasCount: 0,
        proformasTotal: 0,
        invoicesCount: 0,
        invoicesTotal: 0,
    });
    const [recentDocuments, setRecentDocuments] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!auth.currentUser) return;
        const q = query(collection(db, `documents/${auth.currentUser.uid}/userDocuments`));
        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const docs = [];
            querySnapshot.forEach((doc) => {
                docs.push({ id: doc.id, ...doc.data() });
            });

            const proformas = docs.filter(d => d.type === 'proforma');
            const invoices = docs.filter(d => d.type === 'invoice');

            const proformasTotal = proformas.reduce((sum, doc) => sum + doc.total, 0);
            const invoicesTotal = invoices.reduce((sum, doc) => sum + doc.total, 0);

            setStats({
                proformasCount: proformas.length,
                proformasTotal: proformasTotal,
                invoicesCount: invoices.length,
                invoicesTotal: invoicesTotal,
            });

            docs.sort((a, b) => b.date.toDate() - a.date.toDate());
            setRecentDocuments(docs.slice(0, 5));

            setLoading(false);
        }, (error) => {
            console.error("Error fetching documents: ", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    if (loading) {
        return <div className="flex justify-center items-center h-screen"><div className="animate-spin rounded-full h-32 w-32 border-t-2 border-b-2 border-blue-500"></div></div>;
    }

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold text-gray-800">Dashboard</h1>
                <button onClick={() => navigateTo('newDocument')} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg shadow-md transition-transform transform hover:scale-105">
                    + Create New Document
                </button>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
                <StatCard
                    title="Potentials (Proformas)"
                    value={`$${stats.proformasTotal.toFixed(2)}`}
                    detail={`${stats.proformasCount} active proformas`}
                    color="bg-yellow-500"
                />
                <StatCard
                    title="Finalized (Invoices)"
                    value={`$${stats.invoicesTotal.toFixed(2)}`}
                    detail={`${stats.invoicesCount} invoices`}
                    color="bg-green-500"
                />
                 <StatCard
                    title="Total Revenue"
                    value={`$${stats.invoicesTotal.toFixed(2)}`}
                    detail="From all finalized invoices"
                    color="bg-blue-500"
                />
            </div>

            {/* Recent Activity */}
            <div className="bg-white p-6 rounded-lg shadow-lg">
                <h2 className="text-xl font-semibold text-gray-700 mb-4">Recent Activity</h2>
                <div className="overflow-x-auto">
                    {recentDocuments.length === 0 ? (
                        <p className="text-gray-500">No recent documents.</p>
                    ) : (
                        <table className="min-w-full bg-white">
                            <thead className="bg-gray-200 text-gray-600 uppercase text-sm leading-normal">
                                <tr>
                                    <th className="py-3 px-6 text-left">Type</th>
                                    <th className="py-3 px-6 text-left">Number</th>
                                    <th className="py-3 px-6 text-left">Client</th>
                                    <th className="py-3 px-6 text-center">Date</th>
                                    <th className="py-3 px-6 text-right">Total</th>
                                </tr>
                            </thead>
                            <tbody className="text-gray-600 text-sm font-light">
                                {recentDocuments.map(doc => (
                                    <tr key={doc.id} className="border-b border-gray-200 hover:bg-gray-100" onClick={() => navigateTo('viewDocument', doc)} style={{cursor: 'pointer'}}>
                                        <td className="py-3 px-6 text-left whitespace-nowrap">
                                            <span className={`py-1 px-3 rounded-full text-xs font-semibold ${doc.type === 'invoice' ? 'bg-green-200 text-green-700' : 'bg-yellow-200 text-yellow-700'}`}>
                                                {doc.type}
                                            </span>
                                        </td>
                                        <td className="py-3 px-6 text-left">{doc.documentNumber}</td>
                                        <td className="py-3 px-6 text-left">{doc.client.name}</td>
                                        <td className="py-3 px-6 text-center">{doc.date.toDate().toLocaleDateString()}</td>
                                        <td className="py-3 px-6 text-right font-semibold">${doc.total.toFixed(2)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
