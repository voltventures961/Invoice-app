import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, where, Timestamp } from 'firebase/firestore';
import { auth, db } from '../firebase/config';

const AccountingPage = () => {
    const [documents, setDocuments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filterPeriod, setFilterPeriod] = useState('thisMonth'); // 'allTime', 'ytd', 'thisMonth', 'lastMonth', 'custom'
    const [customStartDate, setCustomStartDate] = useState('');
    const [customEndDate, setCustomEndDate] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('all'); // 'all', 'labor', 'items'
    const [clientFilter, setClientFilter] = useState('all'); // 'all' or client id
    const [statusFilter, setStatusFilter] = useState('all'); // 'all', 'paid', 'unpaid', 'overdue'
    const [documentTypeFilter, setDocumentTypeFilter] = useState('all'); // 'all', 'invoice', 'proforma'
    const [sortColumn, setSortColumn] = useState('date'); // Column to sort by
    const [sortDirection, setSortDirection] = useState('desc'); // 'asc' or 'desc'
    const [uniqueClients, setUniqueClients] = useState([]);
    const [stats, setStats] = useState({
        totalRevenue: 0,
        totalCost: 0,
        totalProfit: 0,
        laborRevenue: 0,
        itemsRevenue: 0,
        mandaysRevenue: 0,
        vatCollected: 0,
        invoiceCount: 0,
        averageInvoiceValue: 0,
        totalPaid: 0,
        totalUnpaid: 0,
        overdueAmount: 0
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
            case 'lastMonth':
                return {
                    start: new Date(year, month - 1, 1),
                    end: new Date(year, month, 0, 23, 59, 59)
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

        // Query for both invoices and proformas
        let q = query(
            collection(db, `documents/${auth.currentUser.uid}/userDocuments`)
        );

        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const docs = [];
            querySnapshot.forEach((doc) => {
                const data = doc.data();
                const docDate = data.date.toDate();
                
                // Filter by date range and exclude cancelled documents
                if (docDate >= dateRange.start && docDate <= dateRange.end && 
                    !data.cancelled && !data.deleted) {
                    docs.push({ id: doc.id, ...data });
                }
            });

            // Calculate statistics
            let totalRevenue = 0;
            let totalCost = 0;
            let laborRevenue = 0;
            let itemsRevenue = 0;
            let mandaysRevenue = 0;
            let vatCollected = 0;
            let totalPaid = 0;
            let totalUnpaid = 0;
            let overdueAmount = 0;
            
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

            docs.forEach(doc => {
                totalRevenue += doc.total || 0;
                vatCollected += doc.vatAmount || 0;
                laborRevenue += doc.laborPrice || 0;
                
                // Separate mandays from labor revenue
                if (doc.mandays && doc.mandays > 0) {
                    mandaysRevenue += (doc.mandays * (doc.mandayRate || 0));
                }
                
                // Calculate payment status
                const paid = doc.totalPaid || 0;
                totalPaid += paid;
                const unpaid = Math.max(0, (doc.total || 0) - paid);
                totalUnpaid += unpaid;
                
                // Check if overdue
                if (unpaid > 0 && doc.date.toDate() < thirtyDaysAgo) {
                    overdueAmount += unpaid;
                }
                
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

            // Calculate profit excluding mandays (mandays are not profit, they're costs to the business)
            const totalProfit = totalRevenue - totalCost - vatCollected - mandaysRevenue;
            const averageInvoiceValue = docs.length > 0 ? totalRevenue / docs.length : 0;

            setStats({
                totalRevenue,
                totalCost,
                totalProfit,
                laborRevenue,
                itemsRevenue,
                mandaysRevenue,
                vatCollected,
                invoiceCount: docs.length,
                averageInvoiceValue,
                totalPaid,
                totalUnpaid,
                overdueAmount
            });

            // Get unique clients for filter dropdown
            const clientsSet = new Set(docs.map(doc => JSON.stringify({ id: doc.client.id, name: doc.client.name })));
            const clientsList = Array.from(clientsSet).map(str => JSON.parse(str));
            setUniqueClients(clientsList);

            // Sort documents by date
            docs.sort((a, b) => b.date.toDate() - a.date.toDate());
            setDocuments(docs);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching accounting data: ", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [filterPeriod, customStartDate, customEndDate, documentTypeFilter]);

    const exportToCSV = () => {
        const headers = ['Date', 'Document #', 'Type', 'Client', 'Items Revenue', 'Labor Revenue', 'Mandays Revenue', 'VAT', 'Total', 'Cost', 'Mandays Cost', 'Net Profit'];
        const rows = getFilteredDocuments().map(doc => {
            const itemsRevenue = doc.items ? doc.items.reduce((sum, item) => sum + (item.qty * item.unitPrice), 0) : 0;
            const cost = doc.items ? doc.items.reduce((sum, item) => sum + (item.qty * (item.buyingPrice || 0)), 0) : 0;
            const mandaysRevenue = doc.mandays ? (doc.mandays * (doc.mandayRate || 0)) : 0;
            const profit = doc.total - cost - (doc.vatAmount || 0) - mandaysRevenue;
            
            return [
                doc.date.toDate().toLocaleDateString(),
                doc.documentNumber,
                doc.type === 'invoice' ? 'Invoice' : 'Proforma',
                doc.client.name,
                itemsRevenue.toFixed(2),
                (doc.laborPrice || 0).toFixed(2),
                mandaysRevenue.toFixed(2),
                (doc.vatAmount || 0).toFixed(2),
                doc.total.toFixed(2),
                cost.toFixed(2),
                mandaysRevenue.toFixed(2),
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

    const handleSort = (column) => {
        if (sortColumn === column) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setSortColumn(column);
            setSortDirection('asc');
        }
    };

    const getFilteredDocuments = () => {
        let filtered = documents;
        
        // Apply document type filter
        if (documentTypeFilter === 'invoice') {
            filtered = filtered.filter(doc => doc.type === 'invoice');
        } else if (documentTypeFilter === 'proforma') {
            filtered = filtered.filter(doc => doc.type === 'proforma');
        }
        
        // Apply category filter
        if (categoryFilter === 'labor') {
            filtered = filtered.filter(doc => doc.laborPrice && doc.laborPrice > 0);
        } else if (categoryFilter === 'items') {
            filtered = filtered.filter(doc => doc.items && doc.items.length > 0);
        }
        
        // Apply client filter
        if (clientFilter !== 'all') {
            filtered = filtered.filter(doc => doc.client.id === clientFilter);
        }
        
        // Apply status filter based on payment tracking
        if (statusFilter === 'paid') {
            filtered = filtered.filter(doc => {
                const totalPaid = doc.totalPaid || 0;
                return totalPaid >= doc.total;
            });
        } else if (statusFilter === 'unpaid') {
            filtered = filtered.filter(doc => {
                const totalPaid = doc.totalPaid || 0;
                return totalPaid < doc.total;
            });
        } else if (statusFilter === 'overdue') {
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            filtered = filtered.filter(doc => {
                const totalPaid = doc.totalPaid || 0;
                return totalPaid < doc.total && doc.date.toDate() < thirtyDaysAgo;
            });
        }
        
        // Apply sorting
        filtered.sort((a, b) => {
            let aVal, bVal;
            
            switch (sortColumn) {
                case 'date':
                    aVal = a.date.toDate();
                    bVal = b.date.toDate();
                    break;
                case 'number':
                    aVal = a.documentNumber;
                    bVal = b.documentNumber;
                    break;
                case 'client':
                    aVal = a.client.name;
                    bVal = b.client.name;
                    break;
                case 'total':
                    aVal = a.total;
                    bVal = b.total;
                    break;
                default:
                    aVal = a.date.toDate();
                    bVal = b.date.toDate();
            }
            
            if (sortDirection === 'asc') {
                return aVal > bVal ? 1 : -1;
            } else {
                return aVal < bVal ? 1 : -1;
            }
        });
        
        return filtered;
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
            <div className="bg-white p-6 rounded-lg shadow-lg mb-6">
                <h3 className="text-lg font-medium text-gray-700 mb-4">Filters & Controls</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Period</label>
                        <select 
                            value={filterPeriod} 
                            onChange={(e) => setFilterPeriod(e.target.value)}
                            className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        >
                            <option value="thisMonth">This Month</option>
                            <option value="lastMonth">Last Month</option>
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
                                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                                <input 
                                    type="date" 
                                    value={customEndDate}
                                    onChange={(e) => setCustomEndDate(e.target.value)}
                                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                />
                            </div>
                        </>
                    )}
                    
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Document Type</label>
                        <select 
                            value={documentTypeFilter} 
                            onChange={(e) => setDocumentTypeFilter(e.target.value)}
                            className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        >
                            <option value="all">All Documents</option>
                            <option value="invoice">Invoices Only</option>
                            <option value="proforma">Proformas Only</option>
                        </select>
                    </div>
                    
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                        <select 
                            value={categoryFilter} 
                            onChange={(e) => setCategoryFilter(e.target.value)}
                            className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        >
                            <option value="all">All Categories</option>
                            <option value="labor">Labor Only</option>
                            <option value="items">Items Only</option>
                        </select>
                    </div>
                    
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Client</label>
                        <select 
                            value={clientFilter} 
                            onChange={(e) => setClientFilter(e.target.value)}
                            className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        >
                            <option value="all">All Clients</option>
                            {uniqueClients.map(client => (
                                <option key={client.id} value={client.id}>{client.name}</option>
                            ))}
                        </select>
                    </div>
                    
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                        <select 
                            value={statusFilter} 
                            onChange={(e) => setStatusFilter(e.target.value)}
                            className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        >
                            <option value="all">All Status</option>
                            <option value="paid">Paid</option>
                            <option value="unpaid">Unpaid</option>
                            <option value="overdue">Overdue (30+ days)</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* Key Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <div className="bg-gradient-to-r from-green-400 to-green-600 p-6 rounded-lg shadow-lg text-white">
                    <h3 className="text-lg font-semibold">Total Revenue</h3>
                    <p className="text-3xl font-bold mt-2">${stats.totalRevenue.toFixed(2)}</p>
                    <p className="text-sm mt-1">{stats.invoiceCount} documents</p>
                </div>
                
                <div className="bg-gradient-to-r from-blue-400 to-blue-600 p-6 rounded-lg shadow-lg text-white">
                    <h3 className="text-lg font-semibold">Net Profit</h3>
                    <p className="text-3xl font-bold mt-2">${stats.totalProfit.toFixed(2)}</p>
                    <p className="text-sm mt-1">
                        {stats.totalRevenue > 0 
                            ? `${((stats.totalProfit / (stats.totalRevenue - stats.vatCollected)) * 100).toFixed(1)}% margin`
                            : '0% margin'}
                    </p>
                </div>
                
                <div className="bg-gradient-to-r from-purple-400 to-purple-600 p-6 rounded-lg shadow-lg text-white">
                    <h3 className="text-lg font-semibold">Average Document</h3>
                    <p className="text-3xl font-bold mt-2">${stats.averageInvoiceValue.toFixed(2)}</p>
                    <p className="text-sm mt-1">Per document</p>
                </div>
                
                <div className="bg-gradient-to-r from-yellow-400 to-yellow-600 p-6 rounded-lg shadow-lg text-white">
                    <h3 className="text-lg font-semibold">VAT Collected</h3>
                    <p className="text-3xl font-bold mt-2">${stats.vatCollected.toFixed(2)}</p>
                    <p className="text-sm mt-1">11% VAT</p>
                </div>
            </div>

            {/* Payment Status Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div className="bg-white p-6 rounded-lg shadow-lg border-l-4 border-green-500">
                    <h3 className="text-lg font-semibold text-gray-700">Collected Payments</h3>
                    <p className="text-3xl font-bold text-green-600 mt-2">${stats.totalPaid.toFixed(2)}</p>
                    <p className="text-sm text-gray-500 mt-1">
                        {stats.totalRevenue > 0 
                            ? `${((stats.totalPaid / stats.totalRevenue) * 100).toFixed(1)}% collected`
                            : '0% collected'}
                    </p>
                </div>
                
                <div className="bg-white p-6 rounded-lg shadow-lg border-l-4 border-orange-500">
                    <h3 className="text-lg font-semibold text-gray-700">Outstanding Amount</h3>
                    <p className="text-3xl font-bold text-orange-600 mt-2">${stats.totalUnpaid.toFixed(2)}</p>
                    <p className="text-sm text-gray-500 mt-1">
                        {stats.totalRevenue > 0 
                            ? `${((stats.totalUnpaid / stats.totalRevenue) * 100).toFixed(1)}% unpaid`
                            : '0% unpaid'}
                    </p>
                </div>
                
                <div className="bg-white p-6 rounded-lg shadow-lg border-l-4 border-red-500">
                    <h3 className="text-lg font-semibold text-gray-700">Overdue Amount</h3>
                    <p className="text-3xl font-bold text-red-600 mt-2">${stats.overdueAmount.toFixed(2)}</p>
                    <p className="text-sm text-gray-500 mt-1">30+ days overdue</p>
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
                        <div className="flex justify-between items-center">
                            <span className="text-gray-600">Mandays Revenue</span>
                            <span className="font-semibold text-orange-600">${stats.mandaysRevenue.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between items-center pt-3 border-t">
                            <span className="text-gray-700 font-medium">Subtotal</span>
                            <span className="font-bold">${(stats.itemsRevenue + stats.laborRevenue + stats.mandaysRevenue).toFixed(2)}</span>
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
                        <div className="flex justify-between items-center">
                            <span className="text-gray-600">Mandays (Cost)</span>
                            <span className="font-semibold text-red-600">-${stats.mandaysRevenue.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between items-center pt-3 border-t">
                            <span className="text-gray-700 font-medium">Net Profit</span>
                            <span className="font-bold text-green-600">${stats.totalProfit.toFixed(2)}</span>
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
                        <div className="text-center py-8">
                            <p className="text-gray-500 text-lg">No transactions found for the selected filters.</p>
                            <p className="text-gray-400 text-sm mt-2">Try adjusting your filter criteria to see more results.</p>
                        </div>
                    ) : (
                        <table className="min-w-full bg-white">
                            <thead className="bg-gray-50 text-gray-700 uppercase text-sm leading-normal border-b-2 border-gray-200">
                            <tr>
                            <th 
                                onClick={() => handleSort('date')}
                                className="py-4 px-6 text-left cursor-pointer hover:bg-gray-100 font-semibold"
                                >
                                    Date {sortColumn === 'date' && (sortDirection === 'asc' ? '↑' : '↓')}
                                </th>
                                <th 
                                    onClick={() => handleSort('number')}
                                    className="py-4 px-6 text-left cursor-pointer hover:bg-gray-100 font-semibold"
                                >
                                    Document # {sortColumn === 'number' && (sortDirection === 'asc' ? '↑' : '↓')}
                                </th>
                                <th 
                                    onClick={() => handleSort('client')}
                                    className="py-4 px-6 text-left cursor-pointer hover:bg-gray-100 font-semibold"
                                >
                                    Client {sortColumn === 'client' && (sortDirection === 'asc' ? '↑' : '↓')}
                                </th>
                                <th className="py-4 px-6 text-right font-semibold">Type</th>
                                <th className="py-4 px-6 text-right font-semibold">Items</th>
                                <th className="py-4 px-6 text-right font-semibold">Labor</th>
                                <th className="py-4 px-6 text-right font-semibold">Mandays</th>
                                <th className="py-4 px-6 text-right font-semibold">VAT</th>
                                <th 
                                    onClick={() => handleSort('total')}
                                    className="py-4 px-6 text-right cursor-pointer hover:bg-gray-100 font-semibold"
                                >
                                    Total {sortColumn === 'total' && (sortDirection === 'asc' ? '↑' : '↓')}
                                </th>
                                <th className="py-4 px-6 text-right font-semibold">Paid</th>
                                <th className="py-4 px-6 text-right font-semibold">Profit</th>
                                <th className="py-4 px-6 text-center font-semibold">Status</th>
                                </tr>
                            </thead>
                            <tbody className="text-gray-600 text-sm">
                                {getFilteredDocuments().map(doc => {
                                    const itemsRevenue = doc.items ? doc.items.reduce((sum, item) => sum + (item.qty * item.unitPrice), 0) : 0;
                                    const cost = doc.items ? doc.items.reduce((sum, item) => sum + (item.qty * (item.buyingPrice || 0)), 0) : 0;
                                    const mandaysRevenue = doc.mandays ? (doc.mandays * (doc.mandayRate || 0)) : 0;
                                    const profit = doc.total - cost - (doc.vatAmount || 0) - mandaysRevenue;
                                    const daysSinceIssued = Math.floor((new Date() - doc.date.toDate()) / (1000 * 60 * 60 * 24));
                                    const totalPaid = doc.totalPaid || 0;
                                    const isPaid = totalPaid >= doc.total;
                                    const isOverdue = !isPaid && daysSinceIssued > 30;
                                    
                                    return (
                                        <tr key={doc.id} className="border-b border-gray-200 hover:bg-gray-50 transition-colors duration-150">
                                            <td className="py-4 px-6 text-left font-medium">{doc.date.toDate().toLocaleDateString()}</td>
                                            <td className="py-4 px-6 text-left font-medium">{doc.documentNumber}</td>
                                            <td className="py-4 px-6 text-left">{doc.client.name}</td>
                                            <td className="py-4 px-6 text-center">
                                                <span className={`px-2 py-1 text-xs rounded-full font-medium ${
                                                    doc.type === 'invoice' 
                                                        ? 'bg-blue-100 text-blue-800' 
                                                        : 'bg-purple-100 text-purple-800'
                                                }`}>
                                                    {doc.type === 'invoice' ? 'Invoice' : 'Proforma'}
                                                </span>
                                            </td>
                                            <td className="py-4 px-6 text-right font-medium">${itemsRevenue.toFixed(2)}</td>
                                            <td className="py-4 px-6 text-right font-medium">${(doc.laborPrice || 0).toFixed(2)}</td>
                                            <td className="py-4 px-6 text-right font-medium text-orange-600">${mandaysRevenue.toFixed(2)}</td>
                                            <td className="py-4 px-6 text-right font-medium">${(doc.vatAmount || 0).toFixed(2)}</td>
                                            <td className="py-4 px-6 text-right font-bold text-lg">${doc.total.toFixed(2)}</td>
                                            <td className="py-4 px-6 text-right font-semibold">${totalPaid.toFixed(2)}</td>
                                            <td className={`py-4 px-6 text-right font-bold ${profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                ${profit.toFixed(2)}
                                            </td>
                                            <td className="py-4 px-6 text-center">
                                                {isPaid ? (
                                                    <span className="px-3 py-1 text-xs rounded-full bg-green-100 text-green-800 font-medium">Paid</span>
                                                ) : isOverdue ? (
                                                    <span className="px-3 py-1 text-xs rounded-full bg-red-100 text-red-800 font-medium">Overdue</span>
                                                ) : totalPaid > 0 ? (
                                                    <span className="px-3 py-1 text-xs rounded-full bg-yellow-100 text-yellow-800 font-medium">Partial</span>
                                                ) : (
                                                    <span className="px-3 py-1 text-xs rounded-full bg-gray-100 text-gray-800 font-medium">Unpaid</span>
                                                )}
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
