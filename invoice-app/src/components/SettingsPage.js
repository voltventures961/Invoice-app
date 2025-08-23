import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { auth, db, storage } from '../firebase/config';

const SettingsPage = () => {
    const [businessDetails, setBusinessDetails] = useState({
        name: '',
        address: '',
        phone: '',
        email: '',
    });
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
                    setBusinessDetails({
                        name: settings.businessDetails?.name || '',
                        address: settings.businessDetails?.address || '',
                        phone: settings.businessDetails?.phone || '',
                        email: settings.businessDetails?.email || '',
                    });
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
            setImageFile(e.target.files[0]);
        }
    };

    const sanitizeFilename = (filename) => {
        return filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    };

    const handleSave = async () => {
        if (!auth.currentUser) return;
        setLoading(true);
        setFeedback({ type: '', message: '' });

        let newLogoUrl = logoUrl;

        if (imageFile) {
            const sanitizedFilename = sanitizeFilename(imageFile.name);
            const storageRef = ref(storage, `logos/${auth.currentUser.uid}/${sanitizedFilename}`);
            const uploadTask = uploadBytesResumable(storageRef, imageFile);

            try {
                await new Promise((resolve, reject) => {
                    uploadTask.on('state_changed',
                        (snapshot) => {
                            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                            setUploadProgress(progress);
                        },
                        (error) => {
                            console.error("Upload failed:", error);
                            reject(error);
                        },
                        async () => {
                            newLogoUrl = await getDownloadURL(uploadTask.snapshot.ref);
                            setLogoUrl(newLogoUrl);
                            resolve();
                        }
                    );
                });
            } catch (error) {
                setFeedback({ type: 'error', message: 'Logo upload failed. Please try again.' });
                setLoading(false);
                return;
            }
        }

        const settingsRef = doc(db, 'settings', auth.currentUser.uid);
        try {
            await setDoc(settingsRef, { businessDetails, logoUrl: newLogoUrl }, { merge: true });
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

    const handleDetailsChange = (e) => {
        const { name, value } = e.target;
        setBusinessDetails(prev => ({ ...prev, [name]: value }));
    };

    if (loading && !businessDetails.name) { // Check !businessDetails.name to avoid flicker on save
        return <p>Loading settings...</p>;
    }

    return (
        <div className="max-w-2xl mx-auto">
            <h1 className="text-3xl font-bold text-gray-800 mb-6">Settings</h1>
            <div className="bg-white p-8 rounded-lg shadow-lg">
                <div className="space-y-6">
                    <h2 className="text-xl font-semibold text-gray-700 border-b pb-2">Business Details</h2>
                    <div>
                        <label htmlFor="name" className="block text-sm font-medium text-gray-700">Company Name</label>
                        <input
                            type="text"
                            id="name"
                            name="name"
                            value={businessDetails.name}
                            onChange={handleDetailsChange}
                            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                        />
                    </div>
                    <div>
                        <label htmlFor="address" className="block text-sm font-medium text-gray-700">Address</label>
                        <textarea
                            id="address"
                            name="address"
                            value={businessDetails.address}
                            onChange={handleDetailsChange}
                            rows="3"
                            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                        />
                    </div>
                    <div>
                        <label htmlFor="phone" className="block text-sm font-medium text-gray-700">Phone Number</label>
                        <input
                            type="text"
                            id="phone"
                            name="phone"
                            value={businessDetails.phone}
                            onChange={handleDetailsChange}
                            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                        />
                    </div>
                    <div>
                        <label htmlFor="email" className="block text-sm font-medium text-gray-700">Email Address</label>
                        <input
                            type="email"
                            id="email"
                            name="email"
                            value={businessDetails.email}
                            onChange={handleDetailsChange}
                            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                        />
                    </div>
                    <div className="border-t pt-6">
                        <label className="block text-sm font-medium text-gray-700">Company Logo</label>
                        <div className="mt-2 flex items-center space-x-4">
                            {logoUrl && <img src={logoUrl} alt="Company Logo" className="h-16 w-16 rounded-full object-cover" />}
                            <input type="file" onChange={handleImageChange} accept="image/*" className="text-sm" />
                        </div>
                        {imageFile && uploadProgress > 0 && (
                            <div className="w-full bg-gray-200 rounded-full h-2.5 mt-2">
                                <div className="bg-blue-600 h-2.5 rounded-full" style={{ width: `${uploadProgress}%` }}></div>
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
