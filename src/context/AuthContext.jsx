'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { getUserProfile } from '@/lib/db';

const AuthContext = createContext(null);

/** Subscribes to Firebase Auth state and fetches the Firestore user profile on sign-in. */
export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            setUser(currentUser);
            if (currentUser) {
                const userProfile = await getUserProfile(currentUser.uid);
                setProfile(userProfile);
            } else {
                setProfile(null);
            }
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const isAdmin = profile?.role === 'admin';
    const isDeveloper = profile?.role === 'developer';

    return (
        <AuthContext.Provider value={{ user, profile, isAdmin, isDeveloper, loading }}>
            {children}
        </AuthContext.Provider>
    );
}

/**
 * @returns {{ user: import('firebase/auth').User|null, profile: object|null, isAdmin: boolean, isDeveloper: boolean, loading: boolean }}
 */
export function useAuth() {
    return useContext(AuthContext);
}
