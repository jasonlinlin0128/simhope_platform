"use client";

import { useState, useEffect } from "react";
import { auth } from "@/lib/firebase";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
} from "firebase/auth";
import { loginWithPasskey, passkeySupported } from "@/lib/passkey";
import { useAuth } from "@/context/AuthContext";

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.997 8.997 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
      />
    </svg>
  );
}

/**
 * 登入 / 開發者註冊 modal。
 * @param {{ onClose: () => void, initialTab?: 'login'|'register' }} props
 */
export default function LoginModal({ onClose, initialTab = "login" }) {
  const { user, profile, isAdmin, isDeveloper } = useAuth();
  const [tab, setTab] = useState(initialTab);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPasskey, setShowPasskey] = useState(false);
  const [applied, setApplied] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    setShowPasskey(passkeySupported());
  }, []);

  const mapAuthErr = (err) =>
    ({
      "auth/invalid-credential": "帳號或密碼錯誤，請確認後再試。",
      "auth/user-not-found": "查無此帳號，請聯絡系統管理員。",
      "auth/wrong-password": "帳號或密碼錯誤，請確認後再試。",
      "auth/too-many-requests": "登入失敗次數過多，請稍後再試。",
      "auth/popup-closed-by-user": "登入視窗被關閉，請再試一次。",
      "auth/popup-blocked": "瀏覽器擋住了登入視窗，請允許彈出視窗後再試。",
      "auth/cancelled-popup-request": "請稍候，前一個登入視窗還在處理。",
      "auth/account-exists-with-different-credential":
        "這個 email 已用其他方式註冊，請改用原本的登入方式。",
      "auth/email-already-in-use": "此 email 已註冊，請改用「登入」分頁。",
      "auth/weak-password": "密碼至少 6 碼。",
      "auth/invalid-email": "email 格式不正確。",
    })[err.code] || "操作失敗，請稍後再試。";

  // 登入 tab：成功即關閉
  const handlePasskeyLogin = async () => {
    setError("");
    setLoading(true);
    try {
      await loginWithPasskey();
      onClose();
    } catch (err) {
      setError(
        err?.name === "NotAllowedError"
          ? "已取消，或這台裝置沒有註冊過 Face ID / 指紋。"
          : err?.message || "passkey 登入失敗。",
      );
    } finally {
      setLoading(false);
    }
  };
  const handlePasswordLogin = async (e) => {
    e.preventDefault();
    if (!email || !password) return;
    setError("");
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      onClose();
    } catch (err) {
      setError(mapAuthErr(err));
    } finally {
      setLoading(false);
    }
  };
  // Google：登入 tab 成功即關；註冊 tab 成功則「不關」，留在頁面填理由
  const handleGoogle = async (closeOnSuccess) => {
    setError("");
    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      await signInWithPopup(auth, provider);
      if (closeOnSuccess) onClose();
    } catch (err) {
      setError(mapAuthErr(err));
    } finally {
      setLoading(false);
    }
  };
  const handlePasskeyForRegister = async () => {
    setError("");
    setLoading(true);
    try {
      await loginWithPasskey(); /* 不關，留下填理由 */
    } catch (err) {
      setError(
        err?.name === "NotAllowedError"
          ? "已取消或此裝置無 passkey。"
          : err?.message || "passkey 失敗。",
      );
    } finally {
      setLoading(false);
    }
  };
  const handleEmailSignup = async () => {
    if (!email || !password) return setError("請填寫 email 與密碼");
    if (password.length < 6) return setError("密碼至少 6 碼");
    if (password !== confirmPassword) return setError("兩次密碼不一致");
    setError("");
    setLoading(true);
    try {
      await createUserWithEmailAndPassword(auth, email, password);
      // 不關 modal：登入後 user 狀態更新 → 註冊 tab 自動進「填理由」步驟
    } catch (err) {
      setError(mapAuthErr(err));
    } finally {
      setLoading(false);
    }
  };

  const submitApplication = async () => {
    if (!reason.trim()) return setError("請填寫申請理由");
    if (!auth.currentUser) return setError("尚未登入，請重新整理後再試");
    setError("");
    setLoading(true);
    try {
      const token = await auth.currentUser.getIdToken();
      const res = await fetch("/api/request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ type: "access", reason: reason.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "送出失敗");
      setApplied(true);
    } catch (e) {
      setError(e.message || "送出失敗，請稍後再試");
    } finally {
      setLoading(false);
    }
  };

  const devStatus = profile?.devStatus;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-[var(--color-card-bg)] rounded-3xl shadow-2xl border border-[var(--color-card-border)] w-full max-w-sm mx-4 p-8 flex flex-col gap-5">
        {/* tab bar */}
        <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
          {[
            ["login", "登入"],
            ["register", "開發者註冊"],
          ].map(([k, lbl]) => (
            <button
              key={k}
              onClick={() => {
                setTab(k);
                setError("");
              }}
              className={`flex-1 py-2 rounded-lg text-sm font-extrabold transition ${tab === k ? "bg-[var(--color-card-bg)] text-[var(--color-clay-purple)] shadow-sm" : "text-[var(--color-text-mid)]"}`}
            >
              {lbl}
            </button>
          ))}
          <button
            onClick={onClose}
            className="w-8 text-gray-400 hover:text-gray-700 text-lg"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl px-4 py-2.5 text-sm font-bold text-red-600 dark:text-red-400">
            {error}
          </div>
        )}

        {tab === "login" ? (
          <>
            <button
              type="button"
              onClick={() => handleGoogle(true)}
              disabled={loading}
              className="w-full py-3 rounded-xl bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-600 text-[var(--color-text-dark)] font-extrabold text-sm shadow-sm hover:border-gray-300 transition-all disabled:opacity-60 flex items-center justify-center gap-2"
            >
              <GoogleIcon />用 Google 登入
            </button>
            {showPasskey && (
              <button
                type="button"
                onClick={handlePasskeyLogin}
                disabled={loading}
                className="w-full py-3 rounded-xl bg-[var(--color-clay-purple)]/10 border-2 border-[var(--color-clay-purple)]/30 text-[var(--color-clay-purple)] font-extrabold text-sm hover:bg-[var(--color-clay-purple)]/20 transition-all disabled:opacity-60"
              >
                🔐 用 Face ID / 指紋登入
              </button>
            )}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-[var(--color-card-border)]" />
              <span className="text-xs font-bold text-[var(--color-text-mid)]">
                或用帳號密碼
              </span>
              <div className="flex-1 h-px bg-[var(--color-card-border)]" />
            </div>
            <form
              onSubmit={handlePasswordLogin}
              className="flex flex-col gap-3"
            >
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@simhope.com.tw"
                className="w-full px-4 py-2.5 rounded-xl border border-[var(--color-card-border)] bg-[var(--color-card-bg)] text-[var(--color-text-dark)] font-semibold text-sm outline-none focus:border-[var(--color-clay-purple)]"
              />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-2.5 rounded-xl border border-[var(--color-card-border)] bg-[var(--color-card-bg)] text-[var(--color-text-dark)] font-semibold text-sm outline-none focus:border-[var(--color-clay-purple)]"
              />
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-xl bg-gradient-to-br from-[var(--color-clay-purple)] to-[var(--color-clay-blue)] text-white font-extrabold text-sm shadow-md hover:-translate-y-0.5 transition-all disabled:opacity-60"
              >
                {loading ? "登入中..." : "登入"}
              </button>
            </form>
            <p className="text-center text-xs text-[var(--color-text-mid)]">
              想上架工具？切到「開發者註冊」申請開發權限。
            </p>
          </>
        ) : (
          // ── 開發者註冊 tab ──
          <div className="flex flex-col gap-4">
            {isAdmin || isDeveloper ? (
              <p className="text-center text-sm font-bold text-[var(--color-text-dark)] py-6">
                你已經是開發者了 ✅<br />
                <span className="font-semibold text-[var(--color-text-mid)]">
                  可直接到「我的工具 / 管理後台」上架。
                </span>
              </p>
            ) : applied || devStatus === "pending" ? (
              <div className="text-center py-6">
                <p className="text-2xl mb-2">🕓</p>
                <p className="font-bold text-[var(--color-text-dark)]">
                  申請審核中
                </p>
                <p className="text-sm text-[var(--color-text-mid)] font-semibold mt-1">
                  已送出，請等管理員核准。核准後重新整理即可上架。
                </p>
              </div>
            ) : !user ? (
              <>
                <p className="text-sm text-[var(--color-text-mid)] font-semibold">
                  先用公司帳號登入，再填申請理由：
                </p>
                <button
                  type="button"
                  onClick={() => handleGoogle(false)}
                  disabled={loading}
                  className="w-full py-3 rounded-xl bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-600 text-[var(--color-text-dark)] font-extrabold text-sm shadow-sm hover:border-gray-300 disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  <GoogleIcon />用 Google 註冊
                </button>
                {showPasskey && (
                  <button
                    type="button"
                    onClick={handlePasskeyForRegister}
                    disabled={loading}
                    className="w-full py-3 rounded-xl bg-[var(--color-clay-purple)]/10 border-2 border-[var(--color-clay-purple)]/30 text-[var(--color-clay-purple)] font-extrabold text-sm disabled:opacity-60"
                  >
                    🔐 用 Face ID / 指紋
                  </button>
                )}
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-[var(--color-card-border)]" />
                  <span className="text-xs font-bold text-[var(--color-text-mid)]">
                    或用 email 註冊
                  </span>
                  <div className="flex-1 h-px bg-[var(--color-card-border)]" />
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@simhope.com.tw"
                  className="w-full px-4 py-2.5 rounded-xl border border-[var(--color-card-border)] bg-[var(--color-card-bg)] text-[var(--color-text-dark)] font-semibold text-sm outline-none focus:border-[var(--color-clay-purple)]"
                />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="密碼（至少 6 碼）"
                  className="w-full px-4 py-2.5 rounded-xl border border-[var(--color-card-border)] bg-[var(--color-card-bg)] text-[var(--color-text-dark)] font-semibold text-sm outline-none focus:border-[var(--color-clay-purple)]"
                />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="再次輸入密碼"
                  className="w-full px-4 py-2.5 rounded-xl border border-[var(--color-card-border)] bg-[var(--color-card-bg)] text-[var(--color-text-dark)] font-semibold text-sm outline-none focus:border-[var(--color-clay-purple)]"
                />
                <button
                  type="button"
                  onClick={handleEmailSignup}
                  disabled={loading}
                  className="w-full py-3 rounded-xl bg-gradient-to-br from-[var(--color-clay-purple)] to-[var(--color-clay-blue)] text-white font-extrabold text-sm shadow-md disabled:opacity-60"
                >
                  {loading ? "建立中..." : "建立帳號並繼續"}
                </button>
              </>
            ) : (
              <>
                <p className="text-sm text-[var(--color-text-mid)] font-semibold">
                  以 <strong>{user.email || profile?.displayName}</strong>{" "}
                  申請。
                </p>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="你想開發 / 上架什麼？（讓管理員了解你的用途）"
                  rows={4}
                  maxLength={1000}
                  className="w-full px-4 py-2.5 rounded-xl border border-[var(--color-card-border)] bg-[var(--color-card-bg)] text-[var(--color-text-dark)] font-semibold text-sm outline-none focus:border-[var(--color-clay-purple)]"
                />
                <button
                  type="button"
                  onClick={submitApplication}
                  disabled={loading}
                  className="w-full py-3 rounded-xl bg-gradient-to-br from-[var(--color-clay-purple)] to-[var(--color-clay-blue)] text-white font-extrabold text-sm shadow-md disabled:opacity-60"
                >
                  {loading ? "送出中..." : "📩 送出申請"}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
