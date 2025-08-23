import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut } from 'firebase/auth';
import { getFirestore, collection, addDoc, getDocs, doc, setDoc, query, where, onSnapshot } from 'firebase/firestore';
import { setLogLevel } from 'firebase/firestore';

// --- IMPORTANT: Firebase Configuration ---
// The code now automatically uses the environment's Firebase configuration.
// If you run this code outside of this environment, you MUST replace
// the placeholder values below with your own Firebase project's configuration.
const firebaseConfig = typeof __firebase_config !== 'undefined'
  ? JSON.parse(__firebase_config)
  : {
      apiKey: "AIzaSyCqBJKP95b_Mflu0Npg6YUbkQ3W-dXNrfc",
      authDomain: "voltventures-ec8c4.firebaseapp.com",
      projectId: "voltventures-ec8c4",
      storageBucket: "voltventures-ec8c4.firebasestorage.app",
      messagingSenderId: "326689103951",
      appId: "1:326689103951:web:0acd6ce51513b17f2e4a3a"
    };


// --- Initialize Firebase ---
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
setLogLevel('debug'); // Optional: for detailed console logs

// --- Main App Component ---
export default function App() {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState('dashboard'); // 'login', 'register', 'dashboard', 'stock', 'clients', 'newDocument', 'viewDocument'
    const [editingDocument, setEditingDocument] = useState(null);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
            setUser(currentUser);
            setLoading(false);
            if (currentUser) {
                setPage('dashboard');
            } else {
                setPage('login');
            }
        });
        return () => unsubscribe();
    }, []);

    const navigateTo = (pageName, data = null) => {
        if (pageName === 'newDocument' && data) {
            setEditingDocument(data);
        } else if (pageName === 'viewDocument' && data) {
            setEditingDocument(data);
        }
        else {
            setEditingDocument(null);
        }
        setPage(pageName);
    };
    
    const renderPage = () => {
        if (loading) {
            return <div className="flex justify-center items-center h-screen"><div className="animate-spin rounded-full h-32 w-32 border-t-2 border-b-2 border-blue-500"></div></div>;
        }

        if (!user) {
            switch (page) {
                case 'register':
                    return <RegisterPage setPage={setPage} />;
                default:
                    return <LoginPage setPage={setPage} />;
            }
        }

        return (
            <div className="flex h-screen bg-gray-100 font-sans">
                <Sidebar navigateTo={navigateTo} currentPage={page} />
                <main className="flex-1 p-6 sm:p-10 overflow-y-auto">
                    {page === 'dashboard' && <Dashboard navigateTo={navigateTo} />}
                    {page === 'stock' && <StockPage />}
                    {page === 'clients' && <ClientsPage />}
                    {page === 'newDocument' && <NewDocumentPage navigateTo={navigateTo} documentToEdit={editingDocument} />}
                    {page === 'viewDocument' && <ViewDocumentPage documentToView={editingDocument} navigateTo={navigateTo} />}
                </main>
            </div>
        );
    };

    return <div className="antialiased">{renderPage()}</div>;
}

// --- Authentication Components ---
const LoginPage = ({ setPage }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    const handleLogin = async (e) => {
        e.preventDefault();
        setError('');
        try {
            await signInWithEmailAndPassword(auth, email, password);
        } catch (err) {
            setError('Failed to log in. Please check your email and password.');
            console.error("Login Error:", err);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-md w-full space-y-8 bg-white p-10 rounded-xl shadow-lg">
                <div>
                    <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">Sign in to your account</h2>
                </div>
                <form className="mt-8 space-y-6" onSubmit={handleLogin}>
                    {error && <p className="text-red-500 text-sm text-center">{error}</p>}
                    <div className="rounded-md shadow-sm -space-y-px">
                        <div>
                            <input id="email-address" name="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm" placeholder="Email address" />
                        </div>
                        <div>
                            <input id="password" name="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm" placeholder="Password" />
                        </div>
                    </div>
                    <div>
                        <button type="submit" className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">
                            Sign in
                        </button>
                    </div>
                </form>
                <p className="mt-2 text-center text-sm text-gray-600">
                    Don't have an account?{' '}
                    <button onClick={() => setPage('register')} className="font-medium text-indigo-600 hover:text-indigo-500">
                        Register here
                    </button>
                </p>
            </div>
        </div>
    );
};

const RegisterPage = ({ setPage }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    const handleRegister = async (e) => {
        e.preventDefault();
        setError('');
        try {
            await createUserWithEmailAndPassword(auth, email, password);
        } catch (err) {
            setError('Failed to create an account. The email might already be in use.');
            console.error("Registration Error:", err);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-md w-full space-y-8 bg-white p-10 rounded-xl shadow-lg">
                <div>
                    <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">Create a new account</h2>
                </div>
                <form className="mt-8 space-y-6" onSubmit={handleRegister}>
                    {error && <p className="text-red-500 text-sm text-center">{error}</p>}
                    <div className="rounded-md shadow-sm -space-y-px">
                        <div>
                            <input id="email-address" name="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm" placeholder="Email address" />
                        </div>
                        <div>
                            <input id="password" name="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm" placeholder="Password (min. 6 characters)" />
                        </div>
                    </div>
                    <div>
                        <button type="submit" className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">
                            Register
                        </button>
                    </div>
                </form>
                <p className="mt-2 text-center text-sm text-gray-600">
                    Already have an account?{' '}
                    <button onClick={() => setPage('login')} className="font-medium text-indigo-600 hover:text-indigo-500">
                        Sign in
                    </button>
                </p>
            </div>
        </div>
    );
};

// --- UI Components ---
const Sidebar = ({ navigateTo, currentPage }) => {
    const handleLogout = async () => {
        await signOut(auth);
    };

    const navItems = [
        { name: 'Dashboard', page: 'dashboard' },
        { name: 'Stock Items', page: 'stock' },
        { name: 'Clients', page: 'clients' },
    ];

    return (
        <div className="w-64 bg-gray-800 text-white flex-col hidden sm:flex">
            <div className="p-5 text-2xl font-bold border-b border-gray-700">
                ElecInvoice
            </div>
            <nav className="flex-1 px-2 py-4 space-y-2">
                {navItems.map(item => (
                    <button
                        key={item.name}
                        onClick={() => navigateTo(item.page)}
                        className={`w-full text-left flex items-center px-4 py-2 text-sm font-medium rounded-md transition-colors duration-200 ${
                            currentPage === item.page ? 'bg-gray-900 text-white' : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                        }`}
                    >
                        {item.name}
                    </button>
                ))}
            </nav>
            <div className="p-4 border-t border-gray-700">
                <button
                    onClick={handleLogout}
                    className="w-full text-left flex items-center px-4 py-2 text-sm font-medium rounded-md text-gray-300 hover:bg-gray-700 hover:text-white"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-3" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 102 0V4a1 1 0 00-1-1zm10.293 9.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L14.586 9H7a1 1 0 100 2h7.586l-1.293 1.293z" clipRule="evenodd" /></svg>
                    Logout
                </button>
            </div>
        </div>
    );
};

// --- Page Components ---
const Dashboard = ({ navigateTo }) => {
    const [documents, setDocuments] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!auth.currentUser) return;
        const q = query(collection(db, `documents/${auth.currentUser.uid}/userDocuments`));
        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const docs = [];
            querySnapshot.forEach((doc) => {
                docs.push({ id: doc.id, ...doc.data() });
            });
            // Sort documents by date, newest first
            docs.sort((a, b) => b.date.toDate() - a.date.toDate());
            setDocuments(docs);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching documents: ", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    return (
        <div>
            <h1 className="text-3xl font-bold text-gray-800 mb-6">Dashboard</h1>
            <div className="flex justify-end mb-6">
                <button onClick={() => navigateTo('newDocument')} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg shadow-md transition-transform transform hover:scale-105">
                    + Create New Document
                </button>
            </div>
            
            <div className="bg-white p-6 rounded-lg shadow-lg">
                <h2 className="text-xl font-semibold text-gray-700 mb-4">Recent Documents</h2>
                <div className="overflow-x-auto">
                    {loading ? <p>Loading documents...</p> :
                     documents.length === 0 ? <p className="text-gray-500">No documents found. Create one to get started!</p> :
                    <table className="min-w-full bg-white">
                        <thead className="bg-gray-200 text-gray-600 uppercase text-sm leading-normal">
                            <tr>
                                <th className="py-3 px-6 text-left">Type</th>
                                <th className="py-3 px-6 text-left">Number</th>
                                <th className="py-3 px-6 text-left">Client</th>
                                <th className="py-3 px-6 text-center">Date</th>
                                <th className="py-3 px-6 text-right">Total</th>
                                <th className="py-3 px-6 text-center">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="text-gray-600 text-sm font-light">
                            {documents.map(doc => (
                                <tr key={doc.id} className="border-b border-gray-200 hover:bg-gray-100">
                                    <td className="py-3 px-6 text-left whitespace-nowrap">
                                        <span className={`py-1 px-3 rounded-full text-xs ${doc.type === 'invoice' ? 'bg-green-200 text-green-700' : 'bg-yellow-200 text-yellow-700'}`}>
                                            {doc.type}
                                        </span>
                                    </td>
                                    <td className="py-3 px-6 text-left">{doc.documentNumber}</td>
                                    <td className="py-3 px-6 text-left">{doc.client.name}</td>
                                    <td className="py-3 px-6 text-center">{doc.date.toDate().toLocaleDateString()}</td>
                                    <td className="py-3 px-6 text-right font-semibold">${doc.total.toFixed(2)}</td>
                                    <td className="py-3 px-6 text-center">
                                        <div className="flex item-center justify-center">
                                            <button onClick={() => navigateTo('viewDocument', doc)} className="w-4 mr-2 transform hover:text-purple-500 hover:scale-110">
                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    }
                </div>
            </div>
        </div>
    );
};

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
                <button onClick={() => setShowForm(!showForm)} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg shadow-md transition-transform transform hover:scale-105">
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

const ClientsPage = () => {
    const [clients, setClients] = useState([]);
    const [showForm, setShowForm] = useState(false);
    const [newClient, setNewClient] = useState({ name: '', phone: '', location: '', vatNumber: '' });

    useEffect(() => {
        if (!auth.currentUser) return;
        const q = query(collection(db, `clients/${auth.currentUser.uid}/userClients`));
        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const clientsList = [];
            querySnapshot.forEach((doc) => {
                clientsList.push({ id: doc.id, ...doc.data() });
            });
            setClients(clientsList);
        });
        return () => unsubscribe();
    }, []);

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setNewClient({ ...newClient, [name]: value });
    };

    const handleAddClient = async (e) => {
        e.preventDefault();
        if (!auth.currentUser) return;
        try {
            await addDoc(collection(db, `clients/${auth.currentUser.uid}/userClients`), newClient);
            setNewClient({ name: '', phone: '', location: '', vatNumber: '' });
            setShowForm(false);
        } catch (error) {
            console.error("Error adding client: ", error);
        }
    };

    return (
        <div>
            <h1 className="text-3xl font-bold text-gray-800 mb-6">Clients</h1>
            <div className="flex justify-end mb-6">
                <button onClick={() => setShowForm(!showForm)} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg shadow-md transition-transform transform hover:scale-105">
                    {showForm ? 'Cancel' : '+ Add New Client'}
                </button>
            </div>

            {showForm && (
                <div className="bg-white p-6 rounded-lg shadow-lg mb-6">
                    <h2 className="text-xl font-semibold text-gray-700 mb-4">Add New Client</h2>
                    <form onSubmit={handleAddClient}>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <input type="text" name="name" value={newClient.name} onChange={handleInputChange} placeholder="Client Name" required className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500" />
                            <input type="text" name="phone" value={newClient.phone} onChange={handleInputChange} placeholder="Phone Number" className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500" />
                            <input type="text" name="location" value={newClient.location} onChange={handleInputChange} placeholder="Location" className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500" />
                            <input type="text" name="vatNumber" value={newClient.vatNumber} onChange={handleInputChange} placeholder="VAT Number" className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500" />
                        </div>
                        <div className="mt-4 flex justify-end">
                            <button type="submit" className="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded-lg">Save Client</button>
                        </div>
                    </form>
                </div>
            )}

            <div className="bg-white p-6 rounded-lg shadow-lg">
                 <div className="overflow-x-auto">
                    <table className="min-w-full bg-white">
                        <thead className="bg-gray-200 text-gray-600 uppercase text-sm leading-normal">
                            <tr>
                                <th className="py-3 px-6 text-left">Name</th>
                                <th className="py-3 px-6 text-left">Phone</th>
                                <th className="py-3 px-6 text-left">Location</th>
                                <th className="py-3 px-6 text-left">VAT Number</th>
                            </tr>
                        </thead>
                        <tbody className="text-gray-600 text-sm font-light">
                            {clients.map(client => (
                                <tr key={client.id} className="border-b border-gray-200 hover:bg-gray-100">
                                    <td className="py-3 px-6 text-left font-medium">{client.name}</td>
                                    <td className="py-3 px-6 text-left">{client.phone}</td>
                                    <td className="py-3 px-6 text-left">{client.location}</td>
                                    <td className="py-3 px-6 text-left">{client.vatNumber}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

const NewDocumentPage = ({ navigateTo, documentToEdit }) => {
    const [docType, setDocType] = useState('proforma');
    const [clients, setClients] = useState([]);
    const [selectedClient, setSelectedClient] = useState('');
    const [stockItems, setStockItems] = useState([]);
    const [selectedStockItem, setSelectedStockItem] = useState('');
    const [lineItems, setLineItems] = useState([]);
    const [laborPrice, setLaborPrice] = useState(0);
    const [notes, setNotes] = useState('');
    const [vatApplied, setVatApplied] = useState(false);
    const [documentNumber, setDocumentNumber] = useState('');

    useEffect(() => {
        const fetchInitialData = async () => {
            if (!auth.currentUser) return;
            // Fetch clients
            const clientQuery = query(collection(db, `clients/${auth.currentUser.uid}/userClients`));
            const clientSnapshot = await getDocs(clientQuery);
            setClients(clientSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            
            // Fetch stock items
            const itemQuery = query(collection(db, `items/${auth.currentUser.uid}/userItems`));
            const itemSnapshot = await getDocs(itemQuery);
            setStockItems(itemSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        };
        fetchInitialData();

        if (documentToEdit) {
            // Logic for converting a proforma to an invoice
            setDocType('invoice');
            setSelectedClient(documentToEdit.client.id);
            setLineItems(documentToEdit.items);
            setLaborPrice(documentToEdit.laborPrice || 0);
            setNotes(documentToEdit.notes || '');
            setVatApplied(documentToEdit.vatApplied || false);
            setDocumentNumber(`INV-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`);
        } else {
            setDocumentNumber(`PI-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`);
        }
    }, [documentToEdit]);

    const handleAddItemToList = () => {
        if (!selectedStockItem) return;
        const item = stockItems.find(i => i.id === selectedStockItem);
        if (item) {
            setLineItems([...lineItems, {
                ...item,
                itemId: item.id,
                qty: 1,
                unitPrice: item.sellingPrice
            }]);
            setSelectedStockItem('');
        }
    };

    const handleLineItemChange = (index, field, value) => {
        const updatedItems = [...lineItems];
        const numValue = parseFloat(value);
        if (!isNaN(numValue)) {
            updatedItems[index][field] = numValue;
            setLineItems(updatedItems);
        }
    };
    
    const handleRemoveLineItem = (index) => {
        const updatedItems = lineItems.filter((_, i) => i !== index);
        setLineItems(updatedItems);
    };

    const calculateSubtotal = () => {
        const itemsTotal = lineItems.reduce((acc, item) => acc + (item.qty * item.unitPrice), 0);
        return itemsTotal + parseFloat(laborPrice || 0);
    };

    const subtotal = calculateSubtotal();
    const vatAmount = vatApplied ? subtotal * 0.11 : 0;
    const total = subtotal + vatAmount;

    const handleSaveDocument = async () => {
        if (!selectedClient || (lineItems.length === 0 && parseFloat(laborPrice || 0) === 0) ) {
            // Using a custom modal instead of alert
            const modal = document.getElementById('error-modal');
            modal.classList.remove('hidden');
            setTimeout(() => modal.classList.add('hidden'), 3000);
            return;
        }
        if (!auth.currentUser) return;

        const clientData = clients.find(c => c.id === selectedClient);

        const documentData = {
            type: docType,
            documentNumber,
            client: clientData,
            date: new Date(),
            items: lineItems,
            laborPrice: parseFloat(laborPrice || 0),
            notes,
            vatApplied,
            subtotal,
            vatAmount,
            total
        };

        try {
            await addDoc(collection(db, `documents/${auth.currentUser.uid}/userDocuments`), documentData);
            navigateTo('dashboard');
        } catch (error) {
            console.error("Error saving document: ", error);
        }
    };

    return (
        <div>
            {/* Error Modal */}
            <div id="error-modal" className="hidden fixed top-5 right-5 bg-red-500 text-white py-2 px-4 rounded-lg shadow-lg z-50">
                Please select a client and add at least one item or labor charge.
            </div>

            <h1 className="text-3xl font-bold text-gray-800 mb-6">{documentToEdit ? 'Create Invoice from Proforma' : 'Create New Document'}</h1>
            <div className="bg-white p-8 rounded-lg shadow-lg">
                {/* Header */}
                <div className="flex justify-between items-start mb-8">
                    <div>
                        <h2 className="text-2xl font-bold text-gray-800 uppercase">{docType}</h2>
                        <p className="text-gray-500">{documentNumber}</p>
                    </div>
                    <div className="flex space-x-4">
                        <div className="flex items-center">
                            <label htmlFor="vat" className="mr-2 font-medium text-gray-700">Apply VAT (11%)</label>
                            <input type="checkbox" id="vat" checked={vatApplied} onChange={(e) => setVatApplied(e.target.checked)} className="h-5 w-5 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500" />
                        </div>
                    </div>
                </div>

                {/* Client Selection */}
                <div className="mb-8">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Select Client</label>
                    <select value={selectedClient} onChange={(e) => setSelectedClient(e.target.value)} className="w-full p-2 border border-gray-300 rounded-md">
                        <option value="">-- Choose a client --</option>
                        {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                </div>

                {/* Add Items */}
                <div className="mb-8 p-4 border rounded-lg bg-gray-50">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Add Item from Stock</label>
                    <div className="flex items-center space-x-2">
                        <select value={selectedStockItem} onChange={(e) => setSelectedStockItem(e.target.value)} className="flex-grow p-2 border border-gray-300 rounded-md">
                            <option value="">-- Select an item --</option>
                            {stockItems.map(i => <option key={i.id} value={i.id}>{i.partNumber} - {i.brand} ({i.specs})</option>)}
                        </select>
                        <button onClick={handleAddItemToList} className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-md">Add</button>
                    </div>
                </div>

                {/* Line Items Table */}
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
                                    <td className="py-2 px-4">
                                        <input type="number" value={item.qty} onChange={(e) => handleLineItemChange(index, 'qty', e.target.value)} className="w-20 p-1 border rounded-md" />
                                    </td>
                                    <td className="py-2 px-4">
                                        <input type="number" value={item.unitPrice} onChange={(e) => handleLineItemChange(index, 'unitPrice', e.target.value)} className="w-24 p-1 border rounded-md" />
                                    </td>
                                    <td className="py-2 px-4 text-gray-400 buying-price-col">${item.buyingPrice.toFixed(2)}</td>
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

                {/* Notes, Labor, and Totals */}
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

                {/* Actions */}
                <div className="mt-10 flex justify-end space-x-4">
                    <button onClick={() => navigateTo('dashboard')} className="bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-6 rounded-lg">Cancel</button>
                    <button onClick={handleSaveDocument} className="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-6 rounded-lg">Save {docType}</button>
                </div>
            </div>
        </div>
    );
};

const ViewDocumentPage = ({ documentToView, navigateTo }) => {
    const printRef = useRef();

    const handlePrint = () => {
        window.print();
    };

    const handleConvertToInvoice = () => {
        navigateTo('newDocument', documentToView);
    };

    if (!documentToView) {
        return <p>No document selected.</p>;
    }
    
    const { type, documentNumber, client, date, items, laborPrice, notes, vatApplied, subtotal, vatAmount, total } = documentToView;

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
                        <button onClick={handleConvertToInvoice} className="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded-lg">
                            Convert to Invoice
                        </button>
                    )}
                    <button onClick={handlePrint} className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-lg">
                        Print / Save PDF
                    </button>
                    <button onClick={() => navigateTo('dashboard')} className="bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg">
                        Back to Dashboard
                    </button>
                </div>
            </div>

            <div ref={printRef} className="print-area bg-white p-8 md:p-12 rounded-lg shadow-lg">
                {/* --- Header --- */}
                <header className="flex justify-between items-center pb-8 border-b-2 border-gray-200">
                    <div>
                        {/* Replace with your logo */}
                        <div className="text-2xl font-bold text-gray-800 bg-gray-200 w-32 h-16 flex items-center justify-center rounded">LOGO</div>
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
                        <p className="font-bold text-gray-800">Gaby Zoghby</p>
                        <p className="text-gray-600">+961 71 491 169</p>
                        {vatApplied && <p className="text-gray-600">VAT #: YOUR_VAT_NUMBER</p>}
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
                    <p>My Company Name | My Address | My Contact Info</p>
                </footer>
            </div>
        </div>
    );
};

