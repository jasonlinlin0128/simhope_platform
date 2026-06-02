# SimHope Hub Phase 2.x — 開發者自助申請 + AI 輔助提需求 + 統一收件匣 + 手機選單 · 設計 spec

> **建立日期**：2026-06-02
> **狀態**：📝 **設計中（待 implement）**
> **前置**：Phase 2（PR #9）已上線（`/docs /faq /changelog /access`、`requests` collection、`RequestModal`、`/api/request`、firestore.rules 的 faqs/requests）。本 spec 沿用既有 chrome / auth（Google + passkey + 密碼）/ role 機制 / Gemini 端點模式 / admin tab 模式。
> **範圍**：四塊中小型強化，併入同一份 spec。
>
> 1. **F1 — 開發者自助申請**（登入 modal 加註冊 + 審核閘）
> 2. **F2 — AI 輔助提需求卡**（免登入、左寄信 / 右 AI 表單 → Discord）
> 3. **C — 統一申請/需求收件匣**（admin，F1/F2 共用後端）
> 4. **A — 手機下拉導覽選單**（補 RWD 缺口）
>    **不在本 spec**：Playground（Phase 3）；首頁 metrics 動態化、FAQ 內容（backlog）。

---

## 0. 背景

Phase 2 上線後三個缺口浮現：(1) 開發者只能由 admin 手動建帳號（`createDeveloperAccount`），無自助申請管道；(2) 首頁「提需求」仍是 mailto、且要登入才能用站內表單——但真正有需求的是「不會登入的一般同仁」；(3) 手機完全沒有導覽（Navbar 連結全 `hidden md:inline`、無漢堡）。本 spec 一次補齊，並把 F1/F2 的後端收斂成一個 admin 收件匣。

## 0.5 全域原則（沿用 + 本次）

1. **用詞**：新手 + 專業都看得懂（白話 + 括號專業詞）。
2. **RWD / UI·UX**：手機/平板/桌機都要好用（A 直接補手機導覽）。
3. **不為佔位硬做**；複用既有（LoginModal、RequestModal、`/api/request`、`/api/generate` 的 Gemini 模式、admin tab 模式 FaqManager、AuthContext）。
4. **免登入端點要有輕量防護**（長度上限 + rate limit）——見 §2.4。
5. **firestore.rules 改動須 Firebase Console 手動發布**（SA 無發布權）。

---

## 1. F1 — 開發者自助申請（自助註冊 + 審核閘）

### 1.1 入口與 Navbar

- Navbar 觸發鈕「👨‍💻 開發者登入」→ 改文案 **「登入👨‍💻 / 註冊🔑」**（開同一個 modal）。
- 登入主要客群＝想當開發者上架者 + admin（瀏覽/用工具本來免登入）。

### 1.2 LoginModal 改造為雙 tab（版型 A）

`src/components/LoginModal.jsx` 頂部加兩個 tab：

- **「登入」tab**：現有 Google / passkey / email-密碼登入，完全不變。
- **「開發者註冊」tab**：
  - Google / passkey 一鍵（沿用既有 handler；首登 `ensureUserDoc` 建無 role viewer）。
  - 登入完成後（或已登入的 viewer）顯示**理由 textarea**「你想開發 / 上架什麼？」+「送出申請」。
  - 送出 → 寫申請（§1.3）→ 顯示「✅ 申請已送出，審核中」。
- **既有過時文案改掉**：標題「開發者登入」→「登入 / 註冊」；底部「沒有帳號？請聯絡 IT 部門建立帳號」→ 改為引導「想上架工具？切到『開發者註冊』申請開發權限。」（密碼帳號仍由 admin 後台建，保留說明）。

### 1.3 申請資料與狀態

- 送出申請（需已登入，uid 來自 auth）：
  - 寫 `requests`：`{ type:'access', uid, email, name, reason, status:'pending', createdAt }`（經 `/api/request`，Admin SDK 寫 — §2.3）。
  - 在 `users/{uid}` 記 `devStatus:'pending'`。
- **狀態顯示（擋重複申請）**：開「開發者註冊」tab 時依目前使用者狀態切換：
  - viewer 無申請 → 顯示理由表單。
  - `devStatus:'pending'` → 顯示「**申請審核中，請等管理員核准**」（不再顯示表單）。
  - `devStatus:'rejected'` → 顯示「上次申請未通過，可重新申請」+ 表單（允許再送）。
  - 已是 developer / admin → 顯示「你已經是開發者了 ✅」。
- `devStatus` 由 `useAuth()` 的 profile 帶出（`getUserProfile` 已讀整份 user 文件，新增欄位自動可用）。

### 1.4 核准生效

- admin 在收件匣（§3）按「核准」→ 設 `users/{uid}.role:'developer'` + `devStatus:'approved'` + 該 request `status:'approved'`。
- 生效時機：使用者**下次載入頁面**時 `getUserProfile` 讀到新 role（不做即時推播，YAGNI）。

### 1.5 元件

- 改：`src/components/LoginModal.jsx`（雙 tab + 註冊流程 + 狀態）、`src/components/Navbar.jsx`（按鈕文案）、`src/lib/db.js`（可選 helper：寫 devStatus / 讀申請狀態，或直接在元件內用既有 API）。

---

## 2. F2 — AI 輔助提需求卡（免登入）

### 2.1 入口統一

- 首頁 §about「💬 提需求給我」（現為 `mailto`）+ footer「提需求」（Phase 2 的 `RequestButton`/`RequestModal`）→ **都改開同一張新卡**（`RequestModal` 升級為雙欄版，或新 `RequestCard`）。全站提需求入口一致。

### 2.2 卡片版面（雙欄，手機疊）

- **左：✉️ 用 email 寄**（`mailto:jasonlin@simhope.com.tw?subject=...`，**免登入**，維持現狀，給習慣寄信的人）。
- **右：✍️ 線上填（免登入）**：
  - **姓名（必填）**、**聯絡方式（選填：email / 分機 / 部門）**、**需求 textarea**。
  - **「✨ AI 幫我寫清楚」**按鈕（§2.3）。
  - **「送出」**→ 通知經企室（§2.3）。
- 不再要求登入（目標客群＝不登入的一般同仁）。

### 2.3 AI 輔助行為（★ 兩者都做）

- 「✨ AI 幫我寫清楚」→ 呼叫新端點 **`/api/refine-request`**（Gemini 2.5 Flash，沿用 `/api/generate` 模式但**免登入**）。
- 回傳：
  - **優化版**文字（一鍵「採用」填回 textarea，可再編輯）。
  - **「可以再補充：① … ② …」**清單（指出哪邊講不清楚）。
- 使用者保有掌控（採用與否、自己改）。

### 2.4 送出與後端（`/api/request` 依 type 分流）

- 送出（`type:'feature'`）→ `POST /api/request`（**免登入分支**）→ Admin SDK 寫 `requests`：`{ type:'feature', name, contact, message, status:'pending', createdAt }`（**無 uid**）→ `notify()` Discord。
- `/api/request` 分流：
  - `type:'access'`（F1 開發者申請）：**必須帶有效 Bearer token**，uid 取自 token。
  - `type:'feature'`（提需求）：**免登入**，`name` 必填（後端驗非空）。
- **輕量防護（免登入端點）**：
  - 長度上限：`message ≤ 1000`、`name ≤ 50`、`contact ≤ 100`、AI 輸入 `≤ 1000`。
  - **簡單 rate limit**：per-IP 記憶體計數（如 `/api/refine-request` 每 IP 每分鐘 ≤ 5 次、`/api/request` feature 每 IP 每分鐘 ≤ 5 次）。逾限回 429。
  - 姓名 + 需求非空才允許 AI / 送出。
  - 殘留風險（內部站 + 網址不公開 + 流量低）接受、上線觀察。

### 2.5 元件

- 改/新：提需求卡元件（升級 `RequestModal` 或新 `RequestCard.jsx` + 沿用 `RequestButton`）、`app/page.jsx` §about CTA 接線、`src/components/Footer.jsx` 接線。
- 新：`app/api/refine-request/route.js`（Gemini，免登入 + rate limit）、`src/lib/rateLimit.js`（per-IP 記憶體計數，共用）。
- 改：`app/api/request/route.js`（type 分流 + feature 免登入 + name 驗證 + rate limit）。

---

## 3. C — 統一申請 / 需求收件匣（admin）

### 3.1 介面

- `/admin` 加 tab **「📥 申請 / 需求」**（沿用 FaqManager 的 tab 模式）。
- 列 `requests`，依 type 分區呈現：
  - **🔑 開發者申請（`type:'access'`）**：姓名 / email + 理由 → **[核准]**（§1.4：設 role + devStatus + request.status）/ **[拒絕]**（devStatus:'rejected' + request.status:'rejected'）。
  - **💬 提需求（`type:'feature'`）**：姓名 + 聯絡 + 內容 → **[標記已處理]**（request.status:'handled'）。
- 頂部 **「待處理 / 全部」** 切換（預設待處理；待處理＝status 'pending'）。

### 3.2 資料與規則

- `requests.status` 流轉：`pending` →（access）`approved`/`rejected`、（feature）`handled`。
- **⚠️ firestore.rules 調整**（目前 requests 是 `read: isAdmin; write: false`）：
  ```
  match /requests/{reqId} {
    allow read: if isAdmin();
    allow create: if false;            // 只 server Admin SDK 建（防偽造）
    allow update, delete: if isAdmin(); // admin 後台改 status / 刪除
  }
  ```
  核准時 admin client 還會寫 `users/{uid}.role`（既有 rules 已允許 isAdmin update users）。**須 Console 重新發布 firestore.rules。**
- 核准/拒絕/標記＝admin 在 client（/admin）用 client SDK 更新（沿用 FaqManager 模式），受 `isAdmin()` 授權。

### 3.3 元件

- 新：`src/components/RequestInbox.jsx`（admin CRUD/審核）。改：`app/admin/page.jsx`（加 tab）、`firestore.rules`。

---

## 4. A — 手機下拉導覽選單（版型 A1）

### 4.1 行為

- `src/components/Navbar.jsx`：手機（`< md`）顯示 **☰** 鈕；點開 → navbar 下方**全寬下拉面板**，列出：資源中心 / 文件 / FAQ / 更新日誌 / 關於這個平台 / 同仁回饋 + 🔧 找工具 + 登入👨‍💻/註冊🔑（或登入後的 我的工具/管理後台 + 登出）+ 🌙 深色切換。
- 桌機（`md+`）**完全不變**（維持現在橫列）。
- 點任一連結 / 點面板外 → 收合。用 `useState` 控制開合。

### 4.2 元件

- 改：`src/components/Navbar.jsx`（加 ☰ + 下拉面板 + open state；既有桌機連結保留）。

---

## 5. 資料模型 / 設定彙整

| 類型            | 名稱                                      | 說明                                                  |
| --------------- | ----------------------------------------- | ----------------------------------------------------- |
| user 欄位       | `devStatus`                               | none/pending/approved/rejected（開發者申請狀態）      |
| requests 欄位   | `status` 流轉 + `name`/`contact`/`reason` | feature: name/contact；access: reason；共用 status    |
| API route       | `/api/request`（改）                      | type 分流：access 需登入、feature 免登入+name         |
| API route       | `/api/refine-request`（新）               | Gemini AI 輔助，免登入 + rate limit                   |
| lib             | `src/lib/rateLimit.js`（新）              | per-IP 記憶體計數，共用於兩個免登入端點               |
| firestore.rules | requests（改）                            | `update,delete: if isAdmin()`（**Console 重新發布**） |
| env             | 無新增                                    | 沿用 `GEMINI_API_KEY` / `FIREBASE_SERVICE_ACCOUNT`    |

---

## 6. 元件清單

| 區塊 | 元件                                                               | 新增/改                            |
| ---- | ------------------------------------------------------------------ | ---------------------------------- |
| F1   | `LoginModal.jsx`                                                   | 改：雙 tab + 註冊流程 + 狀態       |
| F1/A | `Navbar.jsx`                                                       | 改：按鈕文案 + 手機下拉選單        |
| F2   | 提需求卡（`RequestModal` 升級或新 `RequestCard`）+ `RequestButton` | 改/新：雙欄 + 免登入表單 + AI 輔助 |
| F2   | `app/page.jsx`（§about）/ `Footer.jsx`                             | 改：提需求入口接同一張卡           |
| F2   | `app/api/refine-request/route.js`                                  | 新：Gemini AI 輔助                 |
| F2   | `app/api/request/route.js`                                         | 改：type 分流 + feature 免登入     |
| F2/C | `src/lib/rateLimit.js`                                             | 新：per-IP 限流                    |
| C    | `RequestInbox.jsx` + `app/admin/page.jsx`                          | 新/改：收件匣 tab                  |
| C    | `firestore.rules`                                                  | 改：requests update/delete isAdmin |

---

## 7. 風險 / 注意

1. **免登入端點濫用**（`/api/request` feature + `/api/refine-request`）：輕量防護（長度上限 + per-IP rate limit + 非空檢查）；Gemini Flash 成本低；內部站低風險、上線觀察。
2. **firestore.rules 須 Console 手動發布**（requests update/delete）——未發布前 admin 在收件匣按核准/標記會被 deny。
3. **rate limit 在 serverless 的限制**：Vercel serverless 是多實例 + 冷啟，記憶體計數只在單一實例內有效（非全域精確限流）。對「擋住明顯洗版」夠用；要嚴格全域限流需外部 store（KV/Redis）——YAGNI，先記憶體版。
4. **RWD**：手機下拉選單、提需求卡雙欄手機疊，都要實測手機寬度。
5. **核准的雙寫**（request.status + users role/devStatus）非交易性：先寫 user（role+devStatus），再寫 request.status；任一失敗有不一致風險——admin 重按即可修正（冪等），可接受。
6. **沿用既有不破壞**：LoginModal 既有登入路徑（Google/passkey/密碼）、Phase 2 的 `/api/request` access 行為（仍需登入）、admin 既有 tab。

---

## 8. 驗收標準

- [ ] Navbar 鈕顯示「登入👨‍💻 / 註冊🔑」；開 modal 有「登入 / 開發者註冊」雙 tab；登入 tab 行為同舊。
- [ ] 開發者註冊 tab：Google/passkey 後填理由 → 送出 → 顯示「申請審核中」；重開顯示 pending 擋重複；已是開發者顯示「你已是開發者」。
- [ ] 提需求卡：首頁「提需求給我」+ footer「提需求」都開同一張卡；左 mailto（免登入）；右免登入填姓名(必填)+聯絡(選填)+需求。
- [ ] 「✨ AI 幫我寫清楚」（免登入）回優化版（可採用）+ 補充提醒；送出 → `requests`(type=feature,無 uid) + Discord 收到。
- [ ] `/api/request`：access 無 token 回 401；feature 無 name 回 400；超量回 429。
- [ ] admin「📥 申請/需求」：開發者申請可核准（該帳號變 developer、下次載入可進 /dashboard）/ 拒絕；提需求可標記已處理；待處理/全部切換。
- [ ] `firestore.rules` requests update/delete = isAdmin 已發布；admin 核准/標記寫入成功。
- [ ] 手機（<md）出現 ☰ → 下拉面板含所有連結 + 登入/註冊 + 深色；桌機不變。
- [ ] `npm run build` + `npm run lint`（無新錯）通過；四項 RWD 實測。

---

## 9. 未來 / backlog

- 首頁 metrics 動態化（目前寫死）。
- `/faq` 起手內容（Phase 2 附錄 8–12 題）。
- requests 嚴格全域 rate limit（外部 KV）；目前記憶體版夠擋洗版。
- Playground（Phase 3）。
