import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
    apiKey: "AIzaSyDFknAmnkhg1BMq3lczOndvVLuiWCrnZjU",
    authDomain: "simhope-platform.firebaseapp.com",
    projectId: "simhope-platform",
    storageBucket: "simhope-platform.firebasestorage.app",
    messagingSenderId: "612744138082",
    appId: "1:612744138082:web:f2c3315e39b4e4c2cc303b",
    measurementId: "G-J9B1DTP883"
};

// Initialize Firebase securely to avoid SSR double instantiation issues
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

export const auth = getAuth(app);
export const db = getFirestore(app);
