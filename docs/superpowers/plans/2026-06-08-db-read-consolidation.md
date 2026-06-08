# getUserProfile 重複讀收斂 — 實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `getApprovedTools`/`getApprovedPainCards`/`getCatalog` 改吃 `isAdmin` 參數（預設 false），移除內部多餘的 `getUserProfile` 讀取 → 登入者首頁同一 user doc 讀 3→1。

**Architecture:** Option B — 唯一消費者首頁+hub 是公開頁，一律公開視圖；呼叫端不需改（不帶參數 → 預設 false）。只動 `src/lib/db.js`。

**Tech Stack:** Firebase modular SDK（client）。

**設計來源：** [spec](../specs/2026-06-08-db-read-consolidation-design.md)。

**驗證慣例：** `npm run lint` 基準 3 problems（0 error）不增；commit Conventional + 結尾 `Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>`。

---

## Task 1: db.js 三函式改吃 isAdmin 參數 + 移除多餘讀

**Files:** Modify `src/lib/db.js`

- [ ] **Step 1: import 移除未再使用的 `auth`**

old：

```js
import { db, auth } from "./firebase";
```

new：

```js
import { db } from "./firebase";
```

- [ ] **Step 2: `getApprovedTools` 改吃參數**

old：

```js
export async function getApprovedTools() {
  let isAdmin = false;
  if (auth.currentUser) {
    const profile = await getUserProfile(auth.currentUser.uid);
    isAdmin = profile?.role === "admin";
  }

  if (isAdmin) {
    return await getAllTools();
  }
```

new：

```js
export async function getApprovedTools(isAdmin = false) {
  if (isAdmin) {
    return await getAllTools();
  }
```

> 同時更新函式上方註解，補一行：`@param {boolean} [isAdmin=false] 由呼叫端（AuthContext 已持有）傳入；true=回全部，false=只回公開狀態。`

- [ ] **Step 3: `getApprovedPainCards` 改吃參數**

old：

```js
export async function getApprovedPainCards() {
  let isAdmin = false;
  if (auth.currentUser) {
    const profile = await getUserProfile(auth.currentUser.uid);
    isAdmin = profile?.role === "admin";
  }

  let snap;
```

new：

```js
export async function getApprovedPainCards(isAdmin = false) {
  let snap;
```

- [ ] **Step 4: `getCatalog` 透傳 isAdmin**

old：

```js
/**
 * 取目錄（catalog）— 重用 getApprovedTools 的可見性，再依 category 過濾。
 * @param {{category?: string}} opts  category 省略或 'all' = 全部
 * @returns {Promise<object[]>}
 */
export async function getCatalog({ category } = {}) {
  const tools = await getApprovedTools();
```

new：

```js
/**
 * 取目錄（catalog）— 重用 getApprovedTools 的可見性，再依 category 過濾。
 * @param {{category?: string, isAdmin?: boolean}} opts  category 省略或 'all' = 全部；isAdmin 透傳給 getApprovedTools
 * @returns {Promise<object[]>}
 */
export async function getCatalog({ category, isAdmin } = {}) {
  const tools = await getApprovedTools(isAdmin);
```

- [ ] **Step 5: lint**

Run: `npm run lint`
Expected: 維持基準 **3 problems（0 error）**；無 `auth` unused、無新問題。

- [ ] **Step 6: commit**

```bash
git add src/lib/db.js
git commit -m "perf(db): getApprovedTools/PainCards 改吃 isAdmin 參數，砍多餘 getUserProfile (audit #10)

兩函式原各自讀 users/{uid} 判 isAdmin，登入者首頁讀同一 doc 3 次
（AuthContext 1 + 這 2）。改吃 isAdmin 參數(預設 false)、移除內部
getUserProfile + 未用的 auth import。Option B：唯一消費者首頁+hub 是
公開頁→不帶參數=公開視圖，呼叫端不需改。公開可見性 byte 不變。

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

## Task 2: build + grep + MCP 驗證（不 commit）

**Files:** 無（驗證）

- [ ] **Step 1: build** → `npm run build` 綠。

- [ ] **Step 2: grep 確認多餘讀已移除**

Run: `grep -nE "getUserProfile|auth\.currentUser|isAdmin" src/lib/db.js`
Expected: `auth.currentUser` 不再出現；`getUserProfile` 只在其 export 定義（L114 區）出現、`getApprovedTools`/`getApprovedPainCards` 內無；`isAdmin` 出現在三函式的參數/分支。

- [ ] **Step 3: 起 dev server** → 背景 `npm run dev`，等 `Ready`（:3000；占用先 `taskkill //PID <pid> //F`）。

- [ ] **Step 4: MCP playwright（公開、免登入）**

1. navigate `/` → 工具目錄、類別計數、痛點卡正常渲染（與線上一致，如 14 資源 / 24 痛點卡）；`browser_console_messages` 無 error。
2. navigate `/hub` → 14 工具卡正常渲染、分類 tab 計數正常、無 error。

- [ ] **Step 5: 停 dev server** → `taskkill //PID <pid> //F`。

---

## 完成後

- 推 `feature-db-read-consolidation` → 開 PR（base main；body：讀取 3→1、公開可見性不變、admin 首頁/hub 改一致公開、MCP 結果）。
- 獨立 reviewer subagent → CI/Vercel 綠 → 等 Jason merge（含 Jason auth-gated 驗：admin 首頁/hub 公開目錄、/admin 仍全部）。

---

## Self-Review（plan vs spec）

- **Spec coverage**：§3.1 import/三函式→T1 S1-S4；§5 測試→T1 S5 lint + T2 build/grep/MCP。✓
- **Placeholder scan**：完整 old/new 碼、exact 指令；無 TBD。✓
- **一致性**：`isAdmin = false` 預設在 getApprovedTools/getApprovedPainCards 一致；getCatalog 解構 `{ category, isAdmin }` 並 `getApprovedTools(isAdmin)` 透傳；呼叫端不帶參數→undefined→預設 false（行為正確）。✓
