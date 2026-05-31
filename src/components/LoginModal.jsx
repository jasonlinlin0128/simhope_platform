'use client';

import { useState, useEffect } from 'react';
import { auth } from '@/lib/firebase';
import { signInWithEmailAndPassword, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { loginWithPasskey, passkeySupported } from '@/lib/passkey';

/**
 * Modal for developer email/password sign-in.
 * On success: calls `onClose()` and the Firebase session is established globally.
 * Error handling: maps Firebase auth error codes to Traditional Chinese messages.
 * @param {{ onClose: () => void }} props
 */
export default function LoginModal({ onClose }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPasskey, setShowPasskey] = useState(false);

  useEffect(() => {
    setShowPasskey(passkeySupported());
  }, []);

  const handlePasskeyLogin = async () => {
    setError('');
    setLoading(true);
    try {
      await loginWithPasskey();
      onClose();
    } catch (err) {
      const msg = err?.name === 'NotAllowedError'
        ? '已取消，或這台裝置沒有註冊過 Face ID / 指紋。'
        : (err?.message || 'passkey 登入失敗，請改用其他方式。');
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) return;
    setError('');
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      onClose();
    } catch (err) {
      const msg = {
        'auth/invalid-credential': '帳號或密碼錯誤，請確認後再試。',
        'auth/user-not-found': '查無此帳號，請聯絡系統管理員。',
        'auth/wrong-password': '帳號或密碼錯誤，請確認後再試。',
        'auth/too-many-requests': '登入失敗次數過多，請稍後再試。',
      }[err.code] || '登入失敗，請聯絡系統管理員。';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError('');
    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      // prompt: select_account 讓使用者每次都能挑帳號（避免被舊 session 綁死）
      provider.setCustomParameters({ prompt: 'select_account' });
      await signInWithPopup(auth, provider);
      // AuthContext 的 onAuthStateChanged 會自動 ensureUserDoc（首次登入建 viewer）
      onClose();
    } catch (err) {
      const msg = {
        'auth/popup-closed-by-user': '登入視窗被關閉，請再試一次。',
        'auth/cancelled-popup-request': '請稍候，前一個登入視窗還在處理。',
        'auth/popup-blocked': '瀏覽器擋住了登入視窗，請允許彈出視窗後再試。',
        'auth/account-exists-with-different-credential': '這個 email 已用其他方式註冊，請改用原本的登入方式。',
      }[err.code] || 'Google 登入失敗，請稍後再試。';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-[var(--color-card-bg)] rounded-3xl shadow-2xl border border-[var(--color-card-border)] w-full max-w-sm mx-4 p-8 flex flex-col gap-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-black text-[var(--color-text-dark)]">👨‍💻 開發者登入</h2>
            <p className="text-xs text-[var(--color-text-mid)] font-semibold mt-1">請使用系統管理員提供的帳號</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-lg leading-none"
          >
            ✕
          </button>
        </div>

        {/* Google 登入 */}
        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={loading}
          className="w-full py-3 rounded-xl bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-600 text-[var(--color-text-dark)] font-extrabold text-sm shadow-sm hover:shadow-md hover:border-gray-300 transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2.5"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
            <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" />
            <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" />
            <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.997 8.997 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" />
            <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" />
          </svg>
          用 Google 登入
        </button>

        {/* Passkey / Face ID 登入（瀏覽器支援才顯示）*/}
        {showPasskey && (
          <button
            type="button"
            onClick={handlePasskeyLogin}
            disabled={loading}
            className="w-full py-3 rounded-xl bg-[var(--color-clay-purple)]/10 border-2 border-[var(--color-clay-purple)]/30 text-[var(--color-clay-purple)] font-extrabold text-sm hover:bg-[var(--color-clay-purple)]/20 transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            🔐 用 Face ID / 指紋登入
          </button>
        )}

        {/* 分隔線 */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-[var(--color-card-border)]" />
          <span className="text-xs font-bold text-[var(--color-text-mid)]">或用帳號密碼</span>
          <div className="flex-1 h-px bg-[var(--color-card-border)]" />
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-extrabold text-[var(--color-text-mid)] uppercase tracking-wide">
              電子郵件
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="your@simhope.com.tw"
              required
              autoFocus
              className="w-full px-4 py-2.5 rounded-xl border border-[var(--color-card-border)] bg-[var(--color-card-bg)] text-[var(--color-text-dark)] font-semibold text-sm outline-none focus:border-[var(--color-clay-purple)] transition-colors placeholder:text-gray-400"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-extrabold text-[var(--color-text-mid)] uppercase tracking-wide">
              密碼
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="w-full px-4 py-2.5 rounded-xl border border-[var(--color-card-border)] bg-[var(--color-card-bg)] text-[var(--color-text-dark)] font-semibold text-sm outline-none focus:border-[var(--color-clay-purple)] transition-colors placeholder:text-gray-400"
            />
          </div>

          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl px-4 py-2.5 text-sm font-bold text-red-600 dark:text-red-400">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl bg-gradient-to-br from-[var(--color-clay-purple)] to-[var(--color-clay-blue)] text-white font-extrabold text-sm shadow-md hover:-translate-y-0.5 hover:shadow-lg transition-all disabled:opacity-60 disabled:translate-y-0 disabled:cursor-not-allowed"
          >
            {loading ? '登入中...' : '登入'}
          </button>
        </form>

        <p className="text-center text-xs text-[var(--color-text-mid)]">
          沒有帳號？請聯絡 IT 部門建立帳號。
        </p>
      </div>
    </div>
  );
}
