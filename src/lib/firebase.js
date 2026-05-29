import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyDFknAmnkhg1BMq3lczOndvVLuiWCrnZjU",
  authDomain: "simhope-platform.firebaseapp.com",
  projectId: "simhope-platform",
  storageBucket: "simhope-platform.firebasestorage.app",
  messagingSenderId: "612744138082",
  appId: "1:612744138082:web:f2c3315e39b4e4c2cc303b",
  measurementId: "G-J9B1DTP883",
};

// getApps() guard prevents double-init during SSR hot reload
const app =
  getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

// Singleton instances — safe to import on both server and client
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
