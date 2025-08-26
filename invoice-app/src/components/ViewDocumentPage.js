import React, { useRef, useEffect, useState } from 'react';
import { collection, addDoc, updateDoc, doc, runTransaction, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import { COMPANY_INFO } from '../config';

const ViewDocumentPage = ({ documentToView, navigateTo }) => {
    const printRef = useRef();
    const [userSettings, setUserSettings] = useState(null);

    useEffect(() => {
        if (documentToView) {
            const originalTitle = document.title;
            const { type, documentNumber, client } = documentToView;
            document.title = `${type}-${documentNumber}-${client.name}`;

            // Cleanup function to reset title
            return () => {
                document.title = originalTitle;
            };
        }
    }, [documentToView]);

    useEffect(() => {
        const fetchUserSettings = async () => {
            if (!auth.currentUser) return;
            const settingsRef = doc(db, 'settings', auth.currentUser.uid);
            try {
                const docSnap = await getDoc(settingsRef);
                if (docSnap.exists()) {
                    setUserSettings(docSnap.data());
                }
            } catch (error) {
                console.error("Error fetching user settings:", error);
            }
        };
        fetchUserSettings();
    }, []);

    const handlePrint = () => {
        window.print();
    };

    const handleConvertToInvoice = async () => {
        if (!auth.currentUser || documentToView.type !== 'proforma') return;
        
        try {
            // Get next invoice number
            const year = new Date().getFullYear();
            const counterRef = doc(db, `counters/${auth.currentUser.uid}/documentCounters`, 'invoiceCounter');
            const newInvoiceNumber = await runTransaction(db, async (transaction) => {
                const counterDoc = await transaction.get(counterRef);
                let newLastId = 1;
                if (counterDoc.exists()) {
                    newLastId = counterDoc.data().lastId + 1;
                }
                transaction.set(counterRef, { lastId: newLastId }, { merge: true });
                return `INV-${year}-${String(newLastId).padStart(3, '0')}`;
            });
            
            // Create new invoice document
            const invoiceData = {
                ...documentToView,
                type: 'invoice',
                documentNumber: newInvoiceNumber,
                proformaNumber: documentToView.documentNumber,
                convertedFrom: documentToView.id,
                date: new Date()
            };
            
            // Remove proforma-specific fields
            delete invoiceData.id;
            delete invoiceData.converted;
            
            // Add the new invoice
            await addDoc(collection(db, `documents/${auth.currentUser.uid}/userDocuments`), invoiceData);
            
            // Mark original proforma as converted
            const proformaRef = doc(db, `documents/${auth.currentUser.uid}/userDocuments`, documentToView.id);
            await updateDoc(proformaRef, {
                converted: true,
                convertedAt: new Date(),
                convertedToInvoiceNumber: newInvoiceNumber
            });
            
            // Navigate to invoices page
            navigateTo('invoices');
        } catch (error) {
            console.error("Error converting proforma to invoice: ", error);
            alert('Error converting proforma to invoice. Please try again.');
        }
    };

    if (!documentToView) {
        return <p>No document selected.</p>;
    }

    const { type, documentNumber, client, date, items, laborPrice, mandays, notes, vatApplied, subtotal, vatAmount, total } = documentToView;

    // Use user settings if available, otherwise fall back to config defaults
    const companyInfo = {
        name: userSettings?.companyName || COMPANY_INFO.name,
        address: userSettings?.companyAddress || COMPANY_INFO.address,
        phone: userSettings?.companyPhone || COMPANY_INFO.phone,
        vatNumber: userSettings?.companyVatNumber || COMPANY_INFO.vatNumber,
        logo: userSettings?.logoUrl ? (
            <img src={userSettings.logoUrl} alt="Company Logo" className="h-12 w-auto" />
        ) : COMPANY_INFO.logo
    };

    return (
        <div>
            <style>
                {`
                @media print {
                    body * {
                        visibility: hidden;
                    }
                    .print-area, .print-area * {
                        visibility: visible;
                    }
                    .print-area {
                        position: absolute;
                        left: 0;
                        top: 0;
                        width: 100%;
                    }
                    .no-print {
                        display: none;
                    }
                    .buying-price-col {
                        display: none;
                    }
                }
                `}
            </style>
            <div className="no-print flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold text-gray-800">View Document</h1>
                <div className="space-x-3">
                    {type === 'proforma' && !documentToView.converted && (
                        <button 
                            onClick={handleConvertToInvoice} 
                            className="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded-lg transition-colors duration-200"
                        >
                            Convert to Invoice
                        </button>
                    )}
                    <button onClick={handlePrint} className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-lg transition-colors duration-200">
                        Print / Save PDF
                    </button>
                    <button onClick={() => navigateTo('dashboard')} className="bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg transition-colors duration-200">
                        Back to Dashboard
                    </button>
                </div>
            </div>

            <div ref={printRef} className="print-area bg-white p-8 md:p-12 rounded-lg shadow-lg">
                {/* --- Header --- */}
                <header className="flex justify-between items-center pb-8 border-b-2 border-gray-200">
                    <div>
                        {companyInfo.logo}
                    </div>
                    <div className="text-right">
                        <h1 className="text-4xl font-bold uppercase text-gray-800">{type}</h1>
                        <p className="text-gray-500">{documentNumber}</p>
                    </div>
                </header>

                {/* --- Details --- */}
                <section className="grid grid-cols-2 gap-8 my-8">
                    <div>
                        <h3 className="text-sm font-semibold text-gray-500 uppercase mb-2">Billed To</h3>
                        <p className="font-bold text-gray-800">{client.name}</p>
                        {client.address && <p className="text-gray-600">{client.address}</p>}
                        <p className="text-gray-600">{client.location}</p>
                        <p className="text-gray-600">{client.phone || client.phoneNumber}</p>
                        {client.vatNumber && <p className="text-gray-600">VAT: {client.vatNumber}</p>}
                    </div>
                    <div className="text-right">
                        <h3 className="text-sm font-semibold text-gray-500 uppercase mb-2">From</h3>
                        <p className="font-bold text-gray-800">{companyInfo.name}</p>
                        <p className="text-gray-600">{companyInfo.address}</p>
                        <p className="text-gray-600">{companyInfo.phone}</p>
                        {vatApplied && <p className="text-gray-600">VAT #: {companyInfo.vatNumber}</p>}
                        <p className="mt-4"><span className="font-semibold text-gray-500">Date:</span> {date.toDate().toLocaleDateString()}</p>
                    </div>
                </section>

                {/* --- Notes --- */}
                {notes && (
                <section className="my-8">
                    <h3 className="text-sm font-semibold text-gray-500 uppercase mb-2">Description of Work</h3>
                    <p className="text-gray-700 bg-gray-50 p-3 rounded-md">{notes}</p>
                </section>
                )}


                {/* --- Items Table --- */}
                <section className="my-8">
                    <table className="w-full">
                        <thead className="bg-gray-100">
                            <tr>
                                <th className="py-2 px-4 text-left text-sm font-semibold text-gray-600">Item/Part #</th>
                                <th className="py-2 px-4 text-left text-sm font-semibold text-gray-600">Description</th>
                                <th className="py-2 px-4 text-center text-sm font-semibold text-gray-600">Qty</th>
                                <th className="py-2 px-4 text-right text-sm font-semibold text-gray-600">Unit Price</th>
                                <th className="py-2 px-4 text-right text-sm font-semibold text-gray-600">Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            {items.map((item, index) => (
                                <tr key={index} className="border-b">
                                    <td className="py-3 px-4">{item.partNumber}</td>
                                    <td className="py-3 px-4">{item.brand} - {item.specs}</td>
                                    <td className="py-3 px-4 text-center">{item.qty}</td>
                                    <td className="py-3 px-4 text-right">${item.unitPrice.toFixed(2)}</td>
                                    <td className="py-3 px-4 text-right font-medium">${(item.qty * item.unitPrice).toFixed(2)}</td>
                                </tr>
                            ))}
                            {laborPrice > 0 && (
                                <tr className="border-b">
                                    <td className="py-3 px-4 font-semibold">SERVICE-01</td>
                                    <td className="py-3 px-4">Labor</td>
                                    <td className="py-3 px-4 text-center">1</td>
                                    <td className="py-3 px-4 text-right">${parseFloat(laborPrice).toFixed(2)}</td>
                                    <td className="py-3 px-4 text-right font-medium">${parseFloat(laborPrice).toFixed(2)}</td>
                                </tr>
                            )}
                            {mandays && (mandays.days > 0 || mandays.people > 0) && (
                                <tr className="border-b">
                                    <td className="py-3 px-4 font-semibold">MANDAYS-01</td>
                                    <td className="py-3 px-4">Mandays ({mandays.days} days × {mandays.people} people × ${mandays.costPerDay}/day)</td>
                                    <td className="py-3 px-4 text-center">1</td>
                                    <td className="py-3 px-4 text-right">${(mandays.days * mandays.people * mandays.costPerDay).toFixed(2)}</td>
                                    <td className="py-3 px-4 text-right font-medium">${(mandays.days * mandays.people * mandays.costPerDay).toFixed(2)}</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </section>

                {/* --- Totals --- */}
                <section className="flex justify-end my-8">
                    <div className="w-full max-w-xs">
                         <div className="flex justify-between py-1 text-gray-600">
                            <span>Subtotal:</span>
                            <span>${subtotal.toFixed(2)}</span>
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
                </section>

                {/* --- Footer --- */}
                <footer className="pt-8 mt-8 border-t-2 border-gray-200 text-center text-gray-500 text-sm">
                    <p>Thank you for your business!</p>
                    <p>{companyInfo.name} | {companyInfo.address} | {companyInfo.phone}</p>
                </footer>
            </div>
        </div>
    );
};

export default ViewDocumentPage;
