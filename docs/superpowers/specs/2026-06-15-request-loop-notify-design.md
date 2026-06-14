# 需求迴路閉環 — 站內未讀通知

- 日期：2026-06-15
- 狀態：設計定案（待 writing-plans）
- 主題：需求被 admin 標「已處理」後，提需求的人下次來站上時，於 Navbar「我的需求」看到未讀紅點 → 點進去看到 ✅。

## 背景與問題

飛輪「回饋」環節：使用者提需求（B-2b 已把可信 uid 寫進 request）、`/my-requests` 已能看狀態（🕓 評估中 / ✅ 已處理）、admin 在 `RequestInbox` 標處理。
缺口：狀態變更後**沒有主動通知**，使用者得自己回來看。本案補上「閉環」——讓使用者知道「你提的需求有回應了」。

## 決策（brainstorm 定案）

| 維度     | 決定                                              | 理由                                                                  |
| -------- | ------------------------------------------------- | --------------------------------------------------------------------- |
| 通道     | **站內未讀通知**                                  | 你要求不串付費 API；email/LINE 屬外部/付費；站內零成本零外部          |
| 機制     | **A：`users/{uid}.unreadHandledRequest` boolean** | 用 AuthContext **已載入的 profile**，Navbar 零額外查詢；零 rules 變更 |
| 未讀粒度 | **boolean（有/無更新）**                          | YAGNI；數量/逐筆已讀之後再說                                          |

候選 B（時間戳對 lastHandledAt/seenAt）較精準但更多零件；候選 C（Navbar 每頁查 requests）每個登入者每頁一次查詢、浪費。皆不採。

## 目標 / 非目標

**目標**

- admin 標需求「已處理」→ 該提需求者（有 uid 者）profile 標未讀。
- 登入者在 Navbar「我的需求」看到未讀紅點；點進 `/my-requests` 後即時清除。
- 零外部 API、零付費、零 rules 變更。

**非目標（之後）**

- email / LINE 推播（外部）、未讀「數量」與逐筆已讀、其它通知類型。

## 架構與資料流

```
admin 在 RequestInbox 標「已處理」
  → 更新 request：status='handled'（+ 既有 expireAt；新增 handledAt 供 /my-requests 顯示）
  → 若 request.uid 存在：set users/{uid}.unreadHandledRequest = true（admin 可寫任何 user 文件）
登入者任何頁面 → Navbar 讀 useAuth().profile
  → hasUnreadHandled(profile) 為 true → 「我的需求」連結顯紅點（桌機 + 手機選單）
使用者點進 /my-requests（登入且未讀）
  → set users/{我}.unreadHandledRequest = false（本人可寫自己非 role 欄位）
  → refreshProfile() → 紅點即時消失
```

## 元件（邊界清楚、可獨立測）

1. **`src/lib/requestNotify.mjs`（新，純函式，無 firebase/browser 依賴）**
   - `buildHandledWrites(request)`：回 `{ requestUpdate: { status:"handled", handledAt:true }, notifyUid: string|null }`；`notifyUid = request.uid || null`（匿名 → null）。`handledAt:true` 是「呼叫端要放 serverTimestamp 的標記」（純函式不產生 Firestore sentinel，呼叫端依此插 serverTimestamp）。
   - `hasUnreadHandled(profile)`：回 `!!profile?.unreadHandledRequest`。
   - → TDD。
2. **`src/components/RequestInbox.jsx`（改）** — 標已處理的 updateDoc 路徑：用 `buildHandledWrites`；request 更新加 `handledAt: serverTimestamp()`（保留既有 status/expireAt）；若 `notifyUid`，多一筆 `setDoc(doc(db,"users",notifyUid), { unreadHandledRequest: true }, { merge:true })`。
3. **`src/context/AuthContext.jsx`（改）** — 抽出載入 profile 的邏輯，暴露 `refreshProfile()`（重抓 `getUserProfile(uid)` 並 `setProfile`）；context value 多帶 `refreshProfile`。
4. **`src/components/Navbar.jsx`（改）** — 桌機與手機的「我的需求」連結，`hasUnreadHandled(profile)` 時加紅點標記（小圓點 + `aria-label` 或 sr-only 文字「有更新」）。
5. **`app/my-requests/page.jsx`（改）** — 登入且 `profile.unreadHandledRequest` 為 true 時，mount 後 `setDoc(users/{uid}, {unreadHandledRequest:false}, {merge:true})` + `refreshProfile()`。

## 誠實 / 邊界

- 匿名需求（無 uid）→ 無法通知，標處理時只更新 request、不寫任何 user 文件（不假裝送達）。
- 純站內、零個人資料外送。
- request.uid 的 user 文件若不存在 → `setDoc merge` 會建/補（無害）。

## 不需要的基礎設施

- **無 `firestore.rules` 變更**：本人可寫自己非 role 欄位（既有 users update 規則 `uid==userId && !('role' in affectedKeys)` 已允許）、admin 可寫任何 user 文件（`isAdmin`）→ 新欄位 `unreadHandledRequest` 自動涵蓋。
- 無新 collection / index / TTL / SA / Console 操作。
- → **merge 即由 Vercel 部署生效**。

## 測試（TDD）

- `requestNotify.test.mjs`：
  - `buildHandledWrites`：有 uid → `notifyUid===uid`、`requestUpdate.status==="handled"`、含 handledAt 標記；匿名（無 uid）→ `notifyUid===null`；request 為 null/缺欄位 → 安全（notifyUid=null）。
  - `hasUnreadHandled`：profile.unreadHandledRequest=true → true；false/缺欄位/null profile → false。
- RequestInbox 寫入、AuthContext refreshProfile、Navbar 紅點、/my-requests 清除：build / lint + 部署後人工驗。
- （可選）`firestore.rules.test.mjs` 補 1 條：本人更新自己 `unreadHandledRequest` → ALLOW（既有規則已涵蓋，補測防回歸）。

## Rollout

1. merge → Vercel 部署（無前置 ops）。
2. 部署後人工驗：①admin 標某登入者的需求「已處理」→ 該使用者帳號 Navbar「我的需求」出現紅點 ②點進 /my-requests → 紅點消失、該筆顯 ✅ ③匿名需求標處理 → 不報錯、無 user 寫入。

## 風險 / 緩解

- **AuthContext profile 變動的回歸**：refreshProfile 只新增、不改既有載入流程（mount 時的 onAuthStateChanged 行為不變）。
- **stale profile（清除後紅點不消）**：/my-requests 清除後呼叫 refreshProfile 即時更新 → 不靠 reload。
- **跨文件寫入失敗**（admin 標處理時寫 user 文件失敗）：包在既有錯誤處理；request 狀態仍更新（通知是附帶、失敗不擋主流程）。
