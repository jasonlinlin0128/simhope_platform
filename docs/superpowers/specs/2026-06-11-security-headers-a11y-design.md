# 安全 headers + a11y 快修 — 設計

> 日期：2026-06-11 ｜ branch：`feature-security-a11y`
> 來源：平台體檢 Top-5 最後一項（「安全 headers / CSP / a11y」）。

## 1. 問題

- 全站**無任何安全 response header**（next.config.mjs 無 `headers()`、無 middleware）→ 缺 HSTS / clickjacking / MIME-sniff / referrer 防護。
- **focus 可見度薄**：只有 3 個檔有 focus 樣式 → 鍵盤使用者大多看不到焦點落在哪（Tailwind preflight 移除了瀏覽器預設 outline）。

## 2. 目標 / 非目標

**目標**：① 全站套上一組安全 response headers（不破壞 Firebase 登入 / passkey / YouTube 嵌入）② a11y 快修最高價值的缺口（焦點可見、skip-link、補漏 aria-label）。

**非目標（Jason 決策 / YAGNI）**：

- ❌ **CSP**——內部工具站 ROI 低、強制 CSP 對 Firebase+Next+inline-script 站破站風險高。之後真要再單獨謹慎做（report-only→enforce）。
- ❌ 完整 axe 稽核 / contrast 大改——無具體 axe 發現不亂改（深色模式已於體檢 #23 校過）。
- ❌ 不改 UI 外觀 / 行為 / rules / 資料 / 後端。

## 3. 已確認決策（Jason）+ 已驗證

- 跳過 CSP；a11y 只做「快掃高價值項」；安全 headers + a11y 合**一個 PR**（皆低風險）。
- **驗證過的破站風險**：站內 2 個 `<iframe>` 都是 **YouTube 嵌入**（`youtube.com/embed`，需 autoplay/fullscreen/accelerometer 等、**不需 camera/mic**）→ 限制 camera/mic/geolocation 安全。passkey 用 `@simplewebauthn/browser`（`navigator.credentials`）→ Permissions-Policy **必須保留 `publickey-credentials-*`**。

## 4. 設計

### Part A — 安全 headers（`next.config.mjs` 的 `async headers()`，`source: "/(.*)"` 套全站）

| Header                      | 值                                                                                                                                    | 作用                                                       |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload`                                                                                        | 強制 HTTPS（2 年）                                         |
| `X-Content-Type-Options`    | `nosniff`                                                                                                                             | 擋 MIME sniffing                                           |
| `X-Frame-Options`           | `SAMEORIGIN`                                                                                                                          | 防別人 iframe 我方站（clickjacking）；不影響我方嵌 YouTube |
| `Referrer-Policy`           | `strict-origin-when-cross-origin`                                                                                                     | 跨站只送 origin                                            |
| `Permissions-Policy`        | `camera=(), microphone=(), geolocation=(), browsing-topics=(), publickey-credentials-get=(self), publickey-credentials-create=(self)` | 關不用的強功能；**明確保留 passkey**                       |

> 注意：Permissions-Policy **不**碰 autoplay/encrypted-media/fullscreen/accelerometer/gyroscope/clipboard-write/picture-in-picture（YouTube 嵌入要用）。

### Part B — a11y 快修

**B-1 全站 focus 可見環**（`app/globals.css`）：加一條 `:focus-visible` 規則，給所有可聚焦元素一致的焦點環（紫色 outline + offset）。一條規則 site-wide，不逐元件改。`:focus:not(:focus-visible)` 不顯示（避免滑鼠點擊也跳環）。

```css
:focus-visible {
  outline: 2px solid var(--color-clay-purple);
  outline-offset: 2px;
  border-radius: 4px;
}
```

**B-2 Skip-to-content 連結**（`app/layout.js`）：`<body>` 內第一個元素放 `<a href="#main">` 跳到主內容；平常 sr-only、focus 時才顯示。`<main>` 加 `id="main"`。

**B-3 補漏 aria-label**（targeted）：掃描顯示既有覆蓋已好（16 個 aria-label）。實作時最後一掃，補任何 icon-only / emoji-only 互動缺 label 者（例如 navbar logo 連結若無可辨識文字、殘留 `✕`）。**只補確實缺的，不無謂加。**

## 5. 影響檔案

| 檔案               | 動作                                            |
| ------------------ | ----------------------------------------------- |
| `next.config.mjs`  | **改**：加 `async headers()` 回 5 個安全 header |
| `app/globals.css`  | **改**：加 `:focus-visible` 焦點環規則          |
| `app/layout.js`    | **改**：skip-link + `<main id="main">`          |
| （視掃描）少數元件 | **改**：補缺的 aria-label（若有）               |

## 6. 測試 / 驗證

- **build / lint**：基準不變（headers 是 config、focus 是 CSS、skip-link 是靜態）。無純邏輯可單測。
- **本地 dev**：`curl -I localhost:3000/` 看 5 個 header 都在；鍵盤 Tab 全站看得到焦點環 + skip-link Tab 第一下出現。
- **部署後（Jason）**：`curl -I` 正式站 / securityheaders.com 評分；**實測 passkey 登入仍可用**（Permissions-Policy 沒擋 WebAuthn）；YouTube 嵌入仍能播。

## 7. Rollout

純 config + 前端 CSS/markup。**無 rules / 無資料遷移 / 無 SA 動作** → merge → Vercel 部署即生效（headers 由 Vercel/Next 套用）。reviewer READY 後開 PR。
