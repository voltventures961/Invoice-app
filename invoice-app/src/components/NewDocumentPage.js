import React, { useState, useEffect, useCallback } from 'react';
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

import { useRef } from 'react';

const NewDocumentPage = ({ navigateTo, documentToEdit }) => {
    const [docType, setDocType] = useState('proforma');
    const [clients, setClients] = useState([]);
    const [selectedClient, setSelectedClient] = useState('');
    const [clientSearch, setClientSearch] = useState('');
    const [isClientDropdownVisible, setIsClientDropdownVisible] = useState(false);
    const clientDropdownRef = useRef(null);
    const [stockItems, setStockItems] = useState([]);
    const [itemSearch, setItemSearch] = useState('');
    const [isItemDropdownVisible, setIsItemDropdownVisible] = useState(false);
    const itemDropdownRef = useRef(null);
    const [selectedStockItem, setSelectedStockItem] = useState('');
    const [lineItems, setLineItems] = useState([]);
    const [laborPrice, setLaborPrice] = useState(0);
    const [manDaysCost, setManDaysCost] = useState(0);
    const [notes, setNotes] = useState('');
    const [vatApplied, setVatApplied] = useState(false);
    const [documentNumber, setDocumentNumber] = useState('');
    const [pageTitle, setPageTitle] = useState('Create New Document');
    const [mode, setMode] = useState('create'); // 'create', 'edit', 'convert'

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
            if (documentToEdit.isConversion) {
                setMode('convert');
                setPageTitle('Convert to Invoice');
                setDocType('invoice');
            } else {
                setMode('edit');
                setPageTitle(`Edit ${documentToEdit.type}`);
                setDocType(documentToEdit.type);
            }
            setSelectedClient(documentToEdit.client.id);
            setClientSearch(documentToEdit.client.name);
            setLineItems(documentToEdit.items);
            setLaborPrice(documentToEdit.laborPrice || 0);
            setManDaysCost(documentToEdit.manDaysCost || 0);
            setNotes(documentToEdit.notes || '');
            setVatApplied(documentToEdit.vatApplied || false);
            setDocumentNumber(documentToEdit.documentNumber);
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

    const calculateSubtotal = () => {
        const itemsTotal = lineItems.reduce((acc, item) => acc + (item.qty * item.unitPrice), 0);
        const labor = parseFloat(laborPrice || 0);
        const manDays = parseFloat(manDaysCost || 0);
        return itemsTotal + labor + manDays;
    };

    const subtotal = calculateSubtotal();
    const vatAmount = vatApplied ? subtotal * 0.11 : 0;
    const total = subtotal + vatAmount;

    const handleSaveDocument = async () => {
        if (!selectedClient || (lineItems.length === 0 && parseFloat(laborPrice || 0) === 0 && parseFloat(manDaysCost || 0) === 0)) {
            const modal = document.getElementById('error-modal');
            modal.classList.remove('hidden');
            setTimeout(() => modal.classList.add('hidden'), 3000);
            return;
        }
        if (!auth.currentUser) return;

        const clientData = clients.find(c => c.id === selectedClient);
        const documentData = {
            client: clientData,
            date: new Date(),
            items: lineItems,
            laborPrice: parseFloat(laborPrice || 0),
            manDaysCost: parseFloat(manDaysCost || 0),
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
            } else if (mode === 'convert') {
                const docRef = doc(db, `documents/${auth.currentUser.uid}/userDocuments`, documentToEdit.id);
                const newInvoiceNumber = await getNextDocNumber(auth.currentUser.uid, 'invoice');
                await updateDoc(docRef, { ...documentData, type: 'invoice', documentNumber: newInvoiceNumber });
                navigateTo('invoices');
            } else { // create
                const newDocNumber = await getNextDocNumber(auth.currentUser.uid, docType);
                await addDoc(collection(db, `documents/${auth.currentUser.uid}/userDocuments`), { ...documentData, type: docType, documentNumber: newDocNumber });
                navigateTo(docType === 'invoice' ? 'invoices' : 'proformas');
            }
        } catch (error) {
            console.error("Error saving document: ", error);
        }
    };

    return (
        <div>
            <style>{`@media print {.no-print {display: none;}.buying-price-col {display: none;}}`}</style>
            <div id="error-modal" className="hidden fixed top-5 right-5 bg-red-500 text-white py-2 px-4 rounded-lg shadow-lg z-50 no-print">
                Please select a client and add at least one item or labor charge.
            </div>

            <h1 className="text-3xl font-bold text-gray-800 mb-6 no-print">{pageTitle}</h1>
            <div className="bg-white p-8 rounded-lg shadow-lg">
                <div className="flex justify-between items-start mb-8 no-print">
                    <div>
                        <h2 className="text-2xl font-bold text-gray-800 uppercase">{docType}</h2>
                        <p className="text-gray-500">{documentNumber}</p>
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

                <div className="mb-8 p-4 border rounded-lg bg-gray-50 no-print" ref={itemDropdownRef}>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Add Item from Stock</label>
                    <input
                        type="text"
                        value={itemSearch}
                        onChange={e => {
                            setItemSearch(e.target.value);
                            setIsItemDropdownVisible(true);
                        }}
                        onFocus={() => setIsItemDropdownVisible(true)}
                        placeholder="Search for an item by name, brand, or category"
                        className="w-full p-2 border border-gray-300 rounded-md"
                    />
                    {isItemDropdownVisible && (
                        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
                            {stockItems
                                .filter(item => {
                                    const searchTerm = itemSearch.toLowerCase();
                                    return (
                                        item.name.toLowerCase().includes(searchTerm) ||
                                        (item.brand && item.brand.toLowerCase().includes(searchTerm)) ||
                                        (item.category && item.category.toLowerCase().includes(searchTerm))
                                    );
                                })
                                .map(item => (
                                    <div
                                        key={item.id}
                                        onClick={() => handleAddItemToList(item)}
                                        className="p-2 hover:bg-gray-100 cursor-pointer"
                                    >
                                        {`${item.name}${item.brand ? ` - ${item.brand}` : ''}${item.category ? ` - ${item.category}` : ''}`}
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
                                <th className="py-2 px-4 text-center text-sm font-semibold text-gray-600"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {lineItems.map((item, index) => (
                                <tr key={index} className="border-b">
                                    <td className="py-2 px-4">{item.partNumber}</td>
                                    <td className="py-2 px-4">{item.brand} - {item.specs}</td>
                                    <td className="py-2 px-4"><input type="number" value={item.qty} onChange={(e) => handleLineItemChange(index, 'qty', e.target.value)} className="w-20 p-1 border rounded-md" /></td>
                                    <td className="py-2 px-4"><input type="number" value={item.unitPrice} onChange={(e) => handleLineItemChange(index, 'unitPrice', e.target.value)} className="w-24 p-1 border rounded-md" /></td>
                                    <td className="py-2 px-4 text-gray-400 buying-price-col">${(item.buyingPrice || 0).toFixed(2)}</td>
                                    <td className="py-2 px-4 text-right font-medium">${(item.qty * item.unitPrice).toFixed(2)}</td>
                                    <td className="py-2 px-4 text-center">
                                        <button onClick={() => handleRemoveLineItem(index)} className="text-red-500 hover:text-red-700">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clipRule="evenodd" /></svg>
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
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
                        {docType === 'invoice' && (
                            <div className="flex justify-between py-1">
                                <span className="font-medium text-gray-600">Man-days Cost:</span>
                                <input type="number" value={manDaysCost} onChange={(e) => setManDaysCost(e.target.value)} className="w-24 p-1 border rounded-md text-right" />
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
                    <button onClick={() => navigateTo(docType === 'invoice' ? 'invoices' : 'proformas')} className="bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-6 rounded-lg">Cancel</button>
                    <button onClick={handleSaveDocument} className="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-6 rounded-lg">Save {docType}</button>
                </div>
            </div>
        </div>
    );
};

export default NewDocumentPage;
