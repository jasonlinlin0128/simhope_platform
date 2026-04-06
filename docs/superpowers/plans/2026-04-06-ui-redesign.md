# UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the Next.js frontend to match the original `landing-page/index.html` visual quality — logo badge navbar, GSAP blob background, hero with stats, and scenarios-based tool filtering with full dark mode.

**Architecture:** ThemeProvider manages dark mode via `.dark` class on `<html>`, BlobBackground provides fixed GSAP-animated blobs, Navbar gets logo badge + nav links + dark mode toggle, and `page.jsx` gets a new Hero + stats cards + scenarios filter sidebar replacing the folder filter.

**Tech Stack:** Next.js 16.2.2 (App Router), React, Tailwind CSS v4, GSAP (npm), Firebase/Firestore

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `src/app/globals.css` | Add Tailwind v4 class-based dark variant + blobFloat keyframe |
| Create | `src/components/ThemeProvider.jsx` | Dark mode toggle, localStorage persistence, context |
| Create | `src/components/BlobBackground.jsx` | Fixed GSAP blob animations + mouse tracking |
| Modify | `src/app/layout.js` | Mount ThemeProvider + BlobBackground |
| Modify | `src/components/Navbar.jsx` | Logo badge, nav links, dark mode toggle button |
| Modify | `src/app/page.jsx` | Hero + stats cards + scenarios filter |

---

## Task 1: Install GSAP and enable class-based dark mode

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: Install gsap**

```bash
cd "C:/Users/user/Desktop/01_AI導入專案/20260225_SimHope_工具箱"
npm install gsap
```

Expected output: `added 1 package` (or similar, no errors)

- [ ] **Step 2: Add Tailwind v4 class-based dark variant and blobFloat keyframe to globals.css**

Open `src/app/globals.css`. Add these two blocks **at the top**, immediately after `@import "tailwindcss";`:

```css
/* Enable class-based dark mode for Tailwind v4 */
@custom-variant dark (&:where(.dark, .dark *));

/* Blob float fallback keyframe */
@keyframes blobFloat {
  0%, 100% { transform: translateY(0px); }
  50% { transform: translateY(-20px); }
}
```

The file should now begin:
```css
@import "tailwindcss";

/* Enable class-based dark mode for Tailwind v4 */
@custom-variant dark (&:where(.dark, .dark *));

/* Blob float fallback keyframe */
@keyframes blobFloat {
  0%, 100% { transform: translateY(0px); }
  50% { transform: translateY(-20px); }
}

@theme inline {
  ...
```

- [ ] **Step 3: Verify dev server still starts**

```bash
npm run dev
```

Expected: server starts on port 3000 with no CSS errors in terminal.

- [ ] **Step 4: Commit**

```bash
git add src/app/globals.css package.json package-lock.json
git commit -m "feat: install gsap, enable class-based dark mode variant"
```

---

## Task 2: Create ThemeProvider

**Files:**
- Create: `src/components/ThemeProvider.jsx`
- Create: `src/context/ThemeContext.js`

- [ ] **Step 1: Create ThemeContext**

Create `src/context/ThemeContext.js`:

```js
import { createContext, useContext } from 'react';

export const ThemeContext = createContext({ isDark: false, toggle: () => {} });
export const useTheme = () => useContext(ThemeContext);
```

- [ ] **Step 2: Create ThemeProvider component**

Create `src/components/ThemeProvider.jsx`:

```jsx
'use client';

import { useState, useEffect } from 'react';
import { ThemeContext } from '@/context/ThemeContext';

export default function ThemeProvider({ children }) {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    // Read saved preference; fall back to system preference
    const saved = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const shouldBeDark = saved === 'dark' || (!saved && prefersDark);
    setIsDark(shouldBeDark);
    document.documentElement.classList.toggle('dark', shouldBeDark);
  }, []);

  const toggle = () => {
    setIsDark(prev => {
      const next = !prev;
      document.documentElement.classList.toggle('dark', next);
      localStorage.setItem('theme', next ? 'dark' : 'light');
      return next;
    });
  };

  return (
    <ThemeContext.Provider value={{ isDark, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}
```

- [ ] **Step 3: Mount ThemeProvider in layout.js**

Open `src/app/layout.js`. Add the import at the top:

```js
import ThemeProvider from "@/components/ThemeProvider";
```

Wrap the existing content so ThemeProvider is the outermost wrapper **inside `<body>`**. The final `RootLayout` should be:

```jsx
export default function RootLayout({ children }) {
  return (
    <html lang="zh-TW" className="scroll-smooth">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased bg-[var(--color-bg)] text-[var(--color-text-dark)] min-h-screen flex flex-col`}>
        <ThemeProvider>
          <AuthProvider>
            <Navbar />
            <main className="flex-1 w-full max-w-7xl mx-auto py-8">
              {children}
            </main>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 4: Verify in browser**

Open `http://localhost:3000`. Open DevTools → Console. Run:

```js
document.documentElement.classList.add('dark')
```

The page background should shift to dark gray (`#111827`). Then run:

```js
document.documentElement.classList.remove('dark')
```

Background returns to `#FFF8F0`. No console errors.

- [ ] **Step 5: Commit**

```bash
git add src/context/ThemeContext.js src/components/ThemeProvider.jsx src/app/layout.js
git commit -m "feat: add ThemeProvider with localStorage dark mode persistence"
```

---

## Task 3: Create BlobBackground

**Files:**
- Create: `src/components/BlobBackground.jsx`

- [ ] **Step 1: Create BlobBackground component**

Create `src/components/BlobBackground.jsx`:

```jsx
'use client';

import { useEffect, useRef } from 'react';

const BLOBS = [
  { id: 'b1', color: '#a78bfa', size: 280, top: '-80px', left: '-60px',  blur: 80, opacity: 0.3, duration: 12, strength: 0.04 },
  { id: 'b2', color: '#60a5fa', size: 220, top: '10%',   right: '-40px', blur: 70, opacity: 0.25, duration: 9,  strength: 0.06 },
  { id: 'b3', color: '#ffd166', size: 160, top: '40%',   left: '20%',    blur: 60, opacity: 0.2,  duration: 15, strength: 0.03 },
  { id: 'b4', color: '#f472b6', size: 200, bottom: '5%', left: '-30px',  blur: 65, opacity: 0.25, duration: 11, strength: 0.05 },
  { id: 'b5', color: '#34d399', size: 180, bottom: '10%',right: '10%',   blur: 55, opacity: 0.2,  duration: 13, strength: 0.07 },
  { id: 'b6', color: '#a78bfa', size: 130, top: '60%',   left: '55%',    blur: 50, opacity: 0.18, duration: 10, strength: 0.08 },
  { id: 'b7', color: '#60a5fa', size: 240, top: '25%',   left: '-80px',  blur: 75, opacity: 0.22, duration: 14, strength: 0.02 },
];

export default function BlobBackground() {
  const blobRefs = useRef([]);
  const mousePos = useRef({ x: 0, y: 0 });

  useEffect(() => {
    let gsap;
    let ctx;

    async function init() {
      const gsapModule = await import('gsap');
      gsap = gsapModule.gsap || gsapModule.default;
      ctx = gsap.context(() => {});

      // Float animations
      blobRefs.current.forEach((el, i) => {
        if (!el) return;
        const blob = BLOBS[i];
        gsap.to(el, {
          y: -24,
          duration: blob.duration,
          repeat: -1,
          yoyo: true,
          ease: 'sine.inOut',
          delay: i * 0.8,
        });
      });

      // Mouse tracking
      const handleMouseMove = (e) => {
        mousePos.current = { x: e.clientX, y: e.clientY };
        blobRefs.current.forEach((el, i) => {
          if (!el) return;
          const blob = BLOBS[i];
          gsap.to(el, {
            x: (e.clientX - window.innerWidth / 2) * blob.strength,
            y: (e.clientY - window.innerHeight / 2) * blob.strength,
            duration: 1.5,
            ease: 'power1.out',
            overwrite: 'auto',
          });
        });
      };
      window.addEventListener('mousemove', handleMouseMove);

      // Dark mode opacity observer
      const observer = new MutationObserver(() => {
        const isDark = document.documentElement.classList.contains('dark');
        blobRefs.current.forEach((el) => {
          if (!el) return;
          gsap.to(el, { opacity: isDark ? 0.12 : parseFloat(el.dataset.opacity), duration: 0.5 });
        });
      });
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        observer.disconnect();
      };
    }

    const cleanup = init();
    return () => {
      cleanup.then(fn => fn && fn());
      ctx && ctx.revert();
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      style={{ position: 'fixed', inset: 0, zIndex: -1, pointerEvents: 'none', overflow: 'hidden' }}
    >
      {BLOBS.map((blob, i) => {
        const style = {
          position: 'absolute',
          width: blob.size,
          height: blob.size,
          borderRadius: '50%',
          background: blob.color,
          filter: `blur(${blob.blur}px)`,
          opacity: blob.opacity,
          ...(blob.top    !== undefined && { top:    blob.top    }),
          ...(blob.bottom !== undefined && { bottom: blob.bottom }),
          ...(blob.left   !== undefined && { left:   blob.left   }),
          ...(blob.right  !== undefined && { right:  blob.right  }),
        };
        return (
          <div
            key={blob.id}
            ref={el => blobRefs.current[i] = el}
            data-opacity={blob.opacity}
            style={style}
          />
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Mount BlobBackground in layout.js**

Open `src/app/layout.js`. Add the import:

```js
import BlobBackground from "@/components/BlobBackground";
```

Place `<BlobBackground />` as the **first child** of `<ThemeProvider>`, before `<AuthProvider>`:

```jsx
<ThemeProvider>
  <BlobBackground />
  <AuthProvider>
    <Navbar />
    <main className="flex-1 w-full max-w-7xl mx-auto py-8">
      {children}
    </main>
  </AuthProvider>
</ThemeProvider>
```

- [ ] **Step 3: Verify in browser**

Open `http://localhost:3000`. You should see soft colored blobs floating gently in the background. Moving the mouse should cause the blobs to slowly drift toward the cursor. No console errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/BlobBackground.jsx src/app/layout.js
git commit -m "feat: add GSAP BlobBackground with mouse tracking and dark mode opacity"
```

---

## Task 4: Update Navbar

**Files:**
- Modify: `src/components/Navbar.jsx`

- [ ] **Step 1: Rewrite Navbar.jsx**

Replace the entire contents of `src/components/Navbar.jsx` with:

```jsx
'use client';

import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { auth } from '@/lib/firebase';
import { signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import { useTheme } from '@/context/ThemeContext';

export default function Navbar() {
  const { user, isAdmin, loading } = useAuth();
  const { isDark, toggle } = useTheme();

  const handleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error('Login failed:', error);
      alert('登入失敗，請稍後再試');
    }
  };

  return (
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
        <Link href="/#tools" className="hidden md:inline hover:text-violet-500 transition-colors">工具總覽</Link>
        <Link href="/#about" className="hidden md:inline hover:text-violet-500 transition-colors">關於這個平台</Link>
        <Link href="/#feedback" className="hidden md:inline hover:text-violet-500 transition-colors">同仁回饋</Link>

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
            onClick={handleLogin}
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
  );
}
```

- [ ] **Step 2: Verify in browser**

Open `http://localhost:3000`. Check:
1. Logo shows 🏭 badge + "SimHope AI 工具中心" in dark navy text
2. Nav links visible: 工具總覽, 關於這個平台, 同仁回饋, 找工具 →
3. 🌙 button visible. Click it — page switches to dark mode, button changes to ☀️
4. Click again — returns to light mode
5. Refresh page — dark mode preference is remembered
6. Login/logout buttons still work

- [ ] **Step 3: Commit**

```bash
git add src/components/Navbar.jsx
git commit -m "feat: redesign Navbar with logo badge, nav links, and dark mode toggle"
```

---

## Task 5: Redesign page.jsx — Hero + Stats + Scenarios Filter

**Files:**
- Modify: `src/app/page.jsx`

- [ ] **Step 1: Replace page.jsx**

Replace the entire contents of `src/app/page.jsx` with:

```jsx
'use client';

import { useState, useEffect, useMemo } from 'react';
import { getApprovedTools } from '@/lib/db';
import ToolCard from '@/components/ToolCard';
import Link from 'next/link';

export default function Home() {
  const [tools, setTools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedScenarios, setSelectedScenarios] = useState([]);

  useEffect(() => {
    getApprovedTools()
      .then(data => setTools(data))
      .catch(err => console.error('Failed to load tools:', err))
      .finally(() => setLoading(false));
  }, []);

  // Aggregate all unique scenario tags from tools
  const allScenarios = useMemo(() => {
    const set = new Set();
    tools.forEach(t => {
      if (Array.isArray(t.scenarios)) t.scenarios.forEach(s => set.add(s));
    });
    return Array.from(set).sort();
  }, [tools]);

  // Filtering: empty selection or '全部' selected → show all
  const filteredTools = useMemo(() => {
    if (selectedScenarios.length === 0 || selectedScenarios.includes('全部')) return tools;
    return tools.filter(t => t.scenarios?.some(s => selectedScenarios.includes(s)));
  }, [tools, selectedScenarios]);

  const toggleScenario = (scenario) => {
    if (scenario === '全部') {
      setSelectedScenarios([]);
      return;
    }
    setSelectedScenarios(prev =>
      prev.includes(scenario) ? prev.filter(s => s !== scenario) : [...prev, scenario]
    );
  };

  const isAllSelected = selectedScenarios.length === 0;

  return (
    <div className="flex flex-col gap-16 px-4 md:px-0">

      {/* ── HERO ── */}
      <section className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-purple-50 via-blue-50 to-orange-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 px-8 py-14 md:px-16 md:py-20">
        <div className="relative z-10 max-w-2xl">
          <div className="inline-block bg-gradient-to-r from-violet-400 to-blue-400 text-white text-xs font-bold px-4 py-1.5 rounded-full mb-5 shadow-sm">
            ✨ SimHope AI 工具中心
          </div>
          <h1 className="text-4xl md:text-5xl font-black text-[#1e1b4b] dark:text-gray-100 leading-tight mb-4">
            讓每一位同仁<br />
            都有{' '}
            <span className="bg-gradient-to-r from-violet-400 to-blue-400 bg-clip-text text-transparent">
              AI 助力
            </span>
          </h1>
          <p className="text-gray-500 dark:text-gray-400 text-base md:text-lg leading-relaxed mb-8 font-medium">
            精選實用 AI 工具，幫助 SimHope 同仁在日常工作中提升效率、節省時間。
          </p>
          <div className="flex gap-3 flex-wrap">
            <Link
              href="#tools"
              className="px-7 py-3 rounded-full bg-[#1e1b4b] dark:bg-gray-100 text-white dark:text-[#1e1b4b] font-extrabold text-sm hover:-translate-y-0.5 hover:shadow-lg transition-all"
            >
              🔍 探索工具
            </Link>
            <Link
              href="#about"
              className="px-7 py-3 rounded-full border-2 border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-extrabold text-sm hover:-translate-y-0.5 hover:shadow-md transition-all"
            >
              了解更多
            </Link>
          </div>
        </div>
      </section>

      {/* ── STATS ── */}
      <section className="grid grid-cols-3 gap-4 md:gap-6">
        <div className="rounded-2xl bg-gradient-to-br from-violet-400 to-indigo-500 p-6 text-white text-center shadow-md">
          <div className="text-3xl md:text-4xl font-black mb-1">
            {loading ? '…' : tools.length}
          </div>
          <div className="text-xs md:text-sm font-semibold opacity-90">🛠️ 精選 AI 工具</div>
        </div>
        <div className="rounded-2xl bg-gradient-to-br from-blue-400 to-emerald-400 p-6 text-white text-center shadow-md">
          <div className="text-3xl md:text-4xl font-black mb-1">30+</div>
          <div className="text-xs md:text-sm font-semibold opacity-90">👥 使用中同仁</div>
        </div>
        <div className="rounded-2xl bg-gradient-to-br from-orange-400 to-pink-400 p-6 text-white text-center shadow-md">
          <div className="text-3xl md:text-4xl font-black mb-1">10h</div>
          <div className="text-xs md:text-sm font-semibold opacity-90">⏱️ 每週平均節省</div>
        </div>
      </section>

      {/* ── TOOLS SECTION ── */}
      <section id="tools" className="scroll-mt-24 mb-20">
        <div className="mb-8">
          <div className="inline-block px-3 py-1 rounded bg-blue-100/60 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 font-bold text-sm mb-3">
            🧰 工具總覽
          </div>
          <h2 className="text-3xl md:text-4xl font-black text-[#1e1b4b] dark:text-gray-100 mb-2">
            所有現成解決方案
          </h2>
          <p className="text-gray-500 dark:text-gray-400 font-medium">
            每個工具都標示了適用場景與使用步驟，三步以內就能上手。
          </p>
        </div>

        <div className="flex flex-col lg:flex-row gap-8">
          {/* Sidebar */}
          <aside className="lg:w-56 flex-shrink-0">
            <div className="sticky top-24 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl p-4">
              <h3 className="text-xs font-extrabold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">
                適用場景
              </h3>
              <div className="flex flex-col gap-2 text-sm text-gray-600 dark:text-gray-300">
                {/* All */}
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isAllSelected}
                    onChange={() => toggleScenario('全部')}
                    className="accent-violet-500"
                  />
                  <span className="font-semibold">全部</span>
                  <span className="ml-auto text-xs text-gray-400">{tools.length}</span>
                </label>

                {allScenarios.map(scenario => (
                  <label key={scenario} className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedScenarios.includes(scenario)}
                      onChange={() => toggleScenario(scenario)}
                      className="accent-violet-500"
                    />
                    <span>{scenario}</span>
                    <span className="ml-auto text-xs text-gray-400">
                      {tools.filter(t => t.scenarios?.includes(scenario)).length}
                    </span>
                  </label>
                ))}
              </div>
              {selectedScenarios.length > 0 && (
                <button
                  onClick={() => setSelectedScenarios([])}
                  className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 w-full text-left text-xs text-violet-500 font-bold hover:text-violet-700 transition-colors"
                >
                  清除篩選
                </button>
              )}
            </div>
          </aside>

          {/* Tool grid */}
          <div className="flex-1">
            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 opacity-60">
                {[1, 2, 3, 4, 5, 6].map(i => (
                  <div key={i} className="bg-white dark:bg-gray-800 rounded-3xl p-5 h-[200px] border border-gray-200 dark:border-gray-700 animate-pulse">
                    <div className="w-14 h-14 bg-gray-200 dark:bg-gray-700 rounded-2xl mb-4" />
                    <div className="w-3/4 h-5 bg-gray-200 dark:bg-gray-700 rounded-lg mb-2" />
                    <div className="w-1/2 h-5 bg-gray-200 dark:bg-gray-700 rounded-lg" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {filteredTools.map(t => <ToolCard key={t.id} tool={t} />)}
                {filteredTools.length === 0 && (
                  <div className="col-span-full py-20 text-center text-gray-500 dark:text-gray-400 font-bold bg-white dark:bg-gray-800 rounded-3xl border border-dashed border-gray-300 dark:border-gray-600">
                    這個場景下目前沒有任何工具 🙌
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Verify in browser**

Open `http://localhost:3000`. Check:
1. Hero section visible with gradient background, "AI 助力" in gradient text
2. Three stat cards visible (tool count dynamic, 30+, 10h)
3. Sidebar shows "適用場景" with checkboxes — "全部" checked by default
4. Selecting a scenario checkbox filters the tool grid
5. "清除篩選" button appears when scenarios selected, clears filter when clicked
6. Dark mode toggle works — hero background, cards, and sidebar all switch correctly
7. No console errors

- [ ] **Step 3: Commit**

```bash
git add src/app/page.jsx
git commit -m "feat: redesign homepage with hero, stats cards, and scenarios filter"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|-----------------|------|
| Install GSAP npm | Task 1 |
| Tailwind v4 `dark:` class mode | Task 1 |
| ThemeProvider with localStorage | Task 2 |
| BlobBackground 7 blobs + GSAP float | Task 3 |
| BlobBackground mouse tracking | Task 3 |
| BlobBackground dark mode opacity | Task 3 |
| BlobBackground mounted in layout | Task 3 |
| ThemeProvider mounted in layout | Task 2 |
| Navbar logo badge 🏭 | Task 4 |
| Navbar dark navy logo text | Task 4 |
| Navbar nav links (3 links + 找工具) | Task 4 |
| Navbar dark mode toggle button | Task 4 |
| Navbar logged-in / logged-out states | Task 4 |
| Hero section with gradient background | Task 5 |
| Hero "AI 助力" gradient clip text | Task 5 |
| Hero CTA buttons | Task 5 |
| Stats cards (3 cards, dynamic count) | Task 5 |
| Scenarios filter sidebar | Task 5 |
| Multi-select filtering logic | Task 5 |
| Dark mode on all elements | Tasks 4, 5 |
| Dashboard/Admin untouched | Not applicable — layout change is additive |

**Placeholder scan:** None found — all code blocks are complete.

**Type consistency:** `useTheme()` defined in Task 2 (`ThemeContext.js`), imported correctly in Task 4 (`Navbar.jsx`). `toggle` and `isDark` used consistently. `getApprovedTools()` already exists in `src/lib/db.js`.
