import { initializeApp, getApps } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { getFirestore, doc, setDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyDFknAmnkhg1BMq3lczOndvVLuiWCrnZjU",
  authDomain: "simhope-platform.firebaseapp.com",
  projectId: "simhope-platform",
  storageBucket: "simhope-platform.firebasestorage.app",
  messagingSenderId: "612744138082",
  appId: "1:612744138082:web:f2c3315e39b4e4c2cc303b",
};

const SECONDARY = 'secondary-admin';

/**
 * Creates a developer account without affecting the admin's current session.
 * Uses a secondary Firebase App instance so createUserWithEmailAndPassword
 * doesn't sign out the admin.
 */
export async function createDeveloperAccount({ email, password, displayName, createdByUid }) {
  const existing = getApps().find(a => a.name === SECONDARY);
  const secondaryApp = existing || initializeApp(firebaseConfig, SECONDARY);
  const secondaryAuth = getAuth(secondaryApp);
  const secondaryDb = getFirestore(secondaryApp);

  const { user } = await createUserWithEmailAndPassword(secondaryAuth, email, password);

  await setDoc(doc(secondaryDb, 'users', user.uid), {
    uid: user.uid,
    email,
    displayName: displayName || email.split('@')[0],
    role: 'developer',
    createdBy: createdByUid,
    createdAt: new Date().toISOString(),
  });

  await signOut(secondaryAuth);
  return user.uid;
}
