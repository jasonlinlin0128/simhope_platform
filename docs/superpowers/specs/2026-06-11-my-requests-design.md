# B-2b 需求迴路（我的需求）— 設計

> 日期：2026-06-11 ｜ branch：`feature-my-requests`
> 來源：平台體檢「B 區」B-2（需求回饋迴路）第二半。B-2a（開發者申請狀態可見）已上線（PR #40）。

## 1. 問題

feature「提需求」送出後石沉大海：

- `RequestCard` 是純匿名表單（無 `useAuth`），**即使登入也送匿名無 uid**（`src/components/RequestCard.jsx:49-58`）→ 沒有任何方式把需求連回提交者。
- 沒有「我的需求」檢視，使用者看不到自己提的需求是 pending 還是已處理。
- `requests` rules read 僅 admin（`firestore.rules:95`）→ 即使有 uid，使用者也讀不到自己的。

## 2. 目標 / 非目標

**目標**：閉合 feature 迴路——登入時把需求連回使用者，並讓他在「我的需求」頁看到狀態。

**非目標（YAGNI）**

- ❌ 強制登入提需求（**維持登出可匿名提**，不加首頁低摩擦路徑的登入門檻）。
- ❌ access 開發者申請（B-2a 已在 /access 顯示）。
- ❌ composite index（用等值查 + client 排序，免 Console 建索引）。
- ❌ 即時更新（reload 看最新）。
- ❌ 動 RequestInbox（admin 端 feature doc 多一個 uid 欄位無妨）。
- ❌ 連結舊的匿名需求（無 uid 無法連、不顯示）。

## 3. 已確認的產品決策（Jason）

- 查詢策略 **A**：`where uid==我` 等值 + client 排序（免 composite index / Console）。
- 「我的需求」放**新 `/my-requests` 頁** + 登入後 Navbar 入口。
- 頁面**只含 feature**（access 已有家 /access）。
- Navbar「我的需求」**所有登入者**可見（含 admin；與 admin 收件匣＝全部需求 是不同東西）。
- 狀態徽章：pending → `🕓 評估中`（呼應首頁「需求會由經企室評估」）、handled → `✅ 已處理`。

## 4. 設計

### 4.1 uid 捕捉（server 端可信）

- `src/components/RequestCard.jsx`：加 `useAuth()`。`submit` 時若 `user` 存在 → 取 `await user.getIdToken()` 放 `Authorization: Bearer`；未登入 → 不帶（匿名照舊）。
- `app/api/request/route.js` **feature 分支**：讀 `Authorization` header，有 token 則 `adminAuth.verifyIdToken` 取 `uid`（驗失敗 → uid=null，不拒絕）；組 doc 時**有 uid 才加 `uid` 欄位**（匿名 → 無此欄位）。比照既有 access 流程，uid 由 server 驗 token 推導，不信 client 自報。
- access 分支不動；create rules 仍 `false`（只 Admin SDK 寫）。

### 4.2 rules（讀自己的 request）

`firestore.rules` requests read：

```
match /requests/{reqId} {
  allow read: if isAdmin()
    || (isSignedIn() && resource.data.uid == request.auth.uid);
  allow create: if false;
  allow update, delete: if isAdmin();
}
```

- 匿名 request（無 `uid` 欄位）→ `resource.data.uid` 為 null → `null == auth.uid` false → 僅 admin 可讀（fail-closed，與 tools authorUid 同模式）。
- create/update/delete 不變。
- 補 `firestore.rules.test.mjs`：seed 加 `req_dev1{uid:dev1}` / `req_dev2{uid:dev2}` / `req_anon{無uid}`（皆 feature/pending）；測試：dev1 讀自己 allow、讀 dev2 deny、讀匿名 deny、admin 讀任意 allow、anon 讀 deny。

### 4.3 `db.getMyRequests(uid)`（`src/lib/db.js`）

```js
export async function getMyRequests(uid) {
  if (!uid) return [];
  const snap = await getDocs(
    query(collection(db, "requests"), where("uid", "==", uid)),
  );
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort(
      (a, b) =>
        (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0),
    ); // client 排序（新→舊），免 composite index
}
```

等值查 `uid==X` 免 composite index；單一使用者需求少，client 排序無成本。

### 4.4 `/my-requests` 頁（新 `app/my-requests/page.jsx`）

- `"use client"` + `useAuth()`：
  - `loading` → 載入中。
  - `!user` → 「請先登入查看你的需求」+ 登入鈕（直接打網址也不爆；Navbar 入口只在登入後出現）。
  - `user` → `getMyRequests(user.uid)`，列出每筆：需求內容（message）+ 狀態徽章（pending `🕓 評估中` / handled `✅ 已處理`）+ 送出日期。唯讀。
  - 空 → 「你還沒提過需求」+「💬 提需求」鈕（開 `RequestCard`）。
- 沿用既有樣式 token；徽章配色比照（pending 中性、handled 綠）。

### 4.5 Navbar（`src/components/Navbar.jsx`）

- 登入後（`{!loading && user}`）桌面區 + 手機 ☰ 選單各加一個 `<Link href="/my-requests">我的需求</Link>`（桌面用 `hidden md:inline` 文字連結樣式；手機選單用既有 flex-col 連結樣式）。

## 5. 資料流 / 邊界

- 登入提需求 → token → server 驗 → doc 帶 uid → /my-requests `where uid==我` 讀得到。
- 登出提需求 → 無 token → doc 無 uid → 匿名（admin 收件匣仍見、/my-requests 不顯示、別人讀不到）。
- feature 狀態只有 pending / handled（admin markHandled）；無 rejected（access 才有）。
- **即時性**：提需求後 RequestCard 自有「✅ 已送出」確認；/my-requests 需 reload 看新筆（不加自動 refresh，YAGNI）。

## 6. 測試

- **rules（emulator）**：上述 5 條（讀自己/讀別人/讀匿名/admin/anon）。
- **build / lint**：基準不變（lint 2 warnings 0 errors）。
- **手動 / 我代驗**：登入提需求 → /my-requests 見 `🕓 評估中` → admin 後台標已處理 → reload 變 `✅ 已處理`；登出提需求 → 不進 /my-requests；別人讀不到（rules 已測）。

## 7. 影響檔案

**新增**：`app/my-requests/page.jsx`
**修改**：`src/components/RequestCard.jsx`（useAuth + token）、`app/api/request/route.js`（feature uid attach）、`src/lib/db.js`（+getMyRequests）、`src/components/Navbar.jsx`（+我的需求 桌面/手機）、`firestore.rules`（requests read own）、`firestore.rules.test.mjs`（+5 測試 + seed）

## 8. Rollout（動 rules）

1. code merge → production deploy 成功。
2. **Jason Console 發布 `firestore.rules`**（requests read 加 own 分支；SA 無發布權→手動貼）→ **立驗**：登入者讀自己的 request OK、讀別人擋、首頁/收件匣照常（P0 教訓）。
3. 無 migration（uid 只加在「未來」的登入提交；舊資料不動）。
4. 部署 + 發布後我代驗端到端（登入提→/my-requests→admin 標已處理→變 ✅）。
