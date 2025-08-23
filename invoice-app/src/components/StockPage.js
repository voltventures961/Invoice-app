import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, addDoc } from 'firebase/firestore';
import { auth, db } from '../firebase/config';

const StockPage = () => {
    const [items, setItems] = useState([]);
    const [showForm, setShowForm] = useState(false);
    const [newItem, setNewItem] = useState({ category: '', subCategory: '', brand: '', partNumber: '', specs: '', type: '', color: '', buyingPrice: 0, sellingPrice: 0 });

    useEffect(() => {
        if (!auth.currentUser) return;
        const q = query(collection(db, `items/${auth.currentUser.uid}/userItems`));
        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const itemsList = [];
            querySnapshot.forEach((doc) => {
                itemsList.push({ id: doc.id, ...doc.data() });
            });
            setItems(itemsList);
        });
        return () => unsubscribe();
    }, []);

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setNewItem({ ...newItem, [name]: value });
    };

    const handleAddItem = async (e) => {
        e.preventDefault();
        if (!auth.currentUser) return;
        try {
            await addDoc(collection(db, `items/${auth.currentUser.uid}/userItems`), {
                ...newItem,
                buyingPrice: parseFloat(newItem.buyingPrice),
                sellingPrice: parseFloat(newItem.sellingPrice)
            });
            setNewItem({ category: '', subCategory: '', brand: '', partNumber: '', specs: '', type: '', color: '', buyingPrice: 0, sellingPrice: 0 });
            setShowForm(false);
        } catch (error) {
            console.error("Error adding item: ", error);
        }
    };

    const fields = [
        { name: 'partNumber', placeholder: 'Part Number', required: true },
        { name: 'brand', placeholder: 'Brand' },
        { name: 'specs', placeholder: 'Specs' },
        { name: 'category', placeholder: 'Category' },
        { name: 'subCategory', placeholder: 'Sub Category' },
        { name: 'type', placeholder: 'Type' },
        { name: 'color', placeholder: 'Color' },
        { name: 'buyingPrice', placeholder: 'Buying Price', type: 'number' },
        { name: 'sellingPrice', placeholder: 'Selling Price', type: 'number' },
    ];

    return (
        <div>
            <h1 className="text-3xl font-bold text-gray-800 mb-6">Stock Items</h1>
            <div className="flex justify-end mb-6">
                <button onClick={() => setShowForm(!showForm)} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg shadow-md transition-transform transform hover:scale-105 transition-colors duration-200">
                    {showForm ? 'Cancel' : '+ Add New Item'}
                </button>
            </div>

            {showForm && (
                <div className="bg-white p-6 rounded-lg shadow-lg mb-6">
                    <h2 className="text-xl font-semibold text-gray-700 mb-4">Add New Stock Item</h2>
                    <form onSubmit={handleAddItem}>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {fields.map(field => (
                                <input
                                    key={field.name}
                                    type={field.type || 'text'}
                                    name={field.name}
                                    value={newItem[field.name]}
                                    onChange={handleInputChange}
                                    placeholder={field.placeholder}
                                    required={field.required}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                                />
                            ))}
                        </div>
                        <div className="mt-4 flex justify-end">
                            <button type="submit" className="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded-lg">Save Item</button>
                        </div>
                    </form>
                </div>
            )}

            <div className="bg-white p-6 rounded-lg shadow-lg">
                 <div className="overflow-x-auto">
                    <table className="min-w-full bg-white">
                        <thead className="bg-gray-200 text-gray-600 uppercase text-sm leading-normal">
                            <tr>
                                <th className="py-3 px-6 text-left">Part Number</th>
                                <th className="py-3 px-6 text-left">Brand</th>
                                <th className="py-3 px-6 text-left">Specs</th>
                                <th className="py-3 px-6 text-right">Buying Price</th>
                                <th className="py-3 px-6 text-right">Selling Price</th>
                            </tr>
                        </thead>
                        <tbody className="text-gray-600 text-sm font-light">
                            {items.map(item => (
                                <tr key={item.id} className="border-b border-gray-200 hover:bg-gray-100">
                                    <td className="py-3 px-6 text-left font-medium">{item.partNumber}</td>
                                    <td className="py-3 px-6 text-left">{item.brand}</td>
                                    <td className="py-3 px-6 text-left">{item.specs}</td>
                                    <td className="py-3 px-6 text-right">${item.buyingPrice.toFixed(2)}</td>
                                    <td className="py-3 px-6 text-right">${item.sellingPrice.toFixed(2)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default StockPage;
