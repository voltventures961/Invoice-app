import React, { useState, useEffect } from 'react';
import { signOut } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import { COMPANY_INFO } from '../config';

const Sidebar = ({ navigateTo, currentPage, isOpen, setOpen }) => {
    const [companyName, setCompanyName] = useState(COMPANY_INFO.name);
    const [userInfo, setUserInfo] = useState({ displayName: '', email: '' });

    useEffect(() => {
        if (!auth.currentUser) return;
        
        // Get user info from auth
        setUserInfo({
            displayName: auth.currentUser.displayName || 'User',
            email: auth.currentUser.email || ''
        });
        
        const settingsRef = doc(db, 'settings', auth.currentUser.uid);
        const unsubscribe = onSnapshot(settingsRef, (docSnap) => {
            if (docSnap.exists()) {
                setCompanyName(docSnap.data().companyName || COMPANY_INFO.name);
            }
        });
        return () => unsubscribe();
    }, []);

    const handleLogout = async () => {
        await signOut(auth);
    };

    const handleNavigate = (page) => {
        navigateTo(page);
        setOpen(false); // Close sidebar on navigation
    };

    const navItems = [
        { name: 'Dashboard', page: 'dashboard' },
        { name: 'Proformas', page: 'proformas' },
        { name: 'Invoices', page: 'invoices' },
        { name: 'Payments', page: 'payments' },
        { name: 'Stock Items', page: 'stock' },
        { name: 'Clients', page: 'clients' },
        { name: 'Accounting', page: 'accounting' },
        { name: 'Settings', page: 'settings' },
    ];

    const sidebarClasses = `
        bg-gray-800 text-white w-64 space-y-6 py-7 px-2 absolute inset-y-0 left-0 transform
        ${isOpen ? "translate-x-0" : "-translate-x-full"} md:relative md:translate-x-0
        transition duration-200 ease-in-out z-20 flex flex-col shadow-lg
    `;

    return (
        <div className={sidebarClasses}>
            <div className="p-5 border-b border-gray-700">
                <div className="text-2xl font-bold text-white">
                    {companyName}
                </div>
                <div className="mt-2 flex items-center space-x-2">
                    <div className="w-6 h-6 bg-indigo-500 rounded-full flex items-center justify-center flex-shrink-0">
                        <span className="text-white font-semibold text-xs">
                            {userInfo.displayName.charAt(0).toUpperCase()}
                        </span>
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-300 truncate">
                            {userInfo.displayName}
                        </p>
                        <p className="text-xs text-gray-400 truncate">
                            {userInfo.email}
                        </p>
                    </div>
                </div>
            </div>
            <nav className="flex-1 px-2 py-4 space-y-2">
                {navItems.map(item => (
                    <button
                        key={item.name}
                        onClick={() => handleNavigate(item.page)}
                        className={`w-full text-left flex items-center px-4 py-2 text-sm font-medium rounded-md transition-colors duration-200 ${
                            currentPage === item.page ? 'bg-gray-900 text-white' : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                        }`}
                    >
                        {item.name}
                    </button>
                ))}
            </nav>
            <div className="p-4 border-t border-gray-700">
                {/* User Information */}
                <div className="mb-4 p-3 bg-gray-700 rounded-lg">
                    <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-indigo-500 rounded-full flex items-center justify-center">
                            <span className="text-white font-semibold text-sm">
                                {userInfo.displayName.charAt(0).toUpperCase()}
                            </span>
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-white truncate">
                                {userInfo.displayName}
                            </p>
                            <p className="text-xs text-gray-300 truncate">
                                {userInfo.email}
                            </p>
                        </div>
                    </div>
                </div>
                
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

export default Sidebar;
