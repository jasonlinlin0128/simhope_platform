"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import { auth } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { getUserProfile, ensureUserDoc } from "@/lib/db";

const AuthContext = createContext(null);

/**
 * 登入稽核：每個瀏覽器分頁 session 對同一 uid 只記一次。
 * onAuthStateChanged 每次頁面載入/token 更新都會觸發，不去重會把 audit_logs 灌成瀏覽紀錄。
 * fail-soft：記不成不影響登入（伺服器端才是稽核的權威來源）。
 */
async function logLoginOnce(user) {
  const key = `portal.loginLogged:${user.uid}`;
  try {
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
    const idToken = await user.getIdToken();
    await fetch("/api/auth/login-event", {
      method: "POST",
      headers: { Authorization: `Bearer ${idToken}` },
    });
  } catch {
    /* 稽核失敗不阻斷登入 */
  }
}

/** Subscribes to Firebase Auth state and fetches the Firestore user profile on sign-in. */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        // 首次登入（含 Google）若無 users 文件 → 自動建無 role 的 viewer
        await ensureUserDoc(currentUser);
        const userProfile = await getUserProfile(currentUser.uid);
        setProfile(userProfile);
        logLoginOnce(currentUser);
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // 重抓目前使用者的 profile（如清除未讀後即時更新 Navbar 紅點）。
  const refreshProfile = useCallback(async () => {
    const current = auth.currentUser;
    if (!current) return;
    const userProfile = await getUserProfile(current.uid);
    setProfile(userProfile);
  }, []);

  const isAdmin = profile?.role === "admin";
  const isDeveloper = profile?.role === "developer";

  return (
    <AuthContext.Provider
      value={{ user, profile, isAdmin, isDeveloper, loading, refreshProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
}

/**
 * @returns {{ user: import('firebase/auth').User|null, profile: object|null, isAdmin: boolean, isDeveloper: boolean, loading: boolean, refreshProfile: () => Promise<void> }}
 */
export function useAuth() {
  return useContext(AuthContext);
}
