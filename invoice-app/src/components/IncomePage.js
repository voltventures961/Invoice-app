import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, addDoc, updateDoc, deleteDoc, doc, orderBy, Timestamp } from 'firebase/firestore';
import { auth, db } from '../firebase/config';

const IncomePage = () => {
    const [incomes, setIncomes] = useState([]);
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showAddForm, setShowAddForm] = useState(false);
    const [editingIncome, setEditingIncome] = useState(null);
    const [feedback, setFeedback] = useState({ type: '', message: '' });
    const [filterPeriod, setFilterPeriod] = useState('thisMonth');
    const [filterCategory, setFilterCategory] = useState('all');
    const [customStartDate, setCustomStartDate] = useState('');
    const [customEndDate, setCustomEndDate] = useState('');
    const [showCategoryManager, setShowCategoryManager] = useState(false);
    const [newCategory, setNewCategory] = useState({ name: '', color: '#10B981' });
    const [stats, setStats] = useState({ total: 0, byCategory: {} });

    // Form state
    const [formData, setFormData] = useState({
        description: '',
        amount: '',
        category: '',
        date: new Date().toISOString().split('T')[0],
        isRecurrent: false,
        recurrenceInterval: 'monthly', // 'daily', 'weekly', 'monthly', 'yearly'
        notes: '',
        client: '',
        paymentMethod: 'bank_transfer'
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
                    start: new Date(2020, 0, 1),
                    end: now
                };
        }
    };

    useEffect(() => {
        if (!auth.currentUser) return;

        // Fetch categories
        const categoriesQuery = query(
            collection(db, `incomeCategories/${auth.currentUser.uid}/categories`),
            orderBy('name')
        );
        const unsubCategories = onSnapshot(categoriesQuery, (snapshot) => {
            const categoriesData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            // Add default categories if none exist
            if (categoriesData.length === 0) {
                const defaultCategories = [
                    { name: 'Consulting', color: '#10B981' },
                    { name: 'Product Sales', color: '#3B82F6' },
                    { name: 'Service Revenue', color: '#8B5CF6' },
                    { name: 'Investment', color: '#F59E0B' },
                    { name: 'Commission', color: '#06B6D4' },
                    { name: 'Royalty', color: '#EC4899' },
                    { name: 'Other Income', color: '#6B7280' }
                ];

                defaultCategories.forEach(cat => {
                    addDoc(collection(db, `incomeCategories/${auth.currentUser.uid}/categories`), cat);
                });
            }

            setCategories(categoriesData);
        });

        // Fetch incomes
        const incomesQuery = query(
            collection(db, `incomes/${auth.currentUser.uid}/userIncomes`),
            orderBy('date', 'desc')
        );
        const unsubIncomes = onSnapshot(incomesQuery, (snapshot) => {
            const incomesData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            // Filter by date range
            const dateRange = getDateRange();
            const filtered = incomesData.filter(income => {
                const incomeDate = income.date.toDate();
                return incomeDate >= dateRange.start && incomeDate <= dateRange.end;
            });

            // Apply category filter
            const categoryFiltered = filterCategory === 'all'
                ? filtered
                : filtered.filter(inc => inc.category === filterCategory);

            // Calculate stats
            const total = categoryFiltered.reduce((sum, inc) => sum + inc.amount, 0);
            const byCategory = categoryFiltered.reduce((acc, inc) => {
                acc[inc.category] = (acc[inc.category] || 0) + inc.amount;
                return acc;
            }, {});

            setStats({ total, byCategory });
            setIncomes(categoryFiltered);
            setLoading(false);
        });

        return () => {
            unsubCategories();
            unsubIncomes();
        };
    }, [filterPeriod, filterCategory, customStartDate, customEndDate]);

    const handleInputChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setFeedback({ type: '', message: '' });

        try {
            const incomeData = {
                ...formData,
                amount: parseFloat(formData.amount),
                date: Timestamp.fromDate(new Date(formData.date)),
                userId: auth.currentUser.uid,
                createdAt: Timestamp.now(),
                updatedAt: Timestamp.now()
            };

            if (editingIncome) {
                await updateDoc(
                    doc(db, `incomes/${auth.currentUser.uid}/userIncomes`, editingIncome.id),
                    incomeData
                );
                setFeedback({ type: 'success', message: 'Income updated successfully!' });
            } else {
                await addDoc(
                    collection(db, `incomes/${auth.currentUser.uid}/userIncomes`),
                    incomeData
                );
                setFeedback({ type: 'success', message: 'Income added successfully!' });
            }

            // Reset form
            setFormData({
                description: '',
                amount: '',
                category: '',
                date: new Date().toISOString().split('T')[0],
                isRecurrent: false,
                recurrenceInterval: 'monthly',
                notes: '',
                client: '',
                paymentMethod: 'bank_transfer'
            });
            setShowAddForm(false);
            setEditingIncome(null);
        } catch (error) {
            console.error('Error saving income:', error);
            setFeedback({ type: 'error', message: 'Failed to save income' });
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (incomeId) => {
        if (!window.confirm('Are you sure you want to delete this income?')) return;

        try {
            await deleteDoc(doc(db, `incomes/${auth.currentUser.uid}/userIncomes`, incomeId));
            setFeedback({ type: 'success', message: 'Income deleted successfully!' });
        } catch (error) {
            console.error('Error deleting income:', error);
            setFeedback({ type: 'error', message: 'Failed to delete income' });
        }
    };

    const handleAddCategory = async () => {
        if (!newCategory.name.trim()) return;

        try {
            await addDoc(
                collection(db, `incomeCategories/${auth.currentUser.uid}/categories`),
                { ...newCategory, createdAt: Timestamp.now() }
            );
            setNewCategory({ name: '', color: '#10B981' });
            setFeedback({ type: 'success', message: 'Category added successfully!' });
        } catch (error) {
            console.error('Error adding category:', error);
            setFeedback({ type: 'error', message: 'Failed to add category' });
        }
    };

    const handleDeleteCategory = async (categoryId) => {
        if (!window.confirm('Delete this category? Income entries will not be deleted.')) return;

        try {
            await deleteDoc(doc(db, `incomeCategories/${auth.currentUser.uid}/categories`, categoryId));
            setFeedback({ type: 'success', message: 'Category deleted successfully!' });
        } catch (error) {
            console.error('Error deleting category:', error);
            setFeedback({ type: 'error', message: 'Failed to delete category' });
        }
    };

    const getCategoryColor = (categoryName) => {
        const category = categories.find(c => c.name === categoryName);
        return category?.color || '#6B7280';
    };

    if (loading && incomes.length === 0) {
        return (
            <div className="flex justify-center items-center h-screen">
                <div className="animate-spin rounded-full h-32 w-32 border-t-2 border-b-2 border-green-500"></div>
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
                <h1 className="text-3xl font-bold text-gray-800">Income</h1>
                <div className="flex flex-wrap gap-3">
                    <button
                        onClick={() => setShowCategoryManager(!showCategoryManager)}
                        className="bg-gray-600 hover:bg-gray-700 text-white font-medium py-2 px-4 rounded-lg shadow-md transition-colors"
                    >
                        Manage Categories
                    </button>
                    <button
                        onClick={() => setShowAddForm(true)}
                        className="bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-4 rounded-lg shadow-md transition-colors"
                    >
                        Add Income
                    </button>
                </div>
            </div>

            {feedback.message && (
                <div className={`mb-6 p-4 rounded-md ${feedback.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    {feedback.message}
                </div>
            )}

            {/* Category Manager */}
            {showCategoryManager && (
                <div className="bg-white p-6 rounded-lg shadow-lg mb-6">
                    <h2 className="text-xl font-semibold text-gray-800 mb-4">Manage Categories</h2>

                    {/* Add New Category */}
                    <div className="flex flex-col sm:flex-row gap-3 mb-4">
                        <input
                            type="text"
                            placeholder="Category name"
                            value={newCategory.name}
                            onChange={(e) => setNewCategory({ ...newCategory, name: e.target.value })}
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                        />
                        <input
                            type="color"
                            value={newCategory.color}
                            onChange={(e) => setNewCategory({ ...newCategory, color: e.target.value })}
                            className="w-20 h-10 border border-gray-300 rounded-md cursor-pointer"
                        />
                        <button
                            onClick={handleAddCategory}
                            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md transition-colors"
                        >
                            Add Category
                        </button>
                    </div>

                    {/* Categories List */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                        {categories.map(category => (
                            <div
                                key={category.id}
                                className="flex items-center justify-between p-3 border border-gray-200 rounded-md"
                            >
                                <div className="flex items-center gap-2">
                                    <div
                                        className="w-4 h-4 rounded-full"
                                        style={{ backgroundColor: category.color }}
                                    />
                                    <span className="font-medium text-gray-700">{category.name}</span>
                                </div>
                                <button
                                    onClick={() => handleDeleteCategory(category.id)}
                                    className="text-red-600 hover:text-red-800 text-sm"
                                >
                                    Delete
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Filters */}
            <div className="bg-white p-6 rounded-lg shadow-lg mb-6">
                <h3 className="text-lg font-medium text-gray-700 mb-4">Filters</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Period</label>
                        <select
                            value={filterPeriod}
                            onChange={(e) => setFilterPeriod(e.target.value)}
                            className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-green-500"
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
                                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                                <input
                                    type="date"
                                    value={customEndDate}
                                    onChange={(e) => setCustomEndDate(e.target.value)}
                                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500"
                                />
                            </div>
                        </>
                    )}

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                        <select
                            value={filterCategory}
                            onChange={(e) => setFilterCategory(e.target.value)}
                            className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-green-500"
                        >
                            <option value="all">All Categories</option>
                            {categories.map(cat => (
                                <option key={cat.id} value={cat.name}>{cat.name}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <div className="bg-gradient-to-r from-green-400 to-green-600 p-6 rounded-lg shadow-lg text-white">
                    <h3 className="text-lg font-semibold">Total Income</h3>
                    <p className="text-3xl font-bold mt-2">${stats.total.toFixed(2)}</p>
                    <p className="text-sm mt-1">{incomes.length} transactions</p>
                </div>

                {Object.entries(stats.byCategory).slice(0, 3).map(([category, amount]) => (
                    <div
                        key={category}
                        className="bg-white p-6 rounded-lg shadow-lg border-l-4"
                        style={{ borderColor: getCategoryColor(category) }}
                    >
                        <h3 className="text-lg font-semibold text-gray-700">{category}</h3>
                        <p className="text-3xl font-bold mt-2 text-gray-900">${amount.toFixed(2)}</p>
                        <p className="text-sm mt-1 text-gray-500">
                            {((amount / stats.total) * 100).toFixed(1)}% of total
                        </p>
                    </div>
                ))}
            </div>

            {/* Add/Edit Income Form */}
            {showAddForm && (
                <div className="bg-white p-6 rounded-lg shadow-lg mb-6">
                    <h2 className="text-xl font-semibold text-gray-800 mb-4">
                        {editingIncome ? 'Edit Income' : 'Add New Income'}
                    </h2>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="md:col-span-2">
                                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                                <input
                                    type="text"
                                    name="description"
                                    value={formData.description}
                                    onChange={handleInputChange}
                                    required
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                                    placeholder="What was this income for?"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Amount</label>
                                <input
                                    type="number"
                                    name="amount"
                                    value={formData.amount}
                                    onChange={handleInputChange}
                                    step="0.01"
                                    min="0"
                                    required
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                                    placeholder="0.00"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                                <select
                                    name="category"
                                    value={formData.category}
                                    onChange={handleInputChange}
                                    required
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                                >
                                    <option value="">Select Category</option>
                                    {categories.map(cat => (
                                        <option key={cat.id} value={cat.name}>{cat.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                                <input
                                    type="date"
                                    name="date"
                                    value={formData.date}
                                    onChange={handleInputChange}
                                    required
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Client/Source</label>
                                <input
                                    type="text"
                                    name="client"
                                    value={formData.client}
                                    onChange={handleInputChange}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                                    placeholder="Client or income source"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method</label>
                                <select
                                    name="paymentMethod"
                                    value={formData.paymentMethod}
                                    onChange={handleInputChange}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                                >
                                    <option value="bank_transfer">Bank Transfer</option>
                                    <option value="cash">Cash</option>
                                    <option value="credit_card">Credit Card</option>
                                    <option value="check">Check</option>
                                    <option value="other">Other</option>
                                </select>
                            </div>

                            <div className="md:col-span-2">
                                <label className="flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        name="isRecurrent"
                                        checked={formData.isRecurrent}
                                        onChange={handleInputChange}
                                        className="w-4 h-4 text-green-600 border-gray-300 rounded focus:ring-green-500"
                                    />
                                    <span className="text-sm font-medium text-gray-700">Recurrent Income</span>
                                </label>
                            </div>

                            {formData.isRecurrent && (
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Recurrence Interval</label>
                                    <select
                                        name="recurrenceInterval"
                                        value={formData.recurrenceInterval}
                                        onChange={handleInputChange}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                                    >
                                        <option value="daily">Daily</option>
                                        <option value="weekly">Weekly</option>
                                        <option value="monthly">Monthly</option>
                                        <option value="yearly">Yearly</option>
                                    </select>
                                </div>
                            )}

                            <div className="md:col-span-2">
                                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                                <textarea
                                    name="notes"
                                    value={formData.notes}
                                    onChange={handleInputChange}
                                    rows={3}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                                    placeholder="Additional notes"
                                />
                            </div>
                        </div>

                        <div className="flex justify-end space-x-4">
                            <button
                                type="button"
                                onClick={() => {
                                    setShowAddForm(false);
                                    setEditingIncome(null);
                                    setFormData({
                                        description: '',
                                        amount: '',
                                        category: '',
                                        date: new Date().toISOString().split('T')[0],
                                        isRecurrent: false,
                                        recurrenceInterval: 'monthly',
                                        notes: '',
                                        client: '',
                                        paymentMethod: 'bank_transfer'
                                    });
                                }}
                                className="px-4 py-2 text-gray-600 bg-gray-200 rounded-md hover:bg-gray-300 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={loading}
                                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-green-300 transition-colors"
                            >
                                {loading ? 'Saving...' : (editingIncome ? 'Update Income' : 'Add Income')}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* Income List */}
            <div className="bg-white rounded-lg shadow-lg overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200">
                    <h2 className="text-lg font-semibold text-gray-800">Income History</h2>
                </div>
                <div className="overflow-x-auto">
                    {incomes.length === 0 ? (
                        <div className="text-center py-8">
                            <p className="text-gray-500 text-lg">No income found for the selected filters.</p>
                        </div>
                    ) : (
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Client/Source</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Recurrent</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {incomes.map(income => (
                                    <tr key={income.id} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                            {income.date.toDate().toLocaleDateString()}
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-900">
                                            <div className="font-medium">{income.description}</div>
                                            {income.notes && (
                                                <div className="text-xs text-gray-500 mt-1">{income.notes}</div>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                                            <span
                                                className="inline-flex px-2 py-1 text-xs font-semibold rounded-full text-white"
                                                style={{ backgroundColor: getCategoryColor(income.category) }}
                                            >
                                                {income.category}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                            {income.client || '-'}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-green-600">
                                            ${income.amount.toFixed(2)}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                            {income.isRecurrent ? (
                                                <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                                                    {income.recurrenceInterval}
                                                </span>
                                            ) : (
                                                '-'
                                            )}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                                            <button
                                                onClick={() => {
                                                    setEditingIncome(income);
                                                    setFormData({
                                                        ...income,
                                                        date: income.date.toDate().toISOString().split('T')[0]
                                                    });
                                                    setShowAddForm(true);
                                                }}
                                                className="text-green-600 hover:text-green-900"
                                            >
                                                Edit
                                            </button>
                                            <button
                                                onClick={() => handleDelete(income.id)}
                                                className="text-red-600 hover:text-red-900"
                                            >
                                                Delete
                                            </button>
                                        </td>
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

export default IncomePage;
