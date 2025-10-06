import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, addDoc, updateDoc, deleteDoc, doc, orderBy, Timestamp, where } from 'firebase/firestore';
import { auth, db } from '../firebase/config';

const ExpensesPage = () => {
    const [expenses, setExpenses] = useState([]);
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showAddForm, setShowAddForm] = useState(false);
    const [editingExpense, setEditingExpense] = useState(null);
    const [feedback, setFeedback] = useState({ type: '', message: '' });
    const [filterPeriod, setFilterPeriod] = useState('thisMonth');
    const [filterCategory, setFilterCategory] = useState('all');
    const [customStartDate, setCustomStartDate] = useState('');
    const [customEndDate, setCustomEndDate] = useState('');
    const [showCategoryManager, setShowCategoryManager] = useState(false);
    const [newCategory, setNewCategory] = useState({ name: '', color: '#3B82F6' });
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
        vendor: '',
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
            collection(db, `expenseCategories/${auth.currentUser.uid}/categories`),
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
                    { name: 'Office Supplies', color: '#3B82F6' },
                    { name: 'Travel', color: '#10B981' },
                    { name: 'Utilities', color: '#F59E0B' },
                    { name: 'Salary', color: '#EF4444' },
                    { name: 'Marketing', color: '#8B5CF6' },
                    { name: 'Software', color: '#06B6D4' },
                    { name: 'Other', color: '#6B7280' }
                ];

                defaultCategories.forEach(cat => {
                    addDoc(collection(db, `expenseCategories/${auth.currentUser.uid}/categories`), cat);
                });
            }

            setCategories(categoriesData);
        });

        // Fetch expenses
        const expensesQuery = query(
            collection(db, `expenses/${auth.currentUser.uid}/userExpenses`),
            orderBy('date', 'desc')
        );
        const unsubExpenses = onSnapshot(expensesQuery, (snapshot) => {
            const expensesData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            // Filter by date range
            const dateRange = getDateRange();
            const filtered = expensesData.filter(expense => {
                const expenseDate = expense.date.toDate();
                return expenseDate >= dateRange.start && expenseDate <= dateRange.end;
            });

            // Apply category filter
            const categoryFiltered = filterCategory === 'all'
                ? filtered
                : filtered.filter(exp => exp.category === filterCategory);

            // Calculate stats
            const total = categoryFiltered.reduce((sum, exp) => sum + exp.amount, 0);
            const byCategory = categoryFiltered.reduce((acc, exp) => {
                acc[exp.category] = (acc[exp.category] || 0) + exp.amount;
                return acc;
            }, {});

            setStats({ total, byCategory });
            setExpenses(categoryFiltered);
            setLoading(false);
        });

        return () => {
            unsubCategories();
            unsubExpenses();
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
            const expenseData = {
                ...formData,
                amount: parseFloat(formData.amount),
                date: Timestamp.fromDate(new Date(formData.date)),
                userId: auth.currentUser.uid,
                createdAt: Timestamp.now(),
                updatedAt: Timestamp.now()
            };

            if (editingExpense) {
                await updateDoc(
                    doc(db, `expenses/${auth.currentUser.uid}/userExpenses`, editingExpense.id),
                    expenseData
                );
                setFeedback({ type: 'success', message: 'Expense updated successfully!' });
            } else {
                await addDoc(
                    collection(db, `expenses/${auth.currentUser.uid}/userExpenses`),
                    expenseData
                );
                setFeedback({ type: 'success', message: 'Expense added successfully!' });
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
                vendor: '',
                paymentMethod: 'bank_transfer'
            });
            setShowAddForm(false);
            setEditingExpense(null);
        } catch (error) {
            console.error('Error saving expense:', error);
            setFeedback({ type: 'error', message: 'Failed to save expense' });
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (expenseId) => {
        if (!window.confirm('Are you sure you want to delete this expense?')) return;

        try {
            await deleteDoc(doc(db, `expenses/${auth.currentUser.uid}/userExpenses`, expenseId));
            setFeedback({ type: 'success', message: 'Expense deleted successfully!' });
        } catch (error) {
            console.error('Error deleting expense:', error);
            setFeedback({ type: 'error', message: 'Failed to delete expense' });
        }
    };

    const handleAddCategory = async () => {
        if (!newCategory.name.trim()) return;

        try {
            await addDoc(
                collection(db, `expenseCategories/${auth.currentUser.uid}/categories`),
                { ...newCategory, createdAt: Timestamp.now() }
            );
            setNewCategory({ name: '', color: '#3B82F6' });
            setFeedback({ type: 'success', message: 'Category added successfully!' });
        } catch (error) {
            console.error('Error adding category:', error);
            setFeedback({ type: 'error', message: 'Failed to add category' });
        }
    };

    const handleDeleteCategory = async (categoryId) => {
        if (!window.confirm('Delete this category? Expenses will not be deleted.')) return;

        try {
            await deleteDoc(doc(db, `expenseCategories/${auth.currentUser.uid}/categories`, categoryId));
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

    if (loading && expenses.length === 0) {
        return (
            <div className="flex justify-center items-center h-screen">
                <div className="animate-spin rounded-full h-32 w-32 border-t-2 border-b-2 border-blue-500"></div>
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
                <h1 className="text-3xl font-bold text-gray-800">Expenses</h1>
                <div className="flex flex-wrap gap-3">
                    <button
                        onClick={() => setShowCategoryManager(!showCategoryManager)}
                        className="bg-gray-600 hover:bg-gray-700 text-white font-medium py-2 px-4 rounded-lg shadow-md transition-colors"
                    >
                        Manage Categories
                    </button>
                    <button
                        onClick={() => setShowAddForm(true)}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 px-4 rounded-lg shadow-md transition-colors"
                    >
                        Add Expense
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
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                        <input
                            type="color"
                            value={newCategory.color}
                            onChange={(e) => setNewCategory({ ...newCategory, color: e.target.value })}
                            className="w-20 h-10 border border-gray-300 rounded-md cursor-pointer"
                        />
                        <button
                            onClick={handleAddCategory}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md transition-colors"
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
                            className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
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
                                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                                <input
                                    type="date"
                                    value={customEndDate}
                                    onChange={(e) => setCustomEndDate(e.target.value)}
                                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500"
                                />
                            </div>
                        </>
                    )}

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                        <select
                            value={filterCategory}
                            onChange={(e) => setFilterCategory(e.target.value)}
                            className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
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
                <div className="bg-gradient-to-r from-red-400 to-red-600 p-6 rounded-lg shadow-lg text-white">
                    <h3 className="text-lg font-semibold">Total Expenses</h3>
                    <p className="text-3xl font-bold mt-2">${stats.total.toFixed(2)}</p>
                    <p className="text-sm mt-1">{expenses.length} transactions</p>
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

            {/* Add/Edit Expense Form */}
            {showAddForm && (
                <div className="bg-white p-6 rounded-lg shadow-lg mb-6">
                    <h2 className="text-xl font-semibold text-gray-800 mb-4">
                        {editingExpense ? 'Edit Expense' : 'Add New Expense'}
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
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    placeholder="What was this expense for?"
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
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Vendor</label>
                                <input
                                    type="text"
                                    name="vendor"
                                    value={formData.vendor}
                                    onChange={handleInputChange}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    placeholder="Vendor name"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method</label>
                                <select
                                    name="paymentMethod"
                                    value={formData.paymentMethod}
                                    onChange={handleInputChange}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
                                        className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                                    />
                                    <span className="text-sm font-medium text-gray-700">Recurrent Expense</span>
                                </label>
                            </div>

                            {formData.isRecurrent && (
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Recurrence Interval</label>
                                    <select
                                        name="recurrenceInterval"
                                        value={formData.recurrenceInterval}
                                        onChange={handleInputChange}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    placeholder="Additional notes"
                                />
                            </div>
                        </div>

                        <div className="flex justify-end space-x-4">
                            <button
                                type="button"
                                onClick={() => {
                                    setShowAddForm(false);
                                    setEditingExpense(null);
                                    setFormData({
                                        description: '',
                                        amount: '',
                                        category: '',
                                        date: new Date().toISOString().split('T')[0],
                                        isRecurrent: false,
                                        recurrenceInterval: 'monthly',
                                        notes: '',
                                        vendor: '',
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
                                className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:bg-indigo-300 transition-colors"
                            >
                                {loading ? 'Saving...' : (editingExpense ? 'Update Expense' : 'Add Expense')}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* Expenses List */}
            <div className="bg-white rounded-lg shadow-lg overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200">
                    <h2 className="text-lg font-semibold text-gray-800">Expense History</h2>
                </div>
                <div className="overflow-x-auto">
                    {expenses.length === 0 ? (
                        <div className="text-center py-8">
                            <p className="text-gray-500 text-lg">No expenses found for the selected filters.</p>
                        </div>
                    ) : (
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Vendor</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Recurrent</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {expenses.map(expense => (
                                    <tr key={expense.id} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                            {expense.date.toDate().toLocaleDateString()}
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-900">
                                            <div className="font-medium">{expense.description}</div>
                                            {expense.notes && (
                                                <div className="text-xs text-gray-500 mt-1">{expense.notes}</div>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                                            <span
                                                className="inline-flex px-2 py-1 text-xs font-semibold rounded-full text-white"
                                                style={{ backgroundColor: getCategoryColor(expense.category) }}
                                            >
                                                {expense.category}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                            {expense.vendor || '-'}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-red-600">
                                            ${expense.amount.toFixed(2)}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                            {expense.isRecurrent ? (
                                                <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-purple-100 text-purple-800">
                                                    {expense.recurrenceInterval}
                                                </span>
                                            ) : (
                                                '-'
                                            )}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                                            <button
                                                onClick={() => {
                                                    setEditingExpense(expense);
                                                    setFormData({
                                                        ...expense,
                                                        date: expense.date.toDate().toISOString().split('T')[0]
                                                    });
                                                    setShowAddForm(true);
                                                }}
                                                className="text-indigo-600 hover:text-indigo-900"
                                            >
                                                Edit
                                            </button>
                                            <button
                                                onClick={() => handleDelete(expense.id)}
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

export default ExpensesPage;
