import React, { useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebase/config';
import LoginPage from './components/LoginPage';
import RegisterPage from './components/RegisterPage';
import Dashboard from './components/Dashboard';
import StockPage from './components/StockPage';
import ClientsPage from './components/ClientsPage';
import NewDocumentPage from './components/NewDocumentPage';
import ViewDocumentPage from './components/ViewDocumentPage';
import Sidebar from './components/Sidebar';

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
