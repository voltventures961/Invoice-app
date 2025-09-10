import React, { useState, useEffect, useCallback, useRef } from 'react';
import { collection, query, getDocs, addDoc, updateDoc, doc, runTransaction } from 'firebase/firestore';
import { auth, db } from '../firebase/config';

// Helper to get next document number
const getNextDocNumber = async (userId, type) => {
    const year = new Date().getFullYear();
    const counterRef = doc(db, `counters/${userId}/documentCounters`, `${type}Counter`);
    const prefix = type === 'invoice' ? 'INV' : 'PRO';

    try {
        const newId = await runTransaction(db, async (transaction) => {
            const counterDoc = await transaction.get(counterRef);
            let newLastId = 1;
            if (counterDoc.exists()) {
                newLastId = counterDoc.data().lastId + 1;
            }
            transaction.set(counterRef, { lastId: newLastId }, { merge: true });
            return newLastId;
        });
        return `${prefix}-${year}-${String(newId).padStart(3, '0')}`;
    } catch (e) {
        console.error("Failed to get next document number:", e);
        throw e;
    }
};

const NewDocumentPage = ({ navigateTo, documentToEdit }) => {
    const [docType, setDocType] = useState('proforma');
    const [clients, setClients] = useState([]);
    const [selectedClient, setSelectedClient] = useState('');
    const [clientSearch, setClientSearch] = useState('');
    const [isClientDropdownVisible, setIsClientDropdownVisible] = useState(false);
    const clientDropdownRef = useRef(null);
    const itemDropdownRef = useRef(null);
    const [stockItems, setStockItems] = useState([]);
    const [selectedStockItem, setSelectedStockItem] = useState('');
    const [itemSearch, setItemSearch] = useState('');
    const [isItemDropdownVisible, setIsItemDropdownVisible] = useState(false);
    const [lineItems, setLineItems] = useState([]);
    const [laborPrice, setLaborPrice] = useState(0);
    const [mandays, setMandays] = useState({ days: 0, people: 0, costPerDay: 0 });
    const [showMandays, setShowMandays] = useState(false);
    const [notes, setNotes] = useState('');
    const [vatApplied, setVatApplied] = useState(false);
    const [documentNumber, setDocumentNumber] = useState('');
    const [documentDate, setDocumentDate] = useState(new Date().toISOString().split('T')[0]); // Add editable date
    const [pageTitle, setPageTitle] = useState('Create New Document');
    const [mode, setMode] = useState('create'); // 'create', 'edit'

    const fetchInitialData = useCallback(async () => {
        if (!auth.currentUser) return;
        const clientQuery = query(collection(db, `clients/${auth.currentUser.uid}/userClients`));
        const clientSnapshot = await getDocs(clientQuery);
        setClients(clientSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));

        const itemQuery = query(collection(db, `items/${auth.currentUser.uid}/userItems`));
        const itemSnapshot = await getDocs(itemQuery);
        setStockItems(itemSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, []);

    useEffect(() => {
        fetchInitialData();

        if (documentToEdit) {
            setMode('edit');
            setPageTitle(`Edit ${documentToEdit.type === 'proforma' ? 'Proforma' : 'Invoice'}`);
            setDocType(documentToEdit.type);
            setSelectedClient(documentToEdit.client.id);
            setClientSearch(documentToEdit.client.name);
            setLineItems(documentToEdit.items || []);
            setLaborPrice(documentToEdit.laborPrice || 0);
            setNotes(documentToEdit.notes || '');
            setVatApplied(documentToEdit.vatApplied || false);
            setDocumentNumber(documentToEdit.documentNumber);
            // Load date if exists
            if (documentToEdit.date) {
                const existingDate = documentToEdit.date.toDate();
                setDocumentDate(existingDate.toISOString().split('T')[0]);
            }
            // Load mandays if exists
            if (documentToEdit.mandays) {
                setMandays(documentToEdit.mandays);
                setShowMandays(true);
            }
        } else {
            setMode('create');
            setPageTitle('Create New Document');
            setDocType('proforma');
            getNextDocNumber(auth.currentUser.uid, 'proforma').then(setDocumentNumber);
        }
    }, [documentToEdit, fetchInitialData]);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (clientDropdownRef.current && !clientDropdownRef.current.contains(event.target)) {
                setIsClientDropdownVisible(false);
            }
            if (itemDropdownRef.current && !itemDropdownRef.current.contains(event.target)) {
                setIsItemDropdownVisible(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    const handleAddItemToList = (item) => {
        if (item) {
            setLineItems([...lineItems, { ...item, itemId: item.id, qty: 1, unitPrice: item.sellingPrice }]);
            setItemSearch('');
            setSelectedStockItem('');
            setIsItemDropdownVisible(false);
        }
    };

    const handleLineItemChange = (index, field, value) => {
        const updatedItems = [...lineItems];
        const numValue = parseFloat(value);
        if (!isNaN(numValue) || value === '') {
            updatedItems[index][field] = numValue;
            setLineItems(updatedItems);
        }
    };

    const handleRemoveLineItem = (index) => {
        setLineItems(lineItems.filter((_, i) => i !== index));
    };

    const calculateMandalsCost = () => {
        return mandays.days * mandays.people * mandays.costPerDay;
    };

    const calculateSubtotal = () => {
        const itemsTotal = lineItems.reduce((acc, item) => acc + (item.qty * item.unitPrice), 0);
        const mandaysCost = showMandays ? calculateMandalsCost() : 0;
        return itemsTotal + parseFloat(laborPrice || 0) + mandaysCost;
    };

    const subtotal = calculateSubtotal();
    const vatAmount = vatApplied ? subtotal * 0.11 : 0;
    const total = subtotal + vatAmount;

    const handleSaveDocument = async () => {
        if (!selectedClient || (lineItems.length === 0 && parseFloat(laborPrice || 0) === 0 && (!showMandays || calculateMandalsCost() === 0))) {
            const modal = document.getElementById('error-modal');
            modal.classList.remove('hidden');
            setTimeout(() => modal.classList.add('hidden'), 3000);
            return;
        }
        if (!auth.currentUser) return;

        const clientData = clients.find(c => c.id === selectedClient);
        const documentData = {
            client: clientData,
            date: new Date(documentDate + 'T00:00:00'), // Use selected date
            items: lineItems,
            laborPrice: parseFloat(laborPrice || 0),
            mandays: showMandays ? mandays : null,
            notes,
            vatApplied,
            subtotal,
            vatAmount,
            total,
        };

        try {
            if (mode === 'edit') {
                const docRef = doc(db, `documents/${auth.currentUser.uid}/userDocuments`, documentToEdit.id);
                await updateDoc(docRef, { ...documentData, type: docType, documentNumber });
                navigateTo(docType === 'invoice' ? 'invoices' : 'proformas');
            } else { // create
                const newDocNumber = await getNextDocNumber(auth.currentUser.uid, docType);
                await addDoc(collection(db, `documents/${auth.currentUser.uid}/userDocuments`), { ...documentData, type: docType, documentNumber: newDocNumber });
                navigateTo(docType === 'invoice' ? 'invoices' : 'proformas');
            }
        } catch (error) {
            console.error("Error saving document: ", error);
        }
    };

    // Filter items based on search including custom fields
    const filteredItems = stockItems.filter(item => {
        const search = itemSearch.toLowerCase();
        return (
            item.name?.toLowerCase().includes(search) ||
            item.brand?.toLowerCase().includes(search) ||
            item.category?.toLowerCase().includes(search) ||
            item.partNumber?.toLowerCase().includes(search) ||
            item.specs?.toLowerCase().includes(search) ||
            item.sellingPrice?.toString().includes(search) ||
            item.customField1?.toLowerCase().includes(search) ||
            item.customField2?.toLowerCase().includes(search)
        );
    });

    return (
        <div>
            <style>{`@media print {.no-print {display: none;}.buying-price-col {display: none;}}`}</style>
            <div id="error-modal" className="hidden fixed top-5 right-5 bg-red-500 text-white py-2 px-4 rounded-lg shadow-lg z-50 no-print">
                Please select a client and add at least one item, labor charge, or mandays cost.
            </div>

            <h1 className="text-3xl font-bold text-gray-800 mb-6 no-print">{pageTitle}</h1>
            <div className="bg-white p-8 rounded-lg shadow-lg">
                <div className="flex justify-between items-start mb-8 no-print">
                    <div>
                        <h2 className="text-2xl font-bold text-gray-800 uppercase">{docType}</h2>
                        <p className="text-gray-500">{documentNumber}</p>
                        <div className="mt-2">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                            <input
                                type="date"
                                value={documentDate}
                                onChange={(e) => setDocumentDate(e.target.value)}
                                className="px-3 py-2 border border-gray-300 rounded-md"
                            />
                        </div>
                    </div>
                    <div>
                        {mode === 'create' && (
                            <select value={docType} onChange={(e) => setDocType(e.target.value)} className="mr-4 p-2 border border-gray-300 rounded-md">
                                <option value="proforma">Proforma</option>
                                <option value="invoice">Invoice</option>
                            </select>
                        )}
                        <label htmlFor="vat" className="mr-2 font-medium text-gray-700">Apply VAT (11%)</label>
                        <input type="checkbox" id="vat" checked={vatApplied} onChange={(e) => setVatApplied(e.target.checked)} className="h-5 w-5 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500" />
                    </div>
                </div>

                <div className="mb-8 no-print" ref={clientDropdownRef}>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Select Client</label>
                    <input
                        type="text"
                        value={clientSearch}
                        onChange={e => {
                            setClientSearch(e.target.value);
                            setSelectedClient('');
                            setIsClientDropdownVisible(true);
                        }}
                        onFocus={() => setIsClientDropdownVisible(true)}
                        placeholder="Search or select a client"
                        className="w-full p-2 border border-gray-300 rounded-md"
                    />
                    {isClientDropdownVisible && (
                        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
                            {clients
                                .filter(c => c.name.toLowerCase().includes(clientSearch.toLowerCase()))
                                .map(c => (
                                    <div
                                        key={c.id}
                                        onClick={() => {
                                            setSelectedClient(c.id);
                                            setClientSearch(c.name);
                                            setIsClientDropdownVisible(false);
                                        }}
                                        className="p-2 hover:bg-gray-100 cursor-pointer"
                                    >
                                        {c.name}
                                    </div>
                                ))}
                        </div>
                    )}
                </div>

                <div className="overflow-x-auto mb-8">
                    <table className="min-w-full">
                        <thead className="bg-gray-100">
                            <tr>
                                <th className="py-2 px-4 text-left text-sm font-semibold text-gray-600">Item/Part #</th>
                                <th className="py-2 px-4 text-left text-sm font-semibold text-gray-600">Description</th>
                                <th className="py-2 px-4 text-left text-sm font-semibold text-gray-600">Qty</th>
                                <th className="py-2 px-4 text-left text-sm font-semibold text-gray-600">Unit Price</th>
                                <th className="py-2 px-4 text-left text-sm font-semibold text-gray-600 buying-price-col">Buying Price</th>
                                <th className="py-2 px-4 text-right text-sm font-semibold text-gray-600">Total</th>
                                <th className="py-2 px-4 text-center text-sm font-semibold text-gray-600 no-print"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {lineItems.map((item, index) => (
                                <tr key={index} className="border-b">
                                    <td className="py-2 px-4">{item.partNumber}</td>
                                    <td className="py-2 px-4">
                                        <div className="font-medium">{item.name}</div>
                                        <div className="text-sm text-gray-600">{item.brand && `${item.brand} - `}{item.specs}</div>
                                    </td>
                                    <td className="py-2 px-4">
                                        <input 
                                            type="number" 
                                            value={item.qty} 
                                            onChange={(e) => handleLineItemChange(index, 'qty', e.target.value)} 
                                            className="w-20 p-1 border rounded-md" 
                                        />
                                    </td>
                                    <td className="py-2 px-4">
                                        <input 
                                            type="number" 
                                            value={item.unitPrice} 
                                            onChange={(e) => handleLineItemChange(index, 'unitPrice', e.target.value)} 
                                            className="w-24 p-1 border rounded-md" 
                                        />
                                    </td>
                                    <td className="py-2 px-4 text-gray-400 buying-price-col">${(item.buyingPrice || 0).toFixed(2)}</td>
                                    <td className="py-2 px-4 text-right font-medium">${(item.qty * item.unitPrice).toFixed(2)}</td>
                                    <td className="py-2 px-4 text-center no-print">
                                        <button onClick={() => handleRemoveLineItem(index)} className="text-red-500 hover:text-red-700">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                                <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clipRule="evenodd" />
                                            </svg>
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Add Item form - moved after the items list */}
                <div className="mb-8 p-4 border rounded-lg bg-gray-50 no-print" ref={itemDropdownRef}>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Add Item from Stock</label>
                    <div className="relative">
                        <input
                            type="text"
                            value={itemSearch}
                            onChange={(e) => {
                                setItemSearch(e.target.value);
                                setIsItemDropdownVisible(true);
                            }}
                            onFocus={() => setIsItemDropdownVisible(true)}
                            placeholder="Search by name, brand, category, part number, specs, or price..."
                            className="w-full p-2 border border-gray-300 rounded-md"
                        />
                        {isItemDropdownVisible && filteredItems.length > 0 && (
                            <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
                                {filteredItems.map(item => (
                                    <div
                                        key={item.id}
                                        onClick={() => handleAddItemToList(item)}
                                        className="p-3 hover:bg-gray-100 cursor-pointer border-b"
                                    >
                                        <div className="font-medium">{item.name}</div>
                                        <div className="text-sm text-gray-600">
                                            {item.brand && `Brand: ${item.brand} | `}
                                            {item.category && `Category: ${item.category} | `}
                                            {item.type && `Type: ${item.type} | `}
                                            {item.color && (
                                                <span>
                                                    Color: <span className="inline-block px-2 py-0.5 rounded" 
                                                        style={{
                                                            backgroundColor: item.color.toLowerCase() === 'white' ? '#f3f4f6' : 
                                                                           item.color.toLowerCase() === 'black' ? '#1f2937' :
                                                                           item.color.toLowerCase() === 'red' ? '#ef4444' :
                                                                           item.color.toLowerCase() === 'blue' ? '#3b82f6' :
                                                                           item.color.toLowerCase() === 'green' ? '#10b981' :
                                                                           item.color.toLowerCase() === 'yellow' ? '#f59e0b' :
                                                                           item.color.toLowerCase() === 'gray' || item.color.toLowerCase() === 'grey' ? '#6b7280' :
                                                                           '#e5e7eb',
                                                            color: item.color.toLowerCase() === 'white' || 
                                                                  item.color.toLowerCase() === 'yellow' ? '#1f2937' : '#ffffff',
                                                            fontSize: '11px'
                                                        }}>
                                                        {item.color}
                                                    </span> | 
                                                </span>
                                            )}
                                            {item.partNumber && `Part #: ${item.partNumber} | `}
                                            Price: ${item.sellingPrice}
                                        </div>
                                        {item.specs && <div className="text-xs text-gray-500 mt-1">{item.specs}</div>}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Mandays Section */}
                <div className="mb-8 p-4 border rounded-lg bg-blue-50 no-print">
                    <div className="flex items-center justify-between mb-4">
                        <label className="text-sm font-medium text-gray-700">Add Mandays Cost (Optional)</label>
                        <button
                            type="button"
                            onClick={() => setShowMandays(!showMandays)}
                            className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                        >
                            {showMandays ? 'Remove Mandays' : '+ Add Mandays'}
                        </button>
                    </div>
                    {showMandays && (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <label className="block text-xs text-gray-600 mb-1">Number of Days</label>
                                <input
                                    type="number"
                                    value={mandays.days}
                                    onChange={(e) => setMandays({...mandays, days: parseFloat(e.target.value) || 0})}
                                    className="w-full p-2 border border-gray-300 rounded-md"
                                    placeholder="e.g., 5"
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-gray-600 mb-1">Number of People</label>
                                <input
                                    type="number"
                                    value={mandays.people}
                                    onChange={(e) => setMandays({...mandays, people: parseFloat(e.target.value) || 0})}
                                    className="w-full p-2 border border-gray-300 rounded-md"
                                    placeholder="e.g., 3"
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-gray-600 mb-1">Cost per Day per Person</label>
                                <input
                                    type="number"
                                    value={mandays.costPerDay}
                                    onChange={(e) => setMandays({...mandays, costPerDay: parseFloat(e.target.value) || 0})}
                                    className="w-full p-2 border border-gray-300 rounded-md"
                                    placeholder="e.g., 100"
                                />
                            </div>
                        </div>
                    )}
                    {showMandays && calculateMandalsCost() > 0 && (
                        <div className="mt-3 p-2 bg-white rounded">
                            <span className="text-sm text-gray-600">Total Mandays Cost: </span>
                            <span className="font-bold text-blue-600">${calculateMandalsCost().toFixed(2)}</span>
                            <span className="text-xs text-gray-500 ml-2">
                                ({mandays.days} days × {mandays.people} people × ${mandays.costPerDay}/day)
                            </span>
                        </div>
                    )}
                </div>

                <div className="flex flex-col md:flex-row justify-between">
                    <div className="w-full md:w-1/2">
                        <label className="block text-sm font-medium text-gray-700 mb-2">Notes / Description</label>
                        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows="3" className="w-full p-2 border rounded-md"></textarea>
                    </div>
                    <div className="w-full md:w-1/3 mt-6 md:mt-0">
                        <div className="flex justify-between py-1">
                            <span className="font-medium text-gray-600">Labor Price:</span>
                            <input type="number" value={laborPrice} onChange={(e) => setLaborPrice(e.target.value)} className="w-24 p-1 border rounded-md text-right" />
                        </div>
                        {showMandays && calculateMandalsCost() > 0 && (
                            <div className="flex justify-between py-1">
                                <span className="font-medium text-gray-600">Mandays Cost:</span>
                                <span className="font-medium text-gray-800">${calculateMandalsCost().toFixed(2)}</span>
                            </div>
                        )}
                        <div className="flex justify-between py-1 mt-2">
                            <span className="font-medium text-gray-700">Subtotal:</span>
                            <span className="font-medium text-gray-800">${subtotal.toFixed(2)}</span>
                        </div>
                        {vatApplied && (
                        <div className="flex justify-between py-1 text-gray-600">
                            <span>VAT (11%):</span>
                            <span>${vatAmount.toFixed(2)}</span>
                        </div>
                        )}
                        <div className="flex justify-between py-2 mt-2 border-t-2 border-gray-300">
                            <span className="text-xl font-bold text-gray-900">Total:</span>
                            <span className="text-xl font-bold text-gray-900">${total.toFixed(2)}</span>
                        </div>
                    </div>
                </div>

                <div className="mt-10 flex justify-end space-x-4 no-print">
                    <button 
                        onClick={() => {
                            if (documentToEdit) {
                                navigateTo(documentToEdit.type === 'invoice' ? 'invoices' : 'proformas');
                            } else {
                                navigateTo('dashboard');
                            }
                        }} 
                        className="bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-6 rounded-lg transition-colors"
                    >
                        Cancel
                    </button>
                    <button 
                        onClick={handleSaveDocument} 
                        className="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-6 rounded-lg transition-colors"
                    >
                        {mode === 'edit' ? 'Update' : 'Save'} {docType === 'proforma' ? 'Proforma' : 'Invoice'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default NewDocumentPage;
