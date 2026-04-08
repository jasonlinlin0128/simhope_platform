'use client';

import { useState } from 'react';
import { auth } from '@/lib/firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';

export default function LoginModal({ onClose }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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
