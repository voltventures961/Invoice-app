import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, where, Timestamp } from 'firebase/firestore';
import { auth, db } from '../firebase/config';

const AccountingPage = () => {
    const [documents, setDocuments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filterPeriod, setFilterPeriod] = useState('thisMonth'); // 'allTime', 'ytd', 'thisMonth', 'custom'
    const [customStartDate, setCustomStartDate] = useState('');
    const [customEndDate, setCustomEndDate] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('all'); // 'all', 'labor', 'items'
    const [stats, setStats] = useState({
        totalRevenue: 0,
        totalCost: 0,
        totalProfit: 0,
        laborRevenue: 0,
        itemsRevenue: 0,
        vatCollected: 0,
        invoiceCount: 0,
        averageInvoiceValue: 0
    });

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
            case 'custom':
                return {
                    start: customStartDate ? new Date(customStartDate) : new Date(year, month, 1),
                    end: customEndDate ? new Date(customEndDate) : now
                };
            case 'allTime':
            default:
                return {
                    start: new Date(2020, 0, 1), // Assuming business started after 2020
                    end: now
                };
        }
    };

    useEffect(() => {
        if (!auth.currentUser) return;

        const dateRange = getDateRange();
        const startTimestamp = Timestamp.fromDate(dateRange.start);
        const endTimestamp = Timestamp.fromDate(dateRange.end);

        let q = query(
            collection(db, `documents/${auth.currentUser.uid}/userDocuments`),
            where('type', '==', 'invoice')
        );

        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const docs = [];
            querySnapshot.forEach((doc) => {
                const data = doc.data();
                const docDate = data.date.toDate();
                
                // Filter by date range
                if (docDate >= dateRange.start && docDate <= dateRange.end) {
                    docs.push({ id: doc.id, ...data });
                }
            });

            // Calculate statistics
            let totalRevenue = 0;
            let totalCost = 0;
            let laborRevenue = 0;
            let itemsRevenue = 0;
            let vatCollected = 0;

            docs.forEach(doc => {
                totalRevenue += doc.total || 0;
                vatCollected += doc.vatAmount || 0;
                laborRevenue += doc.laborPrice || 0;
                
                // Calculate items revenue and cost
                if (doc.items && Array.isArray(doc.items)) {
                    doc.items.forEach(item => {
                        const itemRevenue = (item.qty || 0) * (item.unitPrice || 0);
                        const itemCost = (item.qty || 0) * (item.buyingPrice || 0);
                        itemsRevenue += itemRevenue;
                        totalCost += itemCost;
                    });
                }
            });

            const totalProfit = totalRevenue - totalCost - vatCollected;
            const averageInvoiceValue = docs.length > 0 ? totalRevenue / docs.length : 0;

            setStats({
                totalRevenue,
                totalCost,
                totalProfit,
                laborRevenue,
                itemsRevenue,
                vatCollected,
                invoiceCount: docs.length,
                averageInvoiceValue
            });

            // Sort documents by date
            docs.sort((a, b) => b.date.toDate() - a.date.toDate());
            setDocuments(docs);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching accounting data: ", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [filterPeriod, customStartDate, customEndDate]);

    const exportToCSV = () => {
        const headers = ['Date', 'Invoice #', 'Client', 'Items Revenue', 'Labor Revenue', 'VAT', 'Total', 'Cost', 'Profit'];
        const rows = documents.map(doc => {
            const itemsRevenue = doc.items ? doc.items.reduce((sum, item) => sum + (item.qty * item.unitPrice), 0) : 0;
            const cost = doc.items ? doc.items.reduce((sum, item) => sum + (item.qty * (item.buyingPrice || 0)), 0) : 0;
            const profit = doc.total - cost - (doc.vatAmount || 0);
            
            return [
                doc.date.toDate().toLocaleDateString(),
                doc.documentNumber,
                doc.client.name,
                itemsRevenue.toFixed(2),
                (doc.laborPrice || 0).toFixed(2),
                (doc.vatAmount || 0).toFixed(2),
                doc.total.toFixed(2),
                cost.toFixed(2),
                profit.toFixed(2)
            ];
        });

        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `accounting_report_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
    };

    const getFilteredDocuments = () => {
        if (categoryFilter === 'labor') {
            return documents.filter(doc => doc.laborPrice && doc.laborPrice > 0);
        } else if (categoryFilter === 'items') {
            return documents.filter(doc => doc.items && doc.items.length > 0);
        }
        return documents;
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center h-screen">
                <div className="animate-spin rounded-full h-32 w-32 border-t-2 border-b-2 border-blue-500"></div>
            </div>
        );
    }

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold text-gray-800">Accounting & Reports</h1>
                <button 
                    onClick={exportToCSV}
                    className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg shadow-md"
                >
                    Export to CSV
                </button>
            </div>

            {/* Filter Controls */}
            <div className="bg-white p-4 rounded-lg shadow-lg mb-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Period</label>
                        <select 
                            value={filterPeriod} 
                            onChange={(e) => setFilterPeriod(e.target.value)}
                            className="w-full p-2 border border-gray-300 rounded-md"
                        >
                            <option value="thisMonth">This Month</option>
                            <option value="ytd">Year to Date</option>
                            <option value="allTime">All Time</option>
                            <option value="custom">Custom Range</option>
                        </select>
                    </div>
                    
                    {filterPeriod === 'custom' && (
                        <>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                                <input 
                                    type="date" 
                                    value={customStartDate}
                                    onChange={(e) => setCustomStartDate(e.target.value)}
                                    className="w-full p-2 border border-gray-300 rounded-md"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                                <input 
                                    type="date" 
                                    value={customEndDate}
                                    onChange={(e) => setCustomEndDate(e.target.value)}
                                    className="w-full p-2 border border-gray-300 rounded-md"
                                />
                            </div>
                        </>
                    )}
                    
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                        <select 
                            value={categoryFilter} 
                            onChange={(e) => setCategoryFilter(e.target.value)}
                            className="w-full p-2 border border-gray-300 rounded-md"
                        >
                            <option value="all">All Categories</option>
                            <option value="labor">Labor Only</option>
                            <option value="items">Items Only</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* Key Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <div className="bg-gradient-to-r from-green-400 to-green-600 p-6 rounded-lg shadow-lg text-white">
                    <h3 className="text-lg font-semibold">Total Revenue</h3>
                    <p className="text-3xl font-bold mt-2">${stats.totalRevenue.toFixed(2)}</p>
                    <p className="text-sm mt-1">{stats.invoiceCount} invoices</p>
                </div>
                
                <div className="bg-gradient-to-r from-blue-400 to-blue-600 p-6 rounded-lg shadow-lg text-white">
                    <h3 className="text-lg font-semibold">Net Profit</h3>
                    <p className="text-3xl font-bold mt-2">${stats.totalProfit.toFixed(2)}</p>
                    <p className="text-sm mt-1">
                        {stats.totalRevenue > 0 
                            ? `${((stats.totalProfit / stats.totalRevenue) * 100).toFixed(1)}% margin`
                            : '0% margin'}
                    </p>
                </div>
                
                <div className="bg-gradient-to-r from-purple-400 to-purple-600 p-6 rounded-lg shadow-lg text-white">
                    <h3 className="text-lg font-semibold">Average Invoice</h3>
                    <p className="text-3xl font-bold mt-2">${stats.averageInvoiceValue.toFixed(2)}</p>
                    <p className="text-sm mt-1">Per invoice</p>
                </div>
                
                <div className="bg-gradient-to-r from-yellow-400 to-yellow-600 p-6 rounded-lg shadow-lg text-white">
                    <h3 className="text-lg font-semibold">VAT Collected</h3>
                    <p className="text-3xl font-bold mt-2">${stats.vatCollected.toFixed(2)}</p>
                    <p className="text-sm mt-1">11% VAT</p>
                </div>
            </div>

            {/* Revenue Breakdown */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                <div className="bg-white p-6 rounded-lg shadow-lg">
                    <h2 className="text-xl font-semibold text-gray-700 mb-4">Revenue Breakdown</h2>
                    <div className="space-y-3">
                        <div className="flex justify-between items-center">
                            <span className="text-gray-600">Items Revenue</span>
                            <span className="font-semibold">${stats.itemsRevenue.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-gray-600">Labor Revenue</span>
                            <span className="font-semibold">${stats.laborRevenue.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between items-center pt-3 border-t">
                            <span className="text-gray-700 font-medium">Subtotal</span>
                            <span className="font-bold">${(stats.itemsRevenue + stats.laborRevenue).toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-gray-600">VAT (11%)</span>
                            <span className="font-semibold">${stats.vatCollected.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between items-center pt-3 border-t">
                            <span className="text-gray-900 font-bold">Total Revenue</span>
                            <span className="font-bold text-green-600">${stats.totalRevenue.toFixed(2)}</span>
                        </div>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-lg shadow-lg">
                    <h2 className="text-xl font-semibold text-gray-700 mb-4">Profit Analysis</h2>
                    <div className="space-y-3">
                        <div className="flex justify-between items-center">
                            <span className="text-gray-600">Revenue (excl. VAT)</span>
                            <span className="font-semibold">${(stats.totalRevenue - stats.vatCollected).toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-gray-600">Cost of Goods</span>
                            <span className="font-semibold text-red-600">-${stats.totalCost.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between items-center pt-3 border-t">
                            <span className="text-gray-700 font-medium">Gross Profit</span>
                            <span className="font-bold">${(stats.totalRevenue - stats.vatCollected - stats.totalCost).toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-gray-600">Profit Margin</span>
                            <span className="font-semibold">
                                {stats.totalRevenue > 0 
                                    ? `${((stats.totalProfit / (stats.totalRevenue - stats.vatCollected)) * 100).toFixed(1)}%`
                                    : '0%'}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Detailed Transactions */}
            <div className="bg-white p-6 rounded-lg shadow-lg">
                <h2 className="text-xl font-semibold text-gray-700 mb-4">Transaction Details</h2>
                <div className="overflow-x-auto">
                    {getFilteredDocuments().length === 0 ? (
                        <p className="text-gray-500">No transactions found for the selected period.</p>
                    ) : (
                        <table className="min-w-full bg-white">
                            <thead className="bg-gray-200 text-gray-600 uppercase text-sm leading-normal">
                                <tr>
                                    <th className="py-3 px-6 text-left">Date</th>
                                    <th className="py-3 px-6 text-left">Invoice #</th>
                                    <th className="py-3 px-6 text-left">Client</th>
                                    <th className="py-3 px-6 text-right">Items</th>
                                    <th className="py-3 px-6 text-right">Labor</th>
                                    <th className="py-3 px-6 text-right">VAT</th>
                                    <th className="py-3 px-6 text-right">Total</th>
                                    <th className="py-3 px-6 text-right">Profit</th>
                                </tr>
                            </thead>
                            <tbody className="text-gray-600 text-sm font-light">
                                {getFilteredDocuments().map(doc => {
                                    const itemsRevenue = doc.items ? doc.items.reduce((sum, item) => sum + (item.qty * item.unitPrice), 0) : 0;
                                    const cost = doc.items ? doc.items.reduce((sum, item) => sum + (item.qty * (item.buyingPrice || 0)), 0) : 0;
                                    const profit = doc.total - cost - (doc.vatAmount || 0);
                                    
                                    return (
                                        <tr key={doc.id} className="border-b border-gray-200 hover:bg-gray-100">
                                            <td className="py-3 px-6 text-left">{doc.date.toDate().toLocaleDateString()}</td>
                                            <td className="py-3 px-6 text-left">{doc.documentNumber}</td>
                                            <td className="py-3 px-6 text-left">{doc.client.name}</td>
                                            <td className="py-3 px-6 text-right">${itemsRevenue.toFixed(2)}</td>
                                            <td className="py-3 px-6 text-right">${(doc.laborPrice || 0).toFixed(2)}</td>
                                            <td className="py-3 px-6 text-right">${(doc.vatAmount || 0).toFixed(2)}</td>
                                            <td className="py-3 px-6 text-right font-semibold">${doc.total.toFixed(2)}</td>
                                            <td className={`py-3 px-6 text-right font-semibold ${profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                ${profit.toFixed(2)}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AccountingPage;
