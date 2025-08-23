import React from 'react';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase/config';
import { COMPANY_INFO } from '../config';

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
        <div className="w-64 bg-gray-800 text-white flex-col hidden sm:flex shadow-lg">
            <div className="p-5 text-2xl font-bold border-b border-gray-700">
                {COMPANY_INFO.name}
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

export default Sidebar;
