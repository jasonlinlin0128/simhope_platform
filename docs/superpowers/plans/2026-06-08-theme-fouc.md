# ThemeProvider 防閃（FOUC）+ 清 set-state-in-effect — 實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 消除深色模式整頁 FOUC、移除最後一個 set-state-in-effect lint error（lint 4→3、0 error）。

**Architecture:** Design B（全乾淨）：layout 加 pre-paint inline script 設 `dark` class；ThemeProvider 變無 state/effect（toggle 純 DOM）；ThemeContext 去 isDark；Navbar 2 圖示改 `dark:` CSS variant 驅動。

**Tech Stack:** Next.js 16 App Router + React 19 + Tailwind v4 class-based dark。

**設計來源：** [spec](../specs/2026-06-08-theme-fouc-design.md)。

**驗證慣例：** `npm run lint` 4→3（0 error）；commit Conventional + 結尾 `Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>`。

---

## Task 1: layout.js 加 pre-paint inline script

**Files:** Modify `app/layout.js`

- [ ] **Step 1: `<body>` 開頭、`<ThemeProvider>` 前插入 script**

old：

```jsx
      <body
        className={`${nunito.variable} ${notoSansTC.variable} antialiased bg-[var(--color-bg)] text-[var(--color-text-dark)] min-h-screen flex flex-col`}
      >
        <ThemeProvider>
```

new：

```jsx
      <body
        className={`${nunito.variable} ${notoSansTC.variable} antialiased bg-[var(--color-bg)] text-[var(--color-text-dark)] min-h-screen flex flex-col`}
      >
        {/* Pre-paint：hydration 前依偏好設好 dark class，避免深色模式閃白 (FOUC) */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark');}}catch(e){}})();`,
          }}
        />
        <ThemeProvider>
```

---

## Task 2: ThemeProvider 改無 state/effect

**Files:** Modify `src/components/ThemeProvider.jsx`

- [ ] **Step 1: 整檔取代**

```jsx
"use client";

import { ThemeContext } from "@/context/ThemeContext";

export default function ThemeProvider({ children }) {
  // 主題 class 由 layout 的 pre-paint inline script 在 hydration 前設好；
  // 這裡只負責「切換」：讀目前 class → flip → 寫回 + 存 localStorage。
  const toggle = () => {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  };

  return (
    <ThemeContext.Provider value={{ toggle }}>{children}</ThemeContext.Provider>
  );
}
```

---

## Task 3: ThemeContext default 拔 isDark

**Files:** Modify `src/context/ThemeContext.js`

- [ ] **Step 1: 整檔取代**

```jsx
import { createContext, useContext } from "react";

export const ThemeContext = createContext({ toggle: () => {} });
export const useTheme = () => useContext(ThemeContext);
```

---

## Task 4: Navbar 圖示改 CSS 驅動

**Files:** Modify `src/components/Navbar.jsx`

- [ ] **Step 1: L19 destructure 去 isDark**

old：

```jsx
const { isDark, toggle } = useTheme();
```

new：

```jsx
const { toggle } = useTheme();
```

- [ ] **Step 2: 桌面切換鈕圖示（約 L99）**

old：

```jsx
{
  isDark ? "☀️" : "🌙";
}
```

new：

```jsx
            <span className="hidden dark:inline">☀️</span>
            <span className="dark:hidden">🌙</span>
```

- [ ] **Step 3: 手機選單切換鈕（約 L190）**

old：

```jsx
{
  isDark ? "☀️ 淺色" : "🌙 深色";
}
```

new：

```jsx
            <span className="hidden dark:inline">☀️ 淺色</span>
            <span className="dark:hidden">🌙 深色</span>
```

- [ ] **Step 4: lint**

Run: `npm run lint`
Expected: **3 problems (0 errors, 3 warnings)** — ThemeProvider 的 set-state-in-effect error 消失；Navbar 無殘留 `isDark`（無 unused-var）。

- [ ] **Step 5: commit**

```bash
git add app/layout.js src/components/ThemeProvider.jsx src/context/ThemeContext.js src/components/Navbar.jsx
git commit -m "fix(theme): 防深色模式 FOUC + 清 set-state-in-effect error (audit #21)

layout 加 pre-paint inline script，hydration 前依 localStorage/系統偏好
設 dark class→整頁不再閃白。ThemeProvider 改無 state/effect（toggle 純 DOM）
→移除最後一個 set-state-in-effect error（lint 4→3、0 error）。isDark 只驅動
Navbar 2 圖示→改 dark: CSS variant（首屏正確、零 hydration mismatch）。

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

## Task 5: build + MCP 驗證（不 commit）

**Files:** 無（驗證）

- [ ] **Step 1: build** → `npm run build` 綠。

- [ ] **Step 2: 起 dev server** → 背景 `npm run dev`，等 `Ready`（:3000；port 占用先 `taskkill //PID <pid> //F`）。

- [ ] **Step 3: MCP playwright（公開頁）**

1. navigate `/` → `browser_evaluate` 設 `localStorage.setItem('theme','dark')` → navigate `/`（reload）→ `browser_evaluate` 回 `document.documentElement.className` 應含 `dark`（inline script 生效）；`browser_console_messages` 無 hydration error。
2. 點 toggle 鈕（`button[aria-label="切換深色模式"]`）→ evaluate `<html>` 無 `dark`、頁面淺色、圖示 🌙。
3. 再點 → 回深色、圖示 ☀️。
4. evaluate 設 `localStorage.setItem('theme','light')` → reload → 首屏淺色、`<html>` 無 dark。

- [ ] **Step 4: 停 dev server** → `taskkill //PID <pid> //F`。

---

## 完成後

- 推 `feature-theme-fouc` → 開 PR（base main；body：FOUC 前後、lint 4→3、MCP 驗證結果）。
- 獨立 reviewer subagent → CI/Vercel 綠 → 等 Jason merge。

---

## Self-Review（plan vs spec）

- **Spec coverage**：§4.1 layout script→T1；§4.2 ThemeProvider→T2；§4.3 ThemeContext→T3；§4.4 Navbar→T4；§6 測試→T4S4 lint + T5 build/MCP。✓
- **Placeholder scan**：完整 old/new 碼、exact 指令；無 TBD。✓
- **一致性**：localStorage key `'theme'`、值 `'dark'`/`'light'` 在 inline script(T1) 與 toggle(T2) 一致；ThemeContext `{ toggle }`(T3) ↔ Navbar `const { toggle }`(T4S1) 一致；圖示 span class 對稱（`hidden dark:inline` / `dark:hidden`）。✓
