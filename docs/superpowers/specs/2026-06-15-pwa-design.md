# PWA（可安裝 + 離線殼）

- 日期：2026-06-15
- 狀態：設計定案（待 writing-plans）
- 主題：把平台變成可安裝到手機主畫面的 PWA，含品牌圖示與最小離線殼。Phase 3 首項。

## 背景與問題

內部工具常在手機/現場使用。PWA 讓同仁「加入主畫面」得到 app 般體驗（standalone、品牌 icon），離線打開也有品牌離線頁而非瀏覽器錯誤頁。基於 Next 16 官方 PWA 指南（`node_modules/next/dist/docs/01-app/02-guides/progressive-web-apps.md`）。

## 決策（brainstorm 定案）

| 維度      | 決定                                                       | 理由                                                          |
| --------- | ---------------------------------------------------------- | ------------------------------------------------------------- |
| 範圍      | **可安裝 + 離線殼**                                        | 現代瀏覽器可安裝不需 SW；離線殼需最小 SW                      |
| 離線程度  | **只快取 app 殼 + 離線 fallback 頁；不快取動態資料**       | Firebase 動態資料離線會 stale/誤導                            |
| 圖示      | **next/og 動態生成品牌 HubMark（零新依賴、零字型 fetch）** | 比照 `opengraph-image.js`；icon 無文字 → 無 Google Font flake |
| SW        | **手寫最小 `public/sw.js`（零依賴）**                      | 避免 next-pwa 對 Next 16/Turbopack 相容風險                   |
| Push 通知 | **範圍外**                                                 | YAGNI                                                         |

## 目標 / 非目標

**目標**

- 手機可「加入主畫面」、standalone 開啟、品牌 app icon。
- 離線開啟導覽 → 顯示品牌離線頁（非瀏覽器預設錯誤頁）。
- 零新付費 API、零新 npm 依賴、零 rules/資料/SA。

**非目標（之後）**

- push 通知、完整離線資料快取、背景同步。

## 架構與元件

```
瀏覽器讀 <link rel="manifest">（Next 由 app/manifest.js 自動注入）
  → manifest 宣告 name/standalone/theme/icons（指向 next/og 動態 icon）
ServiceWorkerRegister（client，layout 內）→ production 時註冊 /sw.js
  → sw.js：install precache /offline；fetch navigation network-first，失敗 → /offline
```

1. **`app/manifest.js`（新）** — 回 Manifest 物件：`name:"SimHope AI 工具中心"`、`short_name:"SimHope"`、`description`、`start_url:"/"`、`display:"standalone"`、`background_color:"#ffffff"`、`theme_color:"#6366f1"`、`icons:[{src:"/icons/192",sizes:"192x192",type:"image/png",purpose:"any maskable"},{src:"/icons/512",sizes:"512x512",...}]`。
2. **`app/icons/[size]/route.js`（新）** — GET，用 `next/og` `ImageResponse` 在純色底上置中渲染品牌 HubMark（SVG data-URI，沿用 `opengraph-image.js` 的 `MARK_SVG`）。`size` 解析為整數、白名單 `{192,512}`（其餘 → 512）；mark 約佔 70%（maskable 安全區）。**無字型 fetch**。
3. **`app/apple-icon.js`（新）** — Next 慣例，`ImageResponse` 180×180 品牌 icon（iOS 主畫面；Next 自動加 `apple-touch-icon`）。
4. **`app/offline/page.jsx`（新）** — 品牌「你目前離線」靜態頁（`<div>`，root layout 已有 `<main>`）。
5. **`public/sw.js`（新，需建 `public/`）** — 最小 SW：`install` 時 `cache.addAll(["/offline"])` + `skipWaiting`；`activate` 清舊 cache + `clients.claim`；`fetch` 僅處理 `request.mode === "navigate"`：network-first，catch → `caches.match("/offline")`。非導覽請求放行。
6. **`src/components/ServiceWorkerRegister.jsx`（新，client）** — `useEffect` 中 `if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js")`；無 UI（回 null）。
7. **`app/layout.js`（改）** — body 內加 `<ServiceWorkerRegister/>`（manifest 由 app/manifest.js 自動 link；themeColor 已在 viewport export）。

## 誠實 / 範圍

- 離線殼＝app 殼 + 離線 fallback 頁；**不**快取動態資料（避免 stale）。
- SW 只在 production 註冊（dev 不裝，避免快取干擾開發）。
- 無 push、無背景同步。

## 💰 成本 / 基礎設施

- 零新付費 API、**零新 npm 依賴**（next/og 已用）。全前端，無 rules/資料/SA/index。→ merge 即部署。

## 測試（誠實說明）

- 本功能＝manifest config + 瀏覽器 service worker + JSX/ImageResponse，**無可抽出的純函式邏輯 → 無 unit test**（同 a11y / error-boundary 性質）。
- 驗證：`npm run lint` + `npm run build`（manifest / icon routes / apple-icon / offline 編譯過、出現在 route 清單）。
- 部署後人工驗：①Lighthouse PWA / Chrome「安裝」可用 ②手機加入主畫面 → standalone + 品牌 icon ③裝好後關網路開啟 → 品牌離線頁 ④`/icons/192`、`/icons/512`、`/apple-icon` 回正常 PNG。

## Rollout

1. merge → Vercel 部署（HTTPS，PWA 條件滿足）。
2. 部署後人工驗如上。SW 更新：sw.js 改版後靠 `skipWaiting`+`clients.claim` 讓新版即時接管。

## 風險 / 緩解

- **SW 快取造成「看到舊頁」** → 只快取 `/offline`（不快取一般頁/資料），navigation 一律 network-first；幾乎無 stale 風險。
- **next/og icon 在 build 期失敗** → icon 是動態 route（request 時生成、非 build 靜態），且無字型 fetch → 無 OG 那種字型 flake。
- **dev 環境 SW 干擾** → 只在 production 註冊。
