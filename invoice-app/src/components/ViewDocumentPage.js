import React, { useRef, useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase/config';

const ViewDocumentPage = ({ documentToView, navigateTo }) => {
    const printRef = useRef();
    const [companyInfo, setCompanyInfo] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchCompanyInfo = async () => {
            if (auth.currentUser) {
                const settingsRef = doc(db, 'settings', auth.currentUser.uid);
                try {
                    const docSnap = await getDoc(settingsRef);
                    if (docSnap.exists()) {
                        setCompanyInfo(docSnap.data());
                    } else {
                        console.log("No settings document, using defaults.");
                        setCompanyInfo({
                            name: "Your Company Name",
                            address: "123 Business Rd, Suite 100",
                            phone: "555-555-5555",
                            vatNumber: "",
                            logoUrl: "",
                            features: { showLaborAndManDays: true },
                        });
                    }
                } catch (error) {
                    console.error("Error fetching company settings:", error);
                }
            }
            setLoading(false);
        };

        fetchCompanyInfo();

        if (documentToView) {
            const originalTitle = document.title;
            const { type, documentNumber, client } = documentToView;
            document.title = `${type}-${documentNumber}-${client.name}`;

            return () => {
                document.title = originalTitle;
            };
        }
    }, [documentToView]);

    const handlePrint = () => {
        window.print();
    };

    const handleConvertToInvoice = () => {
        navigateTo('newDocument', documentToView);
    };

    if (loading || !documentToView || !companyInfo) {
        return <p>Loading document...</p>;
    }

    const { type, documentNumber, client, date, items, laborPrice, manDaysCost, notes, vatApplied, subtotal, vatAmount, total } = documentToView;
    const { showLaborAndManDays } = companyInfo.features || { showLaborAndManDays: true };

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
                    {type === 'proforma' && (
                        <button onClick={handleConvertToInvoice} className="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded-lg transition-colors duration-200">
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
                        {companyInfo.logoUrl ? (
                            <img src={companyInfo.logoUrl} alt={`${companyInfo.name} logo`} className="h-16 w-auto" />
                        ) : (
                            <h2 className="text-2xl font-bold">{companyInfo.name}</h2>
                        )}
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
                        <p className="text-gray-600">{client.location}</p>
                        <p className="text-gray-600">{client.phone}</p>
                        {client.vatNumber && <p className="text-gray-600">VAT: {client.vatNumber}</p>}
                    </div>
                    <div className="text-right">
                        <h3 className="text-sm font-semibold text-gray-500 uppercase mb-2">From</h3>
                        <p className="font-bold text-gray-800">{companyInfo.name}</p>
                        <p className="text-gray-600">{companyInfo.address}</p>
                        <p className="text-gray-600">{companyInfo.phone}</p>
                        {vatApplied && companyInfo.vatNumber && <p className="text-gray-600">VAT #: {companyInfo.vatNumber}</p>}
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
                            {showLaborAndManDays && laborPrice > 0 && (
                                <tr className="border-b">
                                    <td className="py-3 px-4 font-semibold">SERVICE-01</td>
                                    <td className="py-3 px-4">Labor</td>
                                    <td className="py-3 px-4 text-center">1</td>
                                    <td className="py-3 px-4 text-right">${parseFloat(laborPrice).toFixed(2)}</td>
                                    <td className="py-3 px-4 text-right font-medium">${parseFloat(laborPrice).toFixed(2)}</td>
                                </tr>
                            )}
                            {showLaborAndManDays && manDaysCost > 0 && (
                                <tr className="border-b">
                                    <td className="py-3 px-4 font-semibold">MAN-DAYS-01</td>
                                    <td className="py-3 px-4">Man-days Cost</td>
                                    <td className="py-3 px-4 text-center">1</td>
                                    <td className="py-3 px-4 text-right">${parseFloat(manDaysCost).toFixed(2)}</td>
                                    <td className="py-3 px-4 text-right font-medium">${parseFloat(manDaysCost).toFixed(2)}</td>
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
