import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, where, Timestamp } from 'firebase/firestore';
import { auth, db } from '../firebase/config';

const StatCard = ({ title, value, detail, color, isExpanded, onToggle }) => (
    <div className={`rounded-lg shadow-lg text-white ${color} transition-all duration-300 ${isExpanded ? 'p-6' : 'p-4'}`}>
        <div className="flex justify-between items-start">
            <div className="flex-1">
                <h3 className="text-lg font-semibold">{title}</h3>
                {isExpanded && (
                    <>
                        <p className="text-3xl font-bold mt-2">{value}</p>
                        <p className="text-sm mt-1">{detail}</p>
                    </>
                )}
            </div>
            <button 
                onClick={onToggle}
                className="ml-2 text-white hover:text-gray-200 transition-colors"
            >
                <svg 
                    className={`w-5 h-5 transform transition-transform ${isExpanded ? 'rotate-180' : ''}`} 
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
                </svg>
            </button>
        </div>
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
    const [pendingProformas, setPendingProformas] = useState([]); // For follow-up table
    const [unpaidInvoices, setUnpaidInvoices] = useState([]); // For follow-up table
    const [overdueInvoices, setOverdueInvoices] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filterPeriod, setFilterPeriod] = useState('allTime'); // 'allTime', 'ytd', 'thisMonth' - Default to All Time
    const [expandedCards, setExpandedCards] = useState({
        proformas: false,  // Collapsed by default
        invoices: false,   // Collapsed by default
        revenue: false     // Collapsed by default
    });

    const toggleCard = (cardName) => {
        setExpandedCards(prev => ({
            ...prev,
            [cardName]: !prev[cardName]
        }));
    };

    const getDateRange = () => {
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth();
        
        switch (filterPeriod) {
            case 'thisMonth':
                return {
                    start: new Date(year, month, 1),
                    end: new Date(year, month + 1, 0, 23, 59, 59)
                };
            case 'ytd':
                return {
                    start: new Date(year, 0, 1),
                    end: now
                };
            case 'allTime':
            default:
                return {
                    start: new Date(2020, 0, 1),
                    end: now
                };
        }
    };

    useEffect(() => {
        if (!auth.currentUser) return;
        const dateRange = getDateRange();
        
        const q = query(
            collection(db, `documents/${auth.currentUser.uid}/userDocuments`)
        );
        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const docs = [];
            querySnapshot.forEach((doc) => {
                const data = doc.data();
                const docDate = data.date.toDate();
                
                // Filter by date range and exclude cancelled/deleted documents
                if (docDate >= dateRange.start && docDate <= dateRange.end && 
                    !data.cancelled && !data.deleted) {
                    docs.push({ id: doc.id, ...data });
                }
            });

            // Filter active documents only (not converted proformas)
            const proformas = docs.filter(d => d.type === 'proforma' && !d.converted);
            const invoices = docs.filter(d => d.type === 'invoice');

            const proformasTotal = proformas.reduce((sum, doc) => sum + doc.total, 0);
            const invoicesTotal = invoices.reduce((sum, doc) => sum + doc.total, 0);

            setStats({
                proformasCount: proformas.length,
                proformasTotal: proformasTotal,
                invoicesCount: invoices.length,
                invoicesTotal: invoicesTotal,
            });

            // Set pending proformas for follow-up (prioritize older ones and unpaid)
            const sortedProformas = proformas.sort((a, b) => {
                // Prioritize unpaid, then by age
                const aPaid = a.totalPaid || 0;
                const bPaid = b.totalPaid || 0;
                if (aPaid === 0 && bPaid > 0) return -1;
                if (aPaid > 0 && bPaid === 0) return 1;
                return a.date.toDate() - b.date.toDate();
            });
            setPendingProformas(sortedProformas.slice(0, 5)); // Show top 5
            
            // Set unpaid invoices for follow-up
            const unpaid = invoices.filter(inv => {
                const totalPaid = inv.totalPaid || 0;
                return totalPaid < inv.total;
            });
            
            // Separate overdue invoices (30+ days old and unpaid)
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            
            const overdue = unpaid.filter(inv => inv.date.toDate() < thirtyDaysAgo);
            const recentUnpaid = unpaid.filter(inv => inv.date.toDate() >= thirtyDaysAgo);
            
            setUnpaidInvoices(recentUnpaid.slice(0, 5));
            setOverdueInvoices(overdue.slice(0, 5));

            docs.sort((a, b) => b.date.toDate() - a.date.toDate());
            setRecentDocuments(docs.slice(0, 5));

            setLoading(false);
        }, (error) => {
            console.error("Error fetching documents: ", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [filterPeriod]);

    if (loading) {
        return <div className="flex justify-center items-center h-screen"><div className="animate-spin rounded-full h-32 w-32 border-t-2 border-b-2 border-blue-500"></div></div>;
    }

    return (
        <div>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
                <h1 className="text-3xl font-bold text-gray-800">Dashboard</h1>
                <div className="flex flex-wrap gap-2">
                    <select 
                        value={filterPeriod} 
                        onChange={(e) => setFilterPeriod(e.target.value)}
                        className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                        <option value="thisMonth">This Month</option>
                        <option value="ytd">Year to Date</option>
                        <option value="allTime">All Time</option>
                    </select>
                    <button onClick={() => navigateTo('newDocument')} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg shadow-md transition-transform transform hover:scale-105">
                        + Create New Document
                    </button>
                </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
                <StatCard
                    title="Potentials (Proformas)"
                    value={`${stats.proformasTotal.toFixed(2)}`}
                    detail={`${stats.proformasCount} active proformas`}
                    color="bg-gradient-to-r from-yellow-400 to-yellow-600"
                    isExpanded={expandedCards.proformas}
                    onToggle={() => toggleCard('proformas')}
                />
                <StatCard
                    title="Finalized (Invoices)"
                    value={`${stats.invoicesTotal.toFixed(2)}`}
                    detail={`${stats.invoicesCount} invoices`}
                    color="bg-gradient-to-r from-green-400 to-green-600"
                    isExpanded={expandedCards.invoices}
                    onToggle={() => toggleCard('invoices')}
                />
                 <StatCard
                    title="Total Revenue"
                    value={`${stats.invoicesTotal.toFixed(2)}`}
                    detail="From all finalized invoices"
                    color="bg-gradient-to-r from-blue-400 to-blue-600"
                    isExpanded={expandedCards.revenue}
                    onToggle={() => toggleCard('revenue')}
                />
            </div>

            {/* Follow-Up Summary */}
            <div className="bg-white p-6 rounded-lg shadow-lg mb-8">
                <h2 className="text-xl font-semibold text-gray-700 mb-4">Follow-Up Required</h2>
                
                {/* Critical Overdue Section */}
                {overdueInvoices.length > 0 && (
                    <div className="mb-6 p-4 bg-red-50 rounded-lg border border-red-200">
                        <h3 className="text-lg font-medium text-red-700 mb-3 flex items-center">
                            <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd"/>
                            </svg>
                            Overdue Invoices (30+ days)
                        </h3>
                        <div className="space-y-2">
                            {overdueInvoices.map(doc => {
                                const daysOld = Math.floor((new Date() - doc.date.toDate()) / (1000 * 60 * 60 * 24));
                                const remaining = doc.total - (doc.totalPaid || 0);
                                return (
                                    <div 
                                        key={doc.id} 
                                        onClick={() => navigateTo('viewDocument', doc)}
                                        className="p-3 bg-white border border-red-300 rounded hover:bg-red-50 cursor-pointer"
                                    >
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <span className="font-medium text-sm">{doc.client.name}</span>
                                                <span className="text-xs text-gray-500 ml-2">{doc.documentNumber}</span>
                                            </div>
                                            <div className="text-right">
                                                <span className="text-sm font-semibold text-red-700">${remaining.toFixed(2)}</span>
                                                <div className="text-xs text-red-600 font-medium">
                                                    {daysOld} days overdue
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Pending Proformas */}
                    <div>
                        <h3 className="text-lg font-medium text-gray-600 mb-2">Active Proformas</h3>
                        {pendingProformas.length === 0 ? (
                            <p className="text-gray-500 text-sm">No pending proformas</p>
                        ) : (
                            <div className="space-y-2">
                                {pendingProformas.map(doc => {
                                    const daysOld = Math.floor((new Date() - doc.date.toDate()) / (1000 * 60 * 60 * 24));
                                    const totalPaid = doc.totalPaid || 0;
                                    const remaining = doc.total - totalPaid;
                                    
                                    return (
                                        <div 
                                            key={doc.id} 
                                            onClick={() => navigateTo('viewDocument', doc)}
                                            className="p-2 border rounded hover:bg-gray-50 cursor-pointer flex justify-between items-center"
                                        >
                                            <div>
                                                <span className="font-medium text-sm">{doc.client.name}</span>
                                                <span className="text-xs text-gray-500 ml-2">{doc.documentNumber}</span>
                                                {totalPaid > 0 && (
                                                    <span className="text-xs bg-yellow-100 text-yellow-800 px-1 py-0.5 rounded ml-1">
                                                        Partial ${totalPaid.toFixed(0)}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="text-right">
                                                <span className="text-sm font-semibold">
                                                    ${remaining > 0 ? remaining.toFixed(2) : doc.total.toFixed(2)}
                                                </span>
                                                <div className="text-xs text-gray-500">
                                                    {daysOld} days old
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                    
                    {/* Recent Unpaid Invoices */}
                    <div>
                        <h3 className="text-lg font-medium text-gray-600 mb-2">Recent Unpaid Invoices</h3>
                        {unpaidInvoices.length === 0 ? (
                            <p className="text-gray-500 text-sm">No recent unpaid invoices</p>
                        ) : (
                            <div className="space-y-2">
                                {unpaidInvoices.map(doc => {
                                    const daysOld = Math.floor((new Date() - doc.date.toDate()) / (1000 * 60 * 60 * 24));
                                    const totalPaid = doc.totalPaid || 0;
                                    const remaining = doc.total - totalPaid;
                                    
                                    return (
                                        <div 
                                            key={doc.id} 
                                            onClick={() => navigateTo('viewDocument', doc)}
                                            className="p-2 border rounded hover:bg-gray-50 cursor-pointer flex justify-between items-center"
                                        >
                                            <div>
                                                <span className="font-medium text-sm">{doc.client.name}</span>
                                                <span className="text-xs text-gray-500 ml-2">{doc.documentNumber}</span>
                                                {totalPaid > 0 && (
                                                    <span className="text-xs bg-green-100 text-green-800 px-1 py-0.5 rounded ml-1">
                                                        Paid ${totalPaid.toFixed(0)}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="text-right">
                                                <span className="text-sm font-semibold">
                                                    ${remaining.toFixed(2)}
                                                </span>
                                                <div className="text-xs text-gray-500">
                                                    {daysOld} days old
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
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
