import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, setLogLevel } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

// --- IMPORTANT: Firebase Configuration ---
// The code now automatically uses the environment's Firebase configuration.
// If you run this code outside of this environment, you MUST replace
// the placeholder values below with your own Firebase project's configuration.
const firebaseConfig = typeof __firebase_config !== 'undefined'
  ? JSON.parse(__firebase_config)
  : {
      apiKey: "AIzaSyCqBJKP95b_Mflu0Npg6YUbkQ3W-dXNrfc",
      authDomain: "voltventures-ec8c4.firebaseapp.com",
      projectId: "voltventures-ec8c4",
      storageBucket: "voltventures-ec8c4.firebasestorage.app",
      messagingSenderId: "326689103951",
      appId: "1:326689103951:web:0acd6ce51513b17f2e4a3a"
    };

// --- Initialize Firebase ---
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
setLogLevel('debug'); // Optional: for detailed console logs

export { auth, db, storage };
