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
import ProformasPage from './components/ProformasPage';
import InvoicesPage from './components/InvoicesPage';
import SettingsPage from './components/SettingsPage';
import AccountingPage from './components/AccountingPage';
import PaymentsPage from './components/PaymentsPage';
import Sidebar from './components/Sidebar';

export default function App() {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState('dashboard'); // 'login', 'register', 'dashboard', 'proformas', 'invoices', 'payments', 'stock', 'clients', 'newDocument', 'viewDocument', 'settings', 'accounting'
    const [editingDocument, setEditingDocument] = useState(null);
    const [isSidebarOpen, setSidebarOpen] = useState(false);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
            setUser(currentUser);
            setLoading(false);
            if (currentUser) {
                // Always default to dashboard regardless of when user was created
                // User can navigate to settings if they need to
                setPage('dashboard');
            } else {
                setPage('login');
            }
        });
        return () => unsubscribe();
    }, []);

    const navigateTo = (pageName, data = null) => {
        if ((pageName === 'newDocument' || pageName === 'viewDocument') && data) {
            setEditingDocument(data);
        } else {
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
            <div className="relative min-h-screen md:flex">
                {/* Mobile menu button */}
                <div className="md:hidden flex justify-between items-center p-4 bg-gray-800 text-white">
                    <h1 className="text-xl font-bold">{page.charAt(0).toUpperCase() + page.slice(1)}</h1>
                    <button onClick={() => setSidebarOpen(!isSidebarOpen)}>
                        <svg className="h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16m-7 6h7" />
                        </svg>
                    </button>
                </div>

                <Sidebar navigateTo={navigateTo} currentPage={page} isOpen={isSidebarOpen} setOpen={setSidebarOpen} />

                <main className="flex-1 p-6 sm:p-10 overflow-y-auto bg-gray-100 font-sans">
                    {page === 'dashboard' && <Dashboard navigateTo={navigateTo} />}
                    {page === 'proformas' && <ProformasPage navigateTo={navigateTo} />}
                    {page === 'invoices' && <InvoicesPage navigateTo={navigateTo} />}
                    {page === 'payments' && <PaymentsPage />}
                    {page === 'stock' && <StockPage />}
                    {page === 'clients' && <ClientsPage />}
                    {page === 'newDocument' && <NewDocumentPage navigateTo={navigateTo} documentToEdit={editingDocument} />}
                    {page === 'viewDocument' && <ViewDocumentPage documentToView={editingDocument} navigateTo={navigateTo} />}
                    {page === 'settings' && <SettingsPage />}
                    {page === 'accounting' && <AccountingPage />}
                </main>
            </div>
        );
    };

    return <div className="antialiased">{renderPage()}</div>;
}
