# C-2 公開頁 RSC 轉換 — 設計

> 日期：2026-06-11 ｜ branch：`feature-public-rsc`
> 來源：平台體檢 Top-5 #3「公開頁 RSC + OG」的後半（C-1 OG 已上線於 PR #44）。

## 1. 問題

`app/page.jsx`（首頁）與 `app/hub/page.jsx`（資源中心）都是 `'use client'`，在 `useEffect` 裡抓 Firestore 資料。後果：

- **首屏閃「載入中…」**才出資料（useEffect 只在 hydration 後跑）。
- **初始 HTML 沒內容** → 連結被分享 / 搜尋引擎抓到的是空殼（C-1 的 OG 卡解決了縮圖，但頁面本體仍空）。

## 2. 目標 / 非目標

**目標**：把 `/` 與 `/hub` 改成 server-render，server 端先抓公開資料（approved tools / painCards / metrics）渲染進初始 HTML，互動（搜尋 / 篩選 / chip）留在 client island。首屏不閃、初始 HTML 有真內容。

**非目標（YAGNI / 之後）**：❌ `/tool/[id]` 詳情頁（1109 行、大量互動、SEO 標題已由 C-1 layout 處理，CP 值低）❌ 其他公開頁（/faq /docs /access；/changelog 已是 RSC）❌ 改任何 UI 外觀 / 互動行為 ❌ 改 firestore.rules / 資料 / 後端。

## 3. 已確認決策（Jason）+ 已驗證假設

- **範圍**：只 `/` + `/hub`。
- **快取**：ISR ~5 分鐘（`revalidate: 300`）。
- **抓取方式**：**Firestore REST**（同現有 `tool/[id]/layout.jsx` 範式；不在 server 跑 browser SDK；`next:{revalidate:300}` 乾淨快取）。
- **架構**：islands — server 殼 + client 互動島。

**對 live prod 實證（2026-06-11）**：

- 匿名 REST `:runQuery`（`tools` where `status in [live,beta,new,dev,terminated]`）→ **回 18 docs**（rules 放行受限查詢）。✅ 整個設計成立。
- 匿名 GET `analytics/totals` → 可讀（`toolView` 有值、`toolOpen` 尚無 → 首頁誠實顯示 0，與現況一致）。✅

## 4. 設計

### 4.1 核心機制（為何能不閃）

首屏閃是因為 `useEffect` 只在 client 跑。修法：**server component 先抓資料 → 當 props 傳給 client island**。client component 的初次渲染本來就會在 server SSR；拿到 props 即有內容 → 初始 HTML 有卡片，hydration 後 island 接手互動。**不是把互動移除，是把資料抓取上移。**

### 4.2 新 server 資料層

**`src/lib/firestoreValue.mjs`（純函式，TDD）** — Firestore REST 的 typed value → JS 值的 converter。處理 `stringValue` / `integerValue`(→Number) / `doubleValue` / `booleanValue` / `nullValue` / `timestampValue` / `arrayValue`(→遞迴 array) / `mapValue`(→遞迴 object)。並提供 `docToObject(restDoc)`＝`{ id: name 末段, ...fields 轉換 }`。**這是本案唯一可乾淨單測的純邏輯。**

**`src/lib/serverCatalog.js`（server-only，REST + ISR）**

- `PROJECT = "simhope-platform"`、base URL 同 tool layout。
- `getServerCatalog()` — POST `:runQuery`，structuredQuery `from tools` + `where status IN [live,beta,new,dev,terminated]`，`fetch(..., { next: { revalidate: 300 } })`；回 `docToObject` 後的陣列（shape 同 `getCatalog()`）。
- `getServerPainCards()` — POST `:runQuery`，`from painCards` + `where approval == approved`；空陣列 → fallback `DEFAULT_SITE.painCards`（同現行 db.js 行為）。
- `getServerMetrics()` — GET `analytics/totals` doc（同 tool layout 的單 doc GET 範式）；丟給既有純函式 `normalizeMetrics()`；fetch 失敗 / doc 不存在 → 全 0（冷啟動安全）。
- 全部 try/catch：抓失敗回空陣列 / 0，**不 crash 頁面**。

### 4.3 `DEFAULT_SITE` 抽離（review finding #1）

`DEFAULT_SITE` 現住 `src/lib/db.js`（line 35），而 db.js 頂部 import firebase client SDK。serverCatalog 若 import db.js 會把 client SDK 拉進 server 模組。

- **新 `src/lib/siteDefaults.js`** — 把 `export const DEFAULT_SITE = {...}` 整塊搬過來（純資料、無 firebase 依賴）。
- **`src/lib/db.js`** — 改成 `import { DEFAULT_SITE } from "./siteDefaults"` 並 `export { DEFAULT_SITE }`（既有 `import { DEFAULT_SITE } from "@/lib/db"` 的呼叫端不受影響）。
- serverCatalog 從 `./siteDefaults` import。

### 4.4 首頁 `app/page.jsx` → server component

- 拿掉 `'use client'` 與所有 `useState`/`useEffect`/`useMemo`。
- `const [tools, painCards, metrics] = await Promise.all([getServerCatalog(), getServerPainCards(), getServerMetrics()])`；`counts = categoryCounts(tools)`（既有純函式）。
- server 直接渲染：hero（值已知、**移除所有 `loading?"…"` 三元式**）/ 5 類別入口卡（`CategoryEntryCard`，無互動）/ `MetricsBand`（display-only）/ 同仁回饋（靜態 hardcoded）/ CTA。
- 抽 **`src/components/PainPointsExplorer.jsx`（client island）** ＝ 痛點 chip 篩選 + `painCategoryCounts` + 排序（relatedToolId 優先）+ `PainCard` grid。吃 `painCards` props，持有 `selectedPainCategory` state。
- `RequestButton`（既有 client）照舊嵌在 CTA。
- `export const revalidate = 300`（無 searchParams → 完整 static ISR）。

### 4.5 資源中心 `app/hub/page.jsx` → server component

- server 讀 `searchParams`（Next 16 async）取 `cat`；`tools = await getServerCatalog()`；`counts = categoryCounts(tools)`。
- 抽 **`src/components/HubExplorer.jsx`（client island）** ＝ 現 `HubInner` 全部（搜尋框 + 300ms debounce + Fuse + `CategoryTabs` + grid + `track("search")`），但**資料改吃 `tools` props、不再 `useEffect` 抓**；`initialCat` 吃 props（取代 `useSearchParams`）。
- island 初次渲染（在 server SSR）即套用 `initialCat` 過濾 → 初始 HTML 是對的分類 grid、**零 flash**（含 `/hub?cat=platform` 深連結）。
- 因讀 `searchParams` → 頁面 **dynamic render**；但 `getServerCatalog()` 的 REST fetch 帶 `revalidate:300` → **資料仍 5 分鐘快取**（每 request 從快取資料快速重渲染、不打 Firestore）。「新工具 5 分鐘內出現」成立。
- 移除原 `<Suspense>`（那是為 `useSearchParams` 包的；改吃 props 後不需要）。

### 4.6 資料流

```
server page (REST fetch, 300s 快取) ──props──▶ client island 初次 SSR（已有卡片）──hydrate──▶ 互動接手
```

### 4.7 不變的

UI 外觀 0 變化；搜尋 / 篩選 / chip / track / `?cat=` 行為不變；`src/lib/db.js`（client SDK，auth-gated 頁仍用）邏輯不動（只多 re-export DEFAULT_SITE）。

## 5. Edge cases

- painCards 空集合 → `DEFAULT_SITE.painCards` 後備（prod 24 張不會空，但保留行為）。
- metrics 5 分鐘 stale（vanity 數，可接受）；doc 缺欄位 → `normalizeMetrics` 補 0。
- REST fetch 失敗 → 空 grid / 0，頁面不 crash。
- 空搜尋結果 → 既有「這個分類目前沒有項目」訊息（在 island 內，照舊）。

## 6. 測試 / 驗證

- **TDD**：`firestoreValue.mjs`（converter + docToObject）→ `firestoreValue.test.mjs`（node:test / test:unit）：各 value 型別、巢狀 array/map、id 取末段、缺欄位。
- **build / lint**：基準不變。
- **我代驗（dev 起站 + playwright）**：
  1. `/` 與 `/hub` **view-source 初始 HTML 含工具/痛點卡**（不再只有「載入中」）。
  2. 首屏無「載入中」閃動。
  3. hub 搜尋 / 分類 tab / `?cat=platform` 深連結正確、`track("search")` 仍送。
  4. 首頁痛點 chip 篩選正確、數字（資源數 / metrics / 痛點數）正確。
  5. 0 console error；亮/暗模式 OK。
- 部署後（Jason merge）可再用 view-source / Lighthouse 確認首屏。

## 7. 影響檔案

| 檔案                                       | 動作                                                                                 |
| ------------------------------------------ | ------------------------------------------------------------------------------------ |
| `src/lib/firestoreValue.mjs` + `.test.mjs` | **新**：REST value converter（純，TDD）                                              |
| `src/lib/serverCatalog.js`                 | **新**：getServerCatalog / getServerPainCards / getServerMetrics（REST + 300s 快取） |
| `src/lib/siteDefaults.js`                  | **新**：DEFAULT_SITE（從 db.js 搬出，無 firebase 依賴）                              |
| `src/lib/db.js`                            | **改**：import + re-export DEFAULT_SITE from siteDefaults                            |
| `app/page.jsx`                             | **改**：→ server component；render 靜態 + `<PainPointsExplorer>`                     |
| `src/components/PainPointsExplorer.jsx`    | **新**：client island（痛點 chip 篩選 + grid）                                       |
| `app/hub/page.jsx`                         | **改**：→ server component（讀 searchParams）+ `<HubExplorer>`                       |
| `src/components/HubExplorer.jsx`           | **新**：client island（搜尋 + Fuse + tabs + grid + track）                           |

## 8. Rollout

純前端 + server 資料抓取。**無 rules / 無資料遷移 / 無 SA 動作** → merge → Vercel 部署即生效。reviewer READY 後開 PR 等 Jason merge。
