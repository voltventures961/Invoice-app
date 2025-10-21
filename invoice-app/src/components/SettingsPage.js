import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { updateProfile, updateEmail, updatePassword, reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth';
import { auth, db, storage } from '../firebase/config';
import { repairMigratedPayments } from '../utils/paymentMigration';

const SettingsPage = () => {
    const [companyName, setCompanyName] = useState('');
    const [companyAddress, setCompanyAddress] = useState('');
    const [companyPhone, setCompanyPhone] = useState('');
    const [companyVatNumber, setCompanyVatNumber] = useState('');
    const [logoUrl, setLogoUrl] = useState('');
    const [imageFile, setImageFile] = useState(null);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [loading, setLoading] = useState(true);
    const [feedback, setFeedback] = useState({ type: '', message: '' });
    
    // User account settings
    const [userDisplayName, setUserDisplayName] = useState('');
    const [userEmail, setUserEmail] = useState('');
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [activeTab, setActiveTab] = useState('company');

    useEffect(() => {
        const fetchSettings = async () => {
            if (!auth.currentUser) return;
            
            // Load user account info
            setUserDisplayName(auth.currentUser.displayName || '');
            setUserEmail(auth.currentUser.email || '');
            
            const settingsRef = doc(db, 'settings', auth.currentUser.uid);
            try {
                const docSnap = await getDoc(settingsRef);
                if (docSnap.exists()) {
                    const settings = docSnap.data();
                    setCompanyName(settings.companyName || '');
                    setCompanyAddress(settings.companyAddress || '');
                    setCompanyPhone(settings.companyPhone || '');
                    setCompanyVatNumber(settings.companyVatNumber || '');
                    setLogoUrl(settings.logoUrl || '');
                }
            } catch (error) {
                console.error("Error fetching settings:", error);
                setFeedback({ type: 'error', message: 'Failed to fetch settings.' });
            } finally {
                setLoading(false);
            }
        };
        fetchSettings();
    }, []);

    const handleImageChange = (e) => {
        if (e.target.files[0]) {
            const file = e.target.files[0];
            
            // Check file size (5MB limit)
            if (file.size > 5 * 1024 * 1024) {
                setFeedback({ type: 'error', message: 'File size must be less than 5MB' });
                return;
            }
            
            // Check file type
            const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif'];
            if (!allowedTypes.includes(file.type)) {
                setFeedback({ type: 'error', message: 'Please upload a valid image file (PNG, JPG, or GIF)' });
                return;
            }
            
            setImageFile(file);
            setFeedback({ type: '', message: '' });
        }
    };

    const handleSave = async () => {
        if (!auth.currentUser) return;
        setLoading(true);
        setFeedback({ type: '', message: '' });

        let newLogoUrl = logoUrl;

        if (imageFile) {
            try {
                // Check file size for base64 storage (limit to 1MB for Firestore)
                if (imageFile.size > 1 * 1024 * 1024) {
                    setFeedback({
                        type: 'error',
                        message: 'Logo file is too large. Please use an image under 1MB or configure CORS for Firebase Storage.'
                    });
                    setLoading(false);
                    setImageFile(null);
                    return;
                }

                // Try Firebase Storage first
                setUploadProgress(25);
                try {
                    const timestamp = Date.now();
                    const fileName = `${timestamp}_${imageFile.name}`;
                    const storageRef = ref(storage, `logos/${auth.currentUser.uid}/${fileName}`);

                    setUploadProgress(50);
                    const snapshot = await uploadBytes(storageRef, imageFile);

                    setUploadProgress(75);
                    newLogoUrl = await getDownloadURL(snapshot.ref);
                    setLogoUrl(newLogoUrl);
                    setUploadProgress(100);
                    console.log('Logo uploaded to Firebase Storage successfully');
                } catch (storageError) {
                    // If Storage fails (CORS error), fall back to base64
                    console.warn('Firebase Storage upload failed, using base64 fallback:', storageError);

                    setUploadProgress(50);
                    // Convert image to base64
                    const reader = new FileReader();
                    const base64Promise = new Promise((resolve, reject) => {
                        reader.onload = () => resolve(reader.result);
                        reader.onerror = reject;
                        reader.readAsDataURL(imageFile);
                    });

                    newLogoUrl = await base64Promise;
                    setLogoUrl(newLogoUrl);
                    setUploadProgress(100);
                    console.log('Logo stored as base64 (CORS workaround)');
                    setFeedback({
                        type: 'success',
                        message: 'Logo saved successfully! Note: To enable direct storage uploads, please configure CORS for Firebase Storage.'
                    });
                }
            } catch (error) {
                console.error("Logo save failed:", error);
                setFeedback({ type: 'error', message: `Logo save failed: ${error.message}` });
                setLoading(false);
                setUploadProgress(0);
                setImageFile(null);
                return;
            }
        }

        const settingsRef = doc(db, 'settings', auth.currentUser.uid);
        try {
            await setDoc(settingsRef, { 
                companyName, 
                companyAddress,
                companyPhone,
                companyVatNumber,
                logoUrl: newLogoUrl 
            }, { merge: true });
            setFeedback({ type: 'success', message: 'Settings saved successfully!' });
        } catch (error) {
            console.error("Error saving settings:", error);
            setFeedback({ type: 'error', message: 'Failed to save settings.' });
        } finally {
            setLoading(false);
            setImageFile(null);
            setUploadProgress(0);
        }
    };

    const handleUpdateProfile = async () => {
        if (!auth.currentUser) return;
        setLoading(true);
        setFeedback({ type: '', message: '' });

        try {
            await updateProfile(auth.currentUser, {
                displayName: userDisplayName
            });
            setFeedback({ type: 'success', message: 'Profile updated successfully!' });
        } catch (error) {
            console.error("Error updating profile:", error);
            setFeedback({ type: 'error', message: 'Failed to update profile.' });
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateEmail = async () => {
        if (!auth.currentUser) return;
        setLoading(true);
        setFeedback({ type: '', message: '' });

        try {
            await updateEmail(auth.currentUser, userEmail);
            setFeedback({ type: 'success', message: 'Email updated successfully!' });
        } catch (error) {
            console.error("Error updating email:", error);
            if (error.code === 'auth/requires-recent-login') {
                setFeedback({ type: 'error', message: 'Please re-authenticate to change email. Try logging out and back in.' });
            } else {
                setFeedback({ type: 'error', message: 'Failed to update email.' });
            }
        } finally {
            setLoading(false);
        }
    };

    const handleUpdatePassword = async () => {
        if (!auth.currentUser) return;
        setLoading(true);
        setFeedback({ type: '', message: '' });

        if (newPassword !== confirmPassword) {
            setFeedback({ type: 'error', message: 'New passwords do not match.' });
            setLoading(false);
            return;
        }

        if (newPassword.length < 6) {
            setFeedback({ type: 'error', message: 'Password must be at least 6 characters long.' });
            setLoading(false);
            return;
        }

        try {
            // Re-authenticate user before changing password
            const credential = EmailAuthProvider.credential(auth.currentUser.email, currentPassword);
            await reauthenticateWithCredential(auth.currentUser, credential);
            
            await updatePassword(auth.currentUser, newPassword);
            setFeedback({ type: 'success', message: 'Password updated successfully!' });
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
        } catch (error) {
            console.error("Error updating password:", error);
            if (error.code === 'auth/wrong-password') {
                setFeedback({ type: 'error', message: 'Current password is incorrect.' });
            } else if (error.code === 'auth/weak-password') {
                setFeedback({ type: 'error', message: 'Password is too weak.' });
            } else {
                setFeedback({ type: 'error', message: 'Failed to update password.' });
            }
        } finally {
            setLoading(false);
        }
    };

    if (loading && !companyName) { // Check !companyName to avoid flicker on save
        return <p>Loading settings...</p>;
    }

    return (
        <div className="max-w-4xl mx-auto">
            <h1 className="text-3xl font-bold text-gray-800 mb-6">Settings</h1>
            
            {/* Tab Navigation */}
            <div className="mb-6">
                <div className="border-b border-gray-200">
                    <nav className="-mb-px flex space-x-8">
                        <button
                            onClick={() => setActiveTab('company')}
                            className={`py-2 px-1 border-b-2 font-medium text-sm ${
                                activeTab === 'company'
                                    ? 'border-indigo-500 text-indigo-600'
                                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                            }`}
                        >
                            Company Settings
                        </button>
                        <button
                            onClick={() => setActiveTab('account')}
                            className={`py-2 px-1 border-b-2 font-medium text-sm ${
                                activeTab === 'account'
                                    ? 'border-indigo-500 text-indigo-600'
                                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                            }`}
                        >
                            Account Settings
                        </button>
                        <button
                            onClick={() => setActiveTab('advanced')}
                            className={`py-2 px-1 border-b-2 font-medium text-sm ${
                                activeTab === 'advanced'
                                    ? 'border-indigo-500 text-indigo-600'
                                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                            }`}
                        >
                            Advanced
                        </button>
                    </nav>
                </div>
            </div>

            <div className="bg-white p-8 rounded-lg shadow-lg">
                {activeTab === 'company' && (
                    <div className="space-y-6">
                        <div>
                        <label htmlFor="companyName" className="block text-sm font-medium text-gray-700">Company Name</label>
                        <input
                            type="text"
                            id="companyName"
                            value={companyName}
                            onChange={(e) => setCompanyName(e.target.value)}
                            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                        />
                    </div>
                    <div>
                        <label htmlFor="companyAddress" className="block text-sm font-medium text-gray-700">Company Address</label>
                        <input
                            type="text"
                            id="companyAddress"
                            value={companyAddress}
                            onChange={(e) => setCompanyAddress(e.target.value)}
                            placeholder="123 Business St, City, State 12345"
                            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                        />
                    </div>
                    <div>
                        <label htmlFor="companyPhone" className="block text-sm font-medium text-gray-700">Phone Number</label>
                        <input
                            type="text"
                            id="companyPhone"
                            value={companyPhone}
                            onChange={(e) => setCompanyPhone(e.target.value)}
                            placeholder="+1 (555) 123-4567"
                            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                        />
                    </div>
                    <div>
                        <label htmlFor="companyVatNumber" className="block text-sm font-medium text-gray-700">VAT Number</label>
                        <input
                            type="text"
                            id="companyVatNumber"
                            value={companyVatNumber}
                            onChange={(e) => setCompanyVatNumber(e.target.value)}
                            placeholder="123456789"
                            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Company Logo</label>
                        <div className="mt-2 flex items-center space-x-4">
                            {logoUrl && <img src={logoUrl} alt="Company Logo" className="h-16 w-16 rounded-full object-cover" />}
                            <div>
                                <input 
                                    type="file" 
                                    onChange={handleImageChange} 
                                    accept="image/png,image/jpeg,image/jpg,image/gif" 
                                    className="text-sm"
                                />
                                <p className="text-xs text-gray-500 mt-1">Max size: 5MB. Formats: PNG, JPG, GIF</p>
                            </div>
                        </div>
                        {uploadProgress > 0 && uploadProgress < 100 && (
                            <div className="w-full bg-gray-200 rounded-full h-2.5 mt-2">
                                <div className="bg-blue-600 h-2.5 rounded-full transition-all duration-300" style={{ width: `${uploadProgress}%` }}></div>
                            </div>
                        )}
                    </div>
                        <div>
                            <button
                                onClick={handleSave}
                                disabled={loading}
                                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg shadow-md disabled:bg-indigo-300"
                            >
                                {loading ? 'Saving...' : 'Save Company Settings'}
                            </button>
                        </div>
                    </div>
                )}

                {activeTab === 'account' && (
                    <div className="space-y-6">
                        {/* Profile Information */}
                        <div className="border-b border-gray-200 pb-6">
                            <h3 className="text-lg font-medium text-gray-900 mb-4">Profile Information</h3>
                            <div className="space-y-4">
                                <div>
                                    <label htmlFor="userDisplayName" className="block text-sm font-medium text-gray-700">Display Name</label>
                                    <input
                                        type="text"
                                        id="userDisplayName"
                                        value={userDisplayName}
                                        onChange={(e) => setUserDisplayName(e.target.value)}
                                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                                        placeholder="Enter your display name"
                                    />
                                </div>
                                <div>
                                    <button
                                        onClick={handleUpdateProfile}
                                        disabled={loading}
                                        className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 px-4 rounded-md disabled:bg-indigo-300"
                                    >
                                        {loading ? 'Updating...' : 'Update Profile'}
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Email Settings */}
                        <div className="border-b border-gray-200 pb-6">
                            <h3 className="text-lg font-medium text-gray-900 mb-4">Email Address</h3>
                            <div className="space-y-4">
                                <div>
                                    <label htmlFor="userEmail" className="block text-sm font-medium text-gray-700">Email</label>
                                    <input
                                        type="email"
                                        id="userEmail"
                                        value={userEmail}
                                        onChange={(e) => setUserEmail(e.target.value)}
                                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                                        placeholder="Enter your email address"
                                    />
                                </div>
                                <div>
                                    <button
                                        onClick={handleUpdateEmail}
                                        disabled={loading}
                                        className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 px-4 rounded-md disabled:bg-indigo-300"
                                    >
                                        {loading ? 'Updating...' : 'Update Email'}
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Password Settings */}
                        <div>
                            <h3 className="text-lg font-medium text-gray-900 mb-4">Change Password</h3>
                            <div className="space-y-4">
                                <div>
                                    <label htmlFor="currentPassword" className="block text-sm font-medium text-gray-700">Current Password</label>
                                    <input
                                        type="password"
                                        id="currentPassword"
                                        value={currentPassword}
                                        onChange={(e) => setCurrentPassword(e.target.value)}
                                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                                        placeholder="Enter current password"
                                    />
                                </div>
                                <div>
                                    <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700">New Password</label>
                                    <input
                                        type="password"
                                        id="newPassword"
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                                        placeholder="Enter new password"
                                    />
                                </div>
                                <div>
                                    <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">Confirm New Password</label>
                                    <input
                                        type="password"
                                        id="confirmPassword"
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                                        placeholder="Confirm new password"
                                    />
                                </div>
                                <div>
                                    <button
                                        onClick={handleUpdatePassword}
                                        disabled={loading}
                                        className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 px-4 rounded-md disabled:bg-indigo-300"
                                    >
                                        {loading ? 'Updating...' : 'Update Password'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'advanced' && (
                    <div className="space-y-6">
                        <div className="border-b border-gray-200 pb-6">
                            <h3 className="text-lg font-medium text-gray-900 mb-4">Payment Data Management</h3>
                            <p className="text-sm text-gray-600 mb-4">
                                Use this tool to fix payment data isolation issues. This ensures all your payments have the correct user ID and are properly associated with your account.
                            </p>
                            <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-4">
                                <div className="flex">
                                    <div className="flex-shrink-0">
                                        <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                                            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                        </svg>
                                    </div>
                                    <div className="ml-3">
                                        <p className="text-sm text-yellow-700">
                                            <strong>Important:</strong> Only run this if you're experiencing issues with payments not appearing, or if instructed by support. This operation is safe and can be run multiple times.
                                        </p>
                                    </div>
                                </div>
                            </div>
                            <button
                                onClick={async () => {
                                    if (!auth.currentUser) return;
                                    setLoading(true);
                                    setFeedback({ type: '', message: '' });
                                    try {
                                        const result = await repairMigratedPayments(auth.currentUser.uid);
                                        if (result.success) {
                                            setFeedback({
                                                type: 'success',
                                                message: `Repair completed successfully! Added userId to ${result.emergencyFixCount || 0} payments. Fixed ${result.repairedCount} payment details. Corrected settlement status on ${result.fixedSettlement} payments.`
                                            });
                                        } else {
                                            setFeedback({ type: 'error', message: `Repair failed: ${result.error}` });
                                        }
                                    } catch (error) {
                                        console.error('Repair error:', error);
                                        setFeedback({ type: 'error', message: 'Repair failed. Please try again.' });
                                    } finally {
                                        setLoading(false);
                                    }
                                }}
                                disabled={loading}
                                className="bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-4 rounded-md disabled:bg-red-300"
                            >
                                {loading ? 'Repairing...' : 'Fix Payment Data'}
                            </button>
                            <p className="text-xs text-gray-500 mt-2">
                                This will scan all payments and ensure they're properly associated with your user account.
                            </p>
                        </div>

                        <div className="border-b border-gray-200 pb-6">
                            <h3 className="text-lg font-medium text-gray-900 mb-4">Database Information</h3>
                            <div className="space-y-2 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-gray-600">User ID:</span>
                                    <span className="font-mono text-gray-900">{auth.currentUser?.uid}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-600">Account Email:</span>
                                    <span className="text-gray-900">{auth.currentUser?.email}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {feedback.message && (
                    <div className={`mt-6 p-3 rounded-md text-sm ${feedback.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                        {feedback.message}
                    </div>
                )}
            </div>
        </div>
    );
};

export default SettingsPage;
