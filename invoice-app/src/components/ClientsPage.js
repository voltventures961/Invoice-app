import React, { useState, useEffect, useRef } from 'react';
import { collection, query, onSnapshot, addDoc, updateDoc, deleteDoc, doc, runTransaction, writeBatch } from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import Papa from 'papaparse';

// Helper function to get the next sequential ID for clients
const getNextClientId = async (userId) => {
    const counterRef = doc(db, `counters/${userId}/clientCounter`, 'counter');
    try {
        const newId = await runTransaction(db, async (transaction) => {
            const counterDoc = await transaction.get(counterRef);
            if (!counterDoc.exists()) {
                transaction.set(counterRef, { lastId: 1 });
                return 1;
            }
            const newLastId = counterDoc.data().lastId + 1;
            transaction.update(counterRef, { lastId: newLastId });
            return newLastId;
        });
        return newId;
    } catch (e) {
        console.error("Client ID transaction failed: ", e);
        throw e;
    }
};

const ClientsPage = () => {
    const [clients, setClients] = useState([]);
    const [showForm, setShowForm] = useState(false);
    const [newClient, setNewClient] = useState({ name: '', phone: '', location: '', vatNumber: '' });
    const [editingClient, setEditingClient] = useState(null);
    const fileInputRef = useRef(null);

    useEffect(() => {
        if (!auth.currentUser) return;
        const q = query(collection(db, `clients/${auth.currentUser.uid}/userClients`));
        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const clientsList = [];
            querySnapshot.forEach((doc) => {
                clientsList.push({ id: doc.id, ...doc.data() });
            });
            clientsList.sort((a,b) => a.clientId - b.clientId);
            setClients(clientsList);
        });
        return () => unsubscribe();
    }, []);

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setNewClient({ ...newClient, [name]: value });
    };

    const handleSaveClient = async (e) => {
        e.preventDefault();
        if (!auth.currentUser) return;
        try {
            if (editingClient) {
                const clientRef = doc(db, `clients/${auth.currentUser.uid}/userClients`, editingClient.id);
                await updateDoc(clientRef, newClient);
            } else {
                const newClientId = await getNextClientId(auth.currentUser.uid);
                await addDoc(collection(db, `clients/${auth.currentUser.uid}/userClients`), { ...newClient, clientId: newClientId });
            }
            resetForm();
        } catch (error) {
            console.error("Error saving client: ", error);
        }
    };

    const handleEdit = (client) => {
        setNewClient(client);
        setEditingClient(client);
        setShowForm(true);
    };

    const handleDelete = async (clientId) => {
        if (window.confirm("Are you sure you want to delete this client?")) {
            if (!auth.currentUser) return;
            try {
                const clientRef = doc(db, `clients/${auth.currentUser.uid}/userClients`, clientId);
                await deleteDoc(clientRef);
            } catch (error) {
                console.error("Error deleting client: ", error);
            }
        }
    };

    const resetForm = () => {
        setNewClient({ name: '', phone: '', location: '', vatNumber: '' });
        setEditingClient(null);
        setShowForm(false);
    };

    const handleExport = () => {
        const csv = Papa.unparse(clients.map(({ id, ...client }) => client));
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", "clients.csv");
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleImport = (event) => {
        const file = event.target.files[0];
        if (!file) return;

        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: async (results) => {
                if (!auth.currentUser) return;
                const batch = writeBatch(db);
                const clientsCollection = collection(db, `clients/${auth.currentUser.uid}/userClients`);

                for (const row of results.data) {
                    try {
                        const newClientId = await getNextClientId(auth.currentUser.uid);
                        const newClientRef = doc(clientsCollection);
                        batch.set(newClientRef, { ...row, clientId: newClientId });
                    } catch(error) {
                        console.error("Error preparing batch for client import:", error);
                        return;
                    }
                }

                try {
                    await batch.commit();
                    alert('Client import successful!');
                } catch (error) {
                    console.error("Error importing clients: ", error);
                    alert('Client import failed. Please check the console.');
                }
            },
            error: (error) => {
                console.error("Error parsing client CSV:", error);
                alert('Failed to parse CSV file.');
            }
        });
        if(fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    };

    return (
        <div>
            <h1 className="text-3xl font-bold text-gray-800 mb-6">Clients</h1>
            <div className="flex justify-end mb-6 space-x-2">
                <input type="file" ref={fileInputRef} onChange={handleImport} accept=".csv" className="hidden" id="client-csv-importer" />
                <button onClick={() => document.getElementById('client-csv-importer').click()} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg shadow-md transition-transform transform hover:scale-105">Import CSV</button>
                <button onClick={handleExport} className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg shadow-md transition-transform transform hover:scale-105">Export CSV</button>
                <button onClick={() => { setShowForm(!showForm); if(editingClient) resetForm(); }} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg shadow-md transition-transform transform hover:scale-105">
                    {showForm ? 'Cancel' : '+ Add New Client'}
                </button>
            </div>

            {showForm && (
                <div className="bg-white p-6 rounded-lg shadow-lg mb-6">
                    <h2 className="text-xl font-semibold text-gray-700 mb-4">{editingClient ? 'Edit Client' : 'Add New Client'}</h2>
                    <form onSubmit={handleSaveClient}>
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
                                <th className="py-3 px-6 text-left">ID</th>
                                <th className="py-3 px-6 text-left">Name</th>
                                <th className="py-3 px-6 text-left">Phone</th>
                                <th className="py-3 px-6 text-left">Location</th>
                                <th className="py-3 px-6 text-left">VAT Number</th>
                                <th className="py-3 px-6 text-center">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="text-gray-600 text-sm font-light">
                            {clients.map(client => (
                                <tr key={client.id} className="border-b border-gray-200 hover:bg-gray-100">
                                    <td className="py-3 px-6 text-left font-bold">{client.clientId}</td>
                                    <td className="py-3 px-6 text-left font-medium">{client.name}</td>
                                    <td className="py-3 px-6 text-left">{client.phone}</td>
                                    <td className="py-3 px-6 text-left">{client.location}</td>
                                    <td className="py-3 px-6 text-left">{client.vatNumber}</td>
                                    <td className="py-3 px-6 text-center">
                                        <div className="flex item-center justify-center">
                                            <button onClick={() => handleEdit(client)} className="w-4 mr-2 transform hover:text-purple-500 hover:scale-110">
                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L15.232 5.232z" /></svg>
                                            </button>
                                            <button onClick={() => handleDelete(client.id)} className="w-4 mr-2 transform hover:text-red-500 hover:scale-110">
                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default ClientsPage;
