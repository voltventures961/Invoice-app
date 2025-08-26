import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth, db, storage } from '../firebase/config';

const SettingsPage = () => {
    const [companyName, setCompanyName] = useState('');
    const [logoUrl, setLogoUrl] = useState('');
    const [imageFile, setImageFile] = useState(null);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [loading, setLoading] = useState(true);
    const [feedback, setFeedback] = useState({ type: '', message: '' });

    useEffect(() => {
        const fetchSettings = async () => {
            if (!auth.currentUser) return;
            const settingsRef = doc(db, 'settings', auth.currentUser.uid);
            try {
                const docSnap = await getDoc(settingsRef);
                if (docSnap.exists()) {
                    const settings = docSnap.data();
                    setCompanyName(settings.companyName || '');
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
            await setDoc(settingsRef, { companyName, logoUrl: newLogoUrl }, { merge: true });
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

    if (loading && !companyName) { // Check !companyName to avoid flicker on save
        return <p>Loading settings...</p>;
    }

    return (
        <div className="max-w-2xl mx-auto">
            <h1 className="text-3xl font-bold text-gray-800 mb-6">Settings</h1>
            <div className="bg-white p-8 rounded-lg shadow-lg">
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
                            {loading ? 'Saving...' : 'Save Settings'}
                        </button>
                    </div>
                    {feedback.message && (
                        <div className={`p-3 rounded-md text-sm ${feedback.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                            {feedback.message}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default SettingsPage;
