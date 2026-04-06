# UI Redesign Design Spec
**Date:** 2026-04-06  
**Status:** Approved  
**Scope:** Next.js app (`src/`) — all pages

---

## Overview

Redesign the Next.js frontend to match the visual quality of the original `landing-page/index.html`. The implementation uses Tailwind-native classes with minimal custom CSS, GSAP via npm for animations, and full dark mode support via localStorage.

---

## Architecture

### New files

| File | Purpose |
|------|---------|
| `src/components/BlobBackground.jsx` | Fixed-position GSAP blob animations, mounted in layout |
| `src/components/ThemeProvider.jsx` | Dark mode manager — reads/writes localStorage, applies `.dark` to `<html>` |

### Modified files

| File | Changes |
|------|---------|
| `src/app/layout.js` | Mount `BlobBackground` and `ThemeProvider`; keep existing structure |
| `src/components/Navbar.jsx` | Logo badge, nav links, dark mode toggle button |
| `src/app/page.jsx` | Hero section, stats cards, scenarios filter replacing folder filter |
| `src/app/globals.css` | Minimal additions: blob keyframes, dark mode color tokens |

### New npm package

```
gsap
```

---

## Components

### BlobBackground

- 7 blobs, `position: fixed`, `z-index: -1`, pointer-events: none
- Colors: `#a78bfa` (purple), `#60a5fa` (blue), `#ffd166` (yellow), `#f472b6` (pink), `#34d399` (green)
- Each blob: different size (100–280px), position, blur radius
- GSAP animation per blob: vertical float (9–15s cycle, yoyo repeat), `ease: "sine.inOut"`
- Mouse tracking: `mousemove` listener → smooth lerp (each blob has a different `strength` 0.02–0.08), updated via `gsap.to` with `duration: 1.5`
- Dark mode: opacity halved when `<html>` has `.dark` class (observe via MutationObserver)
- Cleanup: `gsap.context` returned from `useEffect`, cleaned up on unmount

### ThemeProvider

- On mount: read `localStorage.getItem('theme')`, apply `.dark` class to `document.documentElement` if `'dark'`
- Also check `prefers-color-scheme` as fallback when no localStorage value
- Exposes a toggle function via React context (`ThemeContext`)
- No visible UI — purely logic; toggle button lives in Navbar

### Navbar

**Layout:** `flex justify-between items-center`, sticky top-0, `backdrop-blur-md`

**Background:**
- Light: `bg-orange-50/85` (matches `rgba(255,248,240,0.85)`)
- Dark: `dark:bg-gray-900/85`

**Logo (left):**
- Badge: 36×36px div, gradient `from-violet-400 to-blue-400`, rounded-xl, `🏭` emoji
- Text: "SimHope AI 工具中心", `font-black`, color `#1e1b4b` (dark navy), `dark:text-gray-100`

**Nav links (right, logged-in):**
- 工具總覽 → `/#tools`
- 關於這個平台 → `#about` anchor on homepage (no separate route needed)
- 同仁回饋 → `#feedback` anchor on homepage (URL can be updated later)
- "找工具 →" pill button: `bg-[#1e1b4b] text-white`, dark: `bg-gray-100 text-[#1e1b4b]`
- 🌙/☀️ toggle button: border circle, calls `ThemeContext.toggle()`
- "🛠️ 我的工具" gradient pill: `from-violet-400 to-blue-400`
- 登出 button: border, `text-red-500`

**Nav links (logged-out):**
- Same links but no "我的工具" / 登出; replace with "👨‍💻 開發者登入" border button

**Mobile:** not in scope for this iteration (existing mobile behavior preserved)

---

## Page: `src/app/page.jsx`

### Hero Section

```
[badge pill: ✨ SimHope AI 工具中心]
[H1: 讓每一位同仁都有 AI 助力]   ← "AI 助力" in gradient text
[subtitle paragraph]
[CTA buttons: 🔍 探索工具 | 了解更多]
```

- Gradient background: `from-purple-50 via-blue-50 to-orange-50`
- H1: `text-[#1e1b4b]`, bold 900, ~2.2rem
- "AI 助力": gradient clip text `from-violet-400 to-blue-400`
- Dark mode: background `dark:from-gray-900 dark:via-gray-800 dark:to-gray-900`, H1 `dark:text-gray-100`

### Stats Cards

Three cards in a 3-column grid:

| Card | Value | Label | Gradient |
|------|-------|-------|----------|
| Tools | Dynamic count from Firestore `getApprovedTools().length` | 🛠️ 精選 AI 工具 | violet→indigo |
| Users | 30+ | 👥 使用中同仁 | blue→emerald |
| Time | 10h | ⏱️ 每週平均節省 | orange→pink |

- Cards: `rounded-2xl`, white text, bold number (~2rem), small label below
- Static values (30+, 10h) are hardcoded strings; tool count is `approvedTools.length`

### Tool Listing

**Layout:** 2-column grid — left sidebar (220px) + right card grid

**Sidebar — 適用場景 filter:**
- Header: "適用場景" uppercase label
- Checkboxes: "全部" + dynamic scenario tags aggregated from all tools' `scenarios` array field
- Multi-select: selecting specific scenarios shows tools that match ANY selected scenario
- "全部" checkbox: when checked, overrides all others (shows everything)
- State: `selectedScenarios` array in component state
- Dark mode: sidebar `dark:bg-gray-800`, text `dark:text-gray-300`

**Tool cards (right grid, 2-3 columns):**
- Each card: border, `rounded-xl`, white bg (`dark:bg-gray-800`)
- Header row: emoji/icon badge (gradient bg) + tool name + status badge (NEW/BETA/LIVE)
- Status badge colors: NEW=green, BETA=yellow, LIVE=hidden or gray
- Scenario tag: small gray label below tool name
- Description: 2-line clamp, `text-gray-500`
- Click → navigate to `/tool/[id]`

**Filtering logic:**
```js
const filteredTools = selectedScenarios.length === 0 || selectedScenarios.includes('全部')
  ? approvedTools
  : approvedTools.filter(t =>
      t.scenarios?.some(s => selectedScenarios.includes(s))
    )
```

**Fallback:** tools without `scenarios` field always shown when "全部" selected; hidden when specific scenarios selected (unless they match)

---

## Dark Mode

- Mechanism: `.dark` class on `<html>` element
- Toggle: ThemeProvider context → Navbar toggle button
- Persistence: `localStorage` key `'theme'`, values `'dark'` | `'light'`
- Tailwind config: `darkMode: 'class'` (already set in `tailwind.config.js` or equivalent)
- BlobBackground: blob opacity 0.3 → 0.15 in dark mode (MutationObserver on `<html>`)

---

## globals.css additions

```css
/* Blob float animation (fallback for no-GSAP) */
@keyframes blobFloat {
  0%, 100% { transform: translateY(0px); }
  50% { transform: translateY(-20px); }
}
```

Only keyframes needed; all other dark mode tokens handled by Tailwind `dark:` variants.

---

## Constraints

- Dashboard and Admin pages: **functional logic untouched**. New Navbar and BlobBackground apply automatically via `layout.js`.
- No mobile/responsive overhaul in this iteration.
- No new Firestore fields introduced; `scenarios` field is read-only in this feature (tools already have it or it's added via admin).
- GSAP loaded via npm, not CDN. SSR-safe: `useEffect` only, no `window` access at module level.
