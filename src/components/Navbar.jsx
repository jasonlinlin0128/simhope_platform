'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { auth } from '@/lib/firebase';
import { signOut } from 'firebase/auth';
import { useTheme } from '@/context/ThemeContext';
import LoginModal from '@/components/LoginModal';

export default function Navbar() {
  const { user, isAdmin, loading } = useAuth();
  const { isDark, toggle } = useTheme();
  const [showLogin, setShowLogin] = useState(false);

  return (
    <>
    <nav className="sticky top-0 z-50 px-4 md:px-10 py-3 flex justify-between items-center bg-[var(--color-nav-bg)] border-b border-[var(--color-nav-border)] backdrop-blur-md transition-all duration-300">
      {/* Logo */}
      <Link href="/" className="flex items-center gap-2.5 no-underline">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-400 to-blue-400 flex items-center justify-center text-xl flex-shrink-0 shadow-sm">
          🏭
        </div>
        <span className="font-black text-[1.1rem] text-[#1e1b4b] dark:text-gray-100 leading-tight">
          SimHope AI 工具中心
        </span>
      </Link>

      {/* Right side */}
      <div className="flex items-center gap-4 md:gap-5 text-sm font-bold text-gray-600 dark:text-gray-300">
        {/* Nav links */}
        <Link href="/#tools" className="hidden md:inline hover:text-violet-500 dark:hover:text-violet-400 transition-colors">工具總覽</Link>
        <Link href="/#about" className="hidden md:inline hover:text-violet-500 dark:hover:text-violet-400 transition-colors">關於這個平台</Link>
        <Link href="/#feedback" className="hidden md:inline hover:text-violet-500 dark:hover:text-violet-400 transition-colors">同仁回饋</Link>

        {/* Find tool CTA */}
        <Link
          href="/#tools"
          className="hidden md:inline px-4 py-2 rounded-full bg-[#1e1b4b] text-white dark:bg-gray-100 dark:text-[#1e1b4b] font-extrabold text-[0.82rem] hover:opacity-90 transition-opacity"
        >
          找工具 →
        </Link>

        {/* Dark mode toggle */}
        <button
          onClick={toggle}
          aria-label="切換深色模式"
          className="w-9 h-9 rounded-full border border-gray-200 dark:border-gray-600 bg-transparent flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-base"
        >
          {isDark ? '☀️' : '🌙'}
        </button>

        {/* Auth section */}
        {!loading && !user && (
          <button
            onClick={() => setShowLogin(true)}
            className="px-4 py-2 rounded-full border-2 border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 font-bold text-[0.82rem] text-gray-600 dark:text-gray-300 hover:-translate-y-0.5 hover:shadow-md transition-all"
          >
            👨‍💻 開發者登入
          </button>
        )}

        {!loading && user && (
          <>
            <Link
              href={isAdmin ? '/admin' : '/dashboard'}
              className="px-4 py-2 rounded-full bg-gradient-to-br from-violet-400 to-blue-400 text-white font-bold text-[0.82rem] shadow-sm hover:-translate-y-0.5 hover:shadow-md transition-all"
            >
              🛠️ {isAdmin ? '管理後台' : '我的工具'}
            </Link>
            <button
              onClick={() => signOut(auth)}
              className="px-4 py-2 rounded-full border-2 border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 font-bold text-[0.82rem] text-red-500 hover:-translate-y-0.5 hover:shadow-md transition-all"
            >
              登出
            </button>
          </>
        )}
      </div>
    </nav>

    {showLogin && <LoginModal onClose={() => setShowLogin(false)} />}
    </>
  );
}
