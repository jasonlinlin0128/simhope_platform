# ThemeProvider 防閃（FOUC）+ 清最後一個 lint error — 設計（audit #21）

> 日期：2026-06-08 ｜ 分支：`feature-theme-fouc`（從 main `cd3f43b`）
> 來源：`docs/optimization-audit-2026-06-07.md` #21（tool/[id] 那半已隨 #15/PR #30 清掉，本案收尾 ThemeProvider 半 + FOUC）

---

## 1. 背景 / 問題

`src/components/ThemeProvider.jsx`：

```jsx
const [isDark, setIsDark] = useState(false);      // 永遠先 light render
useEffect(() => {
  const shouldBeDark = ...localStorage / prefers-color-scheme...;
  setIsDark(shouldBeDark);                          // ← set-state-in-effect lint ERROR
  document.documentElement.classList.toggle("dark", shouldBeDark);
}, []);
```

- **FOUC**：SSR + 首次 client render 一律 light（`isDark=false`、`<html>` 無 `dark`），effect 跑完才翻深色 → 深色使用者每次載入**閃一下白**。
- **lint error**：`setIsDark` 在 effect 內 = `react-hooks/set-state-in-effect`，是目前基準 4 problems 裡**唯一的 error**（3 個 warning 為 2× no-img #34 + dashboard deps #38）。

`isDark` 的消費者（grep 全庫）：**只有** `Navbar.jsx` 兩處切換鈕圖示（L99 桌面 `{isDark ? "☀️" : "🌙"}`、L190 手機 `{isDark ? "☀️ 淺色" : "🌙 深色"}`）。`BlobBackground.jsx` 自己讀 `document.documentElement.classList.contains("dark")`（不經 context）。

## 2. 目標 / 非目標

**目標**：消除整頁 FOUC；移除 set-state-in-effect error（lint 4→3、**0 error**）；圖示首屏即正確、零 hydration mismatch。

**非目標**：不改色彩 token、不動 BlobBackground、不改 toggle 的使用者體驗（點了照常即時切換）。

## 3. 方案抉擇

- **A（最小）**：inline script 防 FOUC + ThemeProvider 改 lazy initializer（去 effect）。但 lazy init server=false / client=true → Navbar 圖示 hydration mismatch，需 `suppressHydrationWarning`，圖示仍會「server 值閃一下才修正」。
- **B（採用，全乾淨）**：`isDark` 只驅動 2 個圖示 → 改 **CSS（`dark:` variant）驅動** → ThemeProvider 變**無 state 無 effect**，圖示由 `<html>.dark` class 決定（server/client 一致、首屏即正確、零 mismatch）。

## 4. 架構（Design B，4 檔）

**4.1 `app/layout.js` — pre-paint inline script（防 FOUC）**
`<body>` 第一個子節點（在 `<ThemeProvider>` 前）加：

```jsx
<script
  dangerouslySetInnerHTML={{
    __html: `(function(){try{var t=localStorage.getItem('theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark');}}catch(e){}})();`,
  }}
/>
```

同步執行（阻塞解析）→ 在 body 內容首次 paint 前就把 `dark` 加到 `<html>` → `--color-bg` 等變數首屏即解析為深色值，**無閃白**。`try/catch` 防 localStorage 不可用時整頁壞。

**4.2 `src/components/ThemeProvider.jsx` — 無 state 無 effect**
整檔改：

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

無 `useState`/`useEffect` → **無 set-state-in-effect error**。ThemeProvider 無 state 故不自我 re-render，`value={{ toggle }}` 不會造成 consumer 反覆 re-render。

**4.3 `src/context/ThemeContext.js` — default 拔 isDark**

```jsx
import { createContext, useContext } from "react";

export const ThemeContext = createContext({ toggle: () => {} });
export const useTheme = () => useContext(ThemeContext);
```

**4.4 `src/components/Navbar.jsx` — 圖示改 CSS 驅動**

- L19：`const { isDark, toggle } = useTheme();` → `const { toggle } = useTheme();`
- L99（桌面）：`{isDark ? "☀️" : "🌙"}` →
  ```jsx
  <span className="hidden dark:inline">☀️</span>
  <span className="dark:hidden">🌙</span>
  ```
- L190（手機）：`{isDark ? "☀️ 淺色" : "🌙 深色"}` →
  ```jsx
  <span className="hidden dark:inline">☀️ 淺色</span>
  <span className="dark:hidden">🌙 深色</span>
  ```
  `span` 預設 inline；`dark:hidden`＝淺色顯示/深色隱藏，`hidden dark:inline`＝淺色隱藏/深色顯示。由 `<html>.dark` 決定，server/client 一致、首屏正確。

## 5. 資料流 / 切換行為

- **初次載入**：inline script 讀偏好 → 設 `<html>.dark` → 首屏即正確配色 + 正確圖示（CSS）。React 無關、無 effect、無 mismatch。
- **點 toggle**：`toggle()` flip `<html>.dark` + 寫 localStorage → CSS 圖示即時換、BlobBackground（自讀 class）即時換、全站 `dark:` 樣式即時換。無需 React state。

## 6. 測試 / 驗證

- `npm run build` 綠。
- `npm run lint`：**4→3 problems（0 error）**；確認 ThemeProvider 不再有 set-state-in-effect。
- **MCP playwright（公開頁）**：
  1. 設 `localStorage.theme='dark'` → reload `/` → 首個 snapshot `<html>` 已含 `dark`（inline script 生效，FOUC 防護）、無 hydration console error。
  2. 點 toggle → `<html>.dark` 消失、圖示變 🌙、頁面變淺色；再點 → 變回。
  3. 設 `localStorage.theme='light'` reload → 首屏淺色、圖示 🌙。
  4. 清除 localStorage + 模擬 `prefers-color-scheme: dark` → 首屏深色（系統偏好 fallback）。

## 7. 交付 / 風險

- 分支 `feature-theme-fouc`（從 main，不碰任何開 PR 的檔）→ PR → 獨立 reviewer → CI/Vercel 綠 → 等 Jason merge。
- 風險低：移除 state 後唯一行為承載點是 inline script（已 try/catch）+ CSS variant。SSR 安全（toggle 只在 onClick 跑、必為 client）。
- 要顧：(a) inline script 與 ThemeProvider 的 localStorage key/邏輯一致（都用 `'theme'`、`'dark'`/`'light'`）；(b) Navbar 不再殘留 `isDark`；(c) `dark:` variant 在本專案 Tailwind v4 class-based dark 已啟用（#23 已大量使用）。
- 無 rules/migration、可乾淨 `git revert`。

## 8. 完成定義（DoD）

- inline script 防 FOUC；ThemeProvider 無 state/effect；ThemeContext 去 isDark；Navbar 圖示 CSS 驅動、無殘留 isDark。
- build 綠、lint 3（0 error）、MCP 驗證（首屏深色無閃、toggle 雙向、無 hydration error）。
- 獨立 reviewer READY。
