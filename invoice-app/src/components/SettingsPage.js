import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { auth, db, storage } from '../firebase/config';

const SettingsPage = () => {
    const [companyName, setCompanyName] = useState('');
    const [address, setAddress] = useState('');
    const [phone, setPhone] = useState('');
    const [vatNumber, setVatNumber] = useState('');
    const [logoUrl, setLogoUrl] = useState('');
    const [imageFile, setImageFile] = useState(null);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [loading, setLoading] = useState(true);
    const [feedback, setFeedback] = useState({ type: '', message: '' });
    const [features, setFeatures] = useState({
        showLaborAndManDays: true,
    });

    useEffect(() => {
        const fetchSettings = async () => {
            if (!auth.currentUser) return;
            const settingsRef = doc(db, 'settings', auth.currentUser.uid);
            try {
                const docSnap = await getDoc(settingsRef);
                if (docSnap.exists()) {
                    const settings = docSnap.data();
                    setCompanyName(settings.companyName || '');
                    setAddress(settings.address || '');
                    setPhone(settings.phone || '');
                    setVatNumber(settings.vatNumber || '');
                    setLogoUrl(settings.logoUrl || '');
                    if (settings.features) {
                        setFeatures(settings.features);
                    }
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

    const handleFeatureToggle = (feature) => {
        setFeatures(prev => ({ ...prev, [feature]: !prev[feature] }));
    };

    const handleSave = async () => {
        if (!auth.currentUser) return;
        setLoading(true);
        setFeedback({ type: '', message: '' });

        let newLogoUrl = logoUrl;

        if (imageFile) {
            const storageRef = ref(storage, `logos/${auth.currentUser.uid}/${imageFile.name}`);
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
                            try {
                                newLogoUrl = await getDownloadURL(uploadTask.snapshot.ref);
                                setLogoUrl(newLogoUrl);
                                resolve();
                            } catch (urlError) {
                                console.error("Could not get download URL", urlError);
                                reject(urlError);
                            }
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
            const settingsToSave = {
                companyName,
                address,
                phone,
                vatNumber,
                logoUrl: newLogoUrl,
                features,
            };
            await setDoc(settingsRef, settingsToSave, { merge: true });
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

    if (loading && !companyName) {
        return <p>Loading settings...</p>;
    }

    return (
        <div className="max-w-4xl mx-auto">
            <h1 className="text-3xl font-bold text-gray-800 mb-6">Settings</h1>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="md:col-span-2 bg-white p-8 rounded-lg shadow-lg">
                    <div className="space-y-6">
                        <h2 className="text-xl font-semibold text-gray-800 border-b pb-2">Business Details</h2>
                        <div>
                            <label htmlFor="companyName" className="block text-sm font-medium text-gray-700">Company Name</label>
                            <input type="text" id="companyName" value={companyName} onChange={(e) => setCompanyName(e.target.value)} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500" />
                        </div>
                        <div>
                            <label htmlFor="address" className="block text-sm font-medium text-gray-700">Address</label>
                            <input type="text" id="address" value={address} onChange={(e) => setAddress(e.target.value)} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500" />
                        </div>
                        <div>
                            <label htmlFor="phone" className="block text-sm font-medium text-gray-700">Phone</label>
                            <input type="text" id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500" />
                        </div>
                        <div>
                            <label htmlFor="vatNumber" className="block text-sm font-medium text-gray-700">VAT Number</label>
                            <input type="text" id="vatNumber" value={vatNumber} onChange={(e) => setVatNumber(e.target.value)} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500" />
                        </div>

                        <h2 className="text-xl font-semibold text-gray-800 border-b pb-2 pt-4">Company Logo</h2>
                        <div>
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
                    </div>
                </div>

                <div className="bg-white p-8 rounded-lg shadow-lg">
                    <h2 className="text-xl font-semibold text-gray-800 border-b pb-2">Features</h2>
                    <div className="space-y-4 mt-4">
                        <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-gray-700">Show Labor/Man-days on Invoice</span>
                            <button
                                onClick={() => handleFeatureToggle('showLaborAndManDays')}
                                className={`relative inline-flex items-center h-6 rounded-full w-11 transition-colors ${features.showLaborAndManDays ? 'bg-indigo-600' : 'bg-gray-200'}`}
                            >
                                <span className={`inline-block w-4 h-4 transform bg-white rounded-full transition-transform ${features.showLaborAndManDays ? 'translate-x-6' : 'translate-x-1'}`}/>
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div className="mt-8">
                <button
                    onClick={handleSave}
                    disabled={loading}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-6 rounded-lg shadow-md disabled:bg-indigo-300"
                >
                    {loading ? 'Saving...' : 'Save All Settings'}
                </button>
            </div>
            {feedback.message && (
                <div className={`mt-4 p-3 rounded-md text-sm ${feedback.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    {feedback.message}
                </div>
            )}
        </div>
    );
};

export default SettingsPage;
