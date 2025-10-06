import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { updateProfile, updateEmail, updatePassword, reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth';
import { auth, db, storage } from '../firebase/config';

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
                // Create a unique filename to avoid conflicts
                const timestamp = Date.now();
                const fileName = `${timestamp}_${imageFile.name}`;
                const storageRef = ref(storage, `logos/${auth.currentUser.uid}/${fileName}`);
                
                // Upload the file
                setUploadProgress(50);
                const snapshot = await uploadBytes(storageRef, imageFile);
                
                // Get the download URL
                setUploadProgress(75);
                newLogoUrl = await getDownloadURL(snapshot.ref);
                setLogoUrl(newLogoUrl);
                setUploadProgress(100);
            } catch (error) {
                console.error("Upload failed:", error);
                setFeedback({ type: 'error', message: `Logo upload failed: ${error.message}` });
                setLoading(false);
                setUploadProgress(0);
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
