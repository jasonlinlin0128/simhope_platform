# 安全 headers + a11y 快修 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 全站套上 5 個安全 response header（不破壞 passkey / YouTube）+ 修 a11y 最高價值缺口（鍵盤焦點可見、skip-to-content、補漏 aria-label）。

**Architecture:** headers 走 `next.config.mjs` 的 `async headers()`（套 `/(.*)`）；焦點環走 `app/globals.css` 一條 `:focus-visible`；skip-link 走 `app/layout.js`。皆低風險、無純邏輯，靠 build/lint + `curl -I` + markup 驗。

**Tech Stack:** Next.js 16（`headers()` config）/ Tailwind 4（globals.css）/ @simplewebauthn（passkey，Permissions-Policy 需保留）。

**慣例：** Conventional Commits，commit 結尾必加 `Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>`。

---

### Task 1: 安全 response headers（`next.config.mjs`）

**Files:**

- Modify: `next.config.mjs`（整檔改寫）

- [ ] **Step 1: 改寫 next.config.mjs**

把 `next.config.mjs` 整個替換為：

```js
const securityHeaders = [
  // 強制 HTTPS（2 年，含子網域，可進 preload list）
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  // 擋 MIME sniffing
  { key: "X-Content-Type-Options", value: "nosniff" },
  // 防別站 iframe 我方頁面（clickjacking）；不影響我方嵌 YouTube
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  // 跨站只送 origin
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // 關不用的強功能；明確保留 passkey（WebAuthn），不碰 YouTube 要的 autoplay/fullscreen 等
  {
    key: "Permissions-Policy",
    value:
      "camera=(), microphone=(), geolocation=(), browsing-topics=(), publickey-credentials-get=(self), publickey-credentials-create=(self)",
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
```

- [ ] **Step 2: 起 dev、curl 確認 5 個 header 都在**

Run:

```bash
npm run dev > .tmp-dev.log 2>&1 &
# 等 Ready 後：
curl -sI http://localhost:3000/ | grep -iE "strict-transport|x-content-type|x-frame|referrer-policy|permissions-policy"
```

Expected: 5 行都印出（含 `publickey-credentials-get=(self)` 在 Permissions-Policy 內）。

- [ ] **Step 3: Commit**

```bash
git add next.config.mjs
git commit -m "feat(security): 5 個安全 response header（next.config headers）

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

### Task 2: 全站鍵盤焦點環（`app/globals.css`）

**Files:**

- Modify: `app/globals.css`（檔尾新增一條規則）

只有 3 個檔有 focus 樣式 → Tailwind preflight 拿掉了預設 outline，鍵盤使用者看不到焦點。加一條 site-wide `:focus-visible`（只在鍵盤聚焦時顯示，滑鼠點擊不跳環）。不設 `border-radius`（避免改到元素本身形狀；現代瀏覽器 outline 會自動跟隨元素圓角）。

- [ ] **Step 1: 在 `app/globals.css` 檔尾加規則**

在 `app/globals.css` 最後面 append：

```css
/* a11y：全站鍵盤焦點環。:focus-visible 只在鍵盤導航時觸發，滑鼠點擊不顯示。 */
:focus-visible {
  outline: 2px solid var(--color-clay-purple);
  outline-offset: 2px;
}
```

- [ ] **Step 2: build 確認 CSS 編得過**

Run: `npm run build`
Expected: 成功（Tailwind 4 對 `@import` 後的普通 CSS 規則照收）。

- [ ] **Step 3: Commit**

```bash
git add app/globals.css
git commit -m "feat(a11y): 全站 :focus-visible 鍵盤焦點環

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

### Task 3: Skip-to-content 連結（`app/layout.js`）

**Files:**

- Modify: `app/layout.js`（body 內加 skip-link、`<main>` 加 id + tabIndex）

鍵盤使用者每次都要 Tab 過整條 nav 才到內容。加一個平常隱藏、focus 時才現身的 skip-link 跳到主內容。

- [ ] **Step 1: 在 `<body>` 內、theme `<script>` 之後加 skip-link**

在 `app/layout.js` 的 `<script ... />`（theme pre-paint）**之後**、`<ThemeProvider>` **之前**插入：

```jsx
{
  /* a11y: 跳到主內容（平常 sr-only，鍵盤 focus 時現身） */
}
<a
  href="#main"
  className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:px-4 focus:py-2 focus:rounded-lg focus:bg-[var(--color-clay-purple)] focus:text-white focus:font-extrabold focus:shadow-lg"
>
  跳到主內容
</a>;
```

- [ ] **Step 2: 給 `<main>` 加 `id="main"` + `tabIndex={-1}` + 抑制其焦點環**

把：

```jsx
<main className="flex-1 w-full max-w-7xl mx-auto py-8">{children}</main>
```

改成：

```jsx
<main
  id="main"
  tabIndex={-1}
  style={{ outline: "none" }}
  className="flex-1 w-full max-w-7xl mx-auto py-8"
>
  {children}
</main>
```

（`tabIndex={-1}` 讓 skip-link 能把焦點移進 main；inline `outline:none` 蓋掉全站焦點環，避免整塊 main 出現大框。）

- [ ] **Step 3: build + curl 確認 skip-link 與 main id 在初始 HTML**

Run:

```bash
npm run build && npm run dev > .tmp-dev.log 2>&1 &
# 等 Ready：
curl -s http://localhost:3000/ | grep -oE "跳到主內容|id=\"main\""
```

Expected: 印出 `跳到主內容` 與 `id="main"`。

- [ ] **Step 4: Commit**

```bash
git add app/layout.js
git commit -m "feat(a11y): skip-to-content 連結 + main 錨點

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

### Task 4: 補漏 aria-label + 全套驗證

**Files:**

- Modify:（視掃描結果）少數元件，補確實缺的 aria-label

掃描已知既有覆蓋良好（16 個 aria-label、`<img>` 全有 alt、`html lang` 已設）。本 task 做最後一掃 + 全套驗證。

- [ ] **Step 1: 掃 icon-only / emoji-only 互動元素是否有可辨識名稱**

Run:

```bash
# 找出 onClick 的 <button> 但同段無 aria-label 也無明顯文字者（人工判讀輸出）
grep -rnE "<button" src/components src/blocks app 2>/dev/null | grep -v "aria-label" | head -40
```

判讀原則：若 button 內已有可見文字（如「登出」「找工具 →」）→ 已具 accessible name，**不用加**；若只有 emoji/符號（如 `☰`/`✕`/`🔔`）且無 aria-label → **加** `aria-label="<用途中文>"`。只補確實缺的。

- [ ] **Step 2:（若有缺）補上 aria-label**

對每個確認缺名稱的 icon-only button，加 `aria-label`。範例形式：

```jsx
<button onClick={...} aria-label="關閉">✕</button>
```

（若 Step 1 判讀後無缺漏，跳過此步——掃描預期 0–1 項。）

- [ ] **Step 3: 全套驗證**

```bash
npm run lint          # 0 error（基準不變）
npm run build         # 成功
# dev curl 三連驗（headers + skip-link + focus 規則）：
curl -sI http://localhost:3000/ | grep -ciE "strict-transport|x-content-type|x-frame|referrer-policy|permissions-policy"   # = 5
curl -s  http://localhost:3000/ | grep -c "跳到主內容"                                                                      # = 1
grep -c "focus-visible" app/globals.css                                                                                     # >= 1
```

Expected: headers=5、skip-link=1、focus-visible>=1、lint 0、build 綠。

> 鍵盤焦點環與 skip-link 的實際視覺由標準 `:focus-visible` + sr-only/focus 模式保證（本 session 無瀏覽器可實 Tab；部署後 Jason 可鍵盤 Tab 實驗 + 跑 securityheaders.com）。

- [ ] **Step 4: Commit（若 Step 2 有改）**

```bash
git add -A
git commit -m "feat(a11y): 補漏 icon 按鈕 aria-label

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

（若無補漏則略過。）

---

## 完成後

- 獨立 reviewer 審（headers 值正確、Permissions-Policy 沒擋 passkey、focus/skip-link 無回歸）。
- 開 PR 等 Jason merge。merge → Vercel 套用 headers。**Jason 部署後**：securityheaders.com 評分 + 實測 passkey 登入 + 鍵盤 Tab 焦點/skip-link。
