import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, addDoc } from 'firebase/firestore';
import { auth, db } from '../firebase/config';

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
                <button onClick={() => setShowForm(!showForm)} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg shadow-md transition-transform transform hover:scale-105 transition-colors duration-200">
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

export default ClientsPage;
