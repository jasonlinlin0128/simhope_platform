# SimHope Hub Phase 2 — 支援頁設計 spec

> **建立日期**：2026-06-02
> **狀態**：📝 **設計中（待 implement）**
> **範圍**：在 Phase 1（多頁式資源中心基礎設施）之上，新增四個支援頁 —— `/docs`（新手上路）、`/faq`（常見問題）、`/changelog`（更新日誌）、`/access`（取用說明 / 權限分級）。
> **前置**：Phase 1（PR #8）已 merge 進 main（合併 commit `0098560`）。本 spec 沿用 Phase 1 建立的 chrome（Navbar/Footer/Banner）、`taxonomy.js`、`category/type` 雙軸、block editor、auth context、設計系統。
> **參考站**：https://hub.twinkleai.tw/（只參考內容架構與排版，配色/視覺沿用現有平台）
> **不在本 spec**：Playground（→ Phase 3）、單一工具版本歷史 + 下載舊版（→ Phase 2.5，草案見 §10）。

---

## 0. 背景與動機

Phase 1 把單頁平台擴成多頁式資源中心（5 大類別 + `/hub` 統一目錄 + 共用 chrome + `taxonomy.js` 單一真相）。Phase 2 補上 twinkle hub 風格的「支援頁」，讓同仁不只能找/用工具，還能：知道**怎麼開始用**（docs）、**找到常見問題答案**（faq）、**看平台演進**（changelog）、**理解自己的權限並申請升級**（access）。

四頁皆為全新路由（`app/` 下目前無 faq/docs/access/changelog）。

---

## 0.5 全域原則（本次 brainstorming 與 Jason 拍板的跨頁守則）

1. **用詞「新手 + 專業都看得懂」**：技術詞用白話表達，必要時括號附原詞（例：「把工具裝進你的 AI（Claude Code / Cursor）」、「一般同仁 (viewer)」）。
2. **RWD + UI/UX 必顧**：手機 / 平板 / 桌機都要好用，沿用既有 Tailwind 4 響應式斷點與設計 token（`--color-*`、`--shadow-clay` 等）。表格類版型尤其要處理手機重排/捲動。
3. **不為佔位硬開發**：占位要**誠實**（指向真人窗口），不做半成品假介面；要做就做真正有用的東西（直接影響 `/docs` ③ API 路徑與通知管道的取捨）。
4. **最大化複用既有**：chrome、`taxonomy.js`、block editor（7 種 block）、`react-markdown`、`UploadButton`、auth context、firestore.rules helper（`isSignedIn`/`isAdmin`）。新元件只在沒有可複用時才建。
5. **遵守 AGENTS.md 部署鐵律**：本 Phase 多為**新增** collection / block type（非破壞既有結構），但仍新增 `firestore.rules` 規則 —— 規則發布因 SA 無 `firebaserules.releases.create` 權限，須走 Firebase Console 手動貼上（見 §9）。

---

## 1. 共用 chrome / 導覽更新

Phase 1 的 Navbar 已加「資源中心」`/hub`、Footer 已掛上。Phase 2 補連結：

- **Navbar**（`src/components/Navbar.jsx`）：加 `文件` `/docs`、`FAQ` `/faq`、`更新日誌` `/changelog`（桌機顯示；手機收進現有選單邏輯）。`/access` 不放主 nav（從 footer / 登入區 / docs 進入即可）。
- **Footer**（`src/components/Footer.jsx`）：
  - 「說明」欄補 `文件` `/docs`、`常見問題` `/faq`、`更新日誌` `/changelog`、`取用說明` `/access`。
  - **「提需求」由 mailto 改為開啟共用申請表單 modal（`type=feature`）**（見 §5）。
- **Banner**（`src/components/Banner.jsx`，Phase 1 已建、預設隱藏）：`/changelog` 上線後可選擇性開啟 `variant="changelog"` 指向最新版本（YAGNI，先不強制開）。

---

## 2. `/docs` — 新手上路指南

### 2.1 定位（內容邊界）

`/docs` 的角色是「**怎麼用這整個 Hub**」的平台層級上手指南，**刻意不重複**以下兩處：

| 介面                | 角色                                                         |
| ------------------- | ------------------------------------------------------------ |
| 首頁 `/`            | 門面 + 快速導覽（淺）                                        |
| **`/docs`**         | **平台新手上路：分使用者路徑的「怎麼開始用」，不教單一工具** |
| 詳情頁 `/tool/[id]` | 單一工具的深入頁（既有「🚀 快速安裝」tab，不動）             |

### 2.2 內容（靜態 in-repo，不建編輯器）

`/docs` 內容很少改、屬結構性內容，**靜態寫在 repo**（改動走程式 / PR），不另建 admin 編輯器（與 FAQ 不同）。

- **頂部分流器**（幫完全新手選路徑）：
  > 只想用做好的工具？→ ①（多數同仁）　會用 Claude Code / Cursor 想擴充？→ ②　要寫程式串接？→ ③
- **① 我只想用工具（網頁，免安裝）** — 完整：
  - 登入方式：Google 一鍵 / Face ID（passkey）
  - 到「資源中心」`/hub` 找 → 點工具卡「馬上打開」
  - 小提醒：手機 / 內網能不能用之類（或連去 `/faq`）
- **② 我要把工具裝進我的 AI（Claude Code / Cursor → MCP·Skill）** — 完整：
  - 前置需求：先裝 Claude Desktop / Code
  - 通用三步：到工具詳情頁 → 複製設定 snippet 或下載 `.zip` 到 `~/.claude/skills/` → 重啟
  - 裝完怎麼確認成功
- **③ 我要用程式串接（API）** — **誠實精簡占位**：
  - 「想用程式串接？目前採個案處理，請聯絡窗口」+ 指向少數既有 api/mcp 工具詳情頁
  - 理由：MCP/API 認證（Phase C）暫緩、平台尚無正式發金鑰機制；不做半成品 API 文件（守則 3）
- **共通收尾區**（讓 `/docs` 當 hub 的轉運站）：沒權限 → `/access`、提需求·上架 → `/dashboard`、卡關找窗口 email、資料安全疑慮 → `/faq` 資安段。

### 2.3 版型

**B · 垂直分段 + 頂部/側邊錨點**：一頁到底可掃讀（新手友善），錨點讓老手直接跳到 ②/③；③ 精簡也只是最後一小段、不突兀。

### 2.4 元件

- `app/docs/page.jsx`：靜態內容 + anchor nav（純前端，無資料層）。內容以 JSX / 區段常數維護。

---

## 3. `/faq` — 常見問題（兩層）

### 3.1 兩層 FAQ，共用一顆 accordion 元件

|        | 平台 FAQ（`/faq` 頁）                  | 單一工具 FAQ                                       |
| ------ | -------------------------------------- | -------------------------------------------------- |
| 內容   | 登入/權限/上架/資安… 全站問題          | 「這個工具」專屬問答                               |
| 誰維護 | **admin only**                         | **該工具作者自己**（rules 已允許 author update）   |
| 怎麼做 | 新 `faqs` collection + `/admin` 管理區 | **block editor 新增「FAQ / accordion」block 型別** |

> 兩者前台用**同一顆 accordion 元件**渲染（新元件 `src/components/Accordion.jsx`）。

### 3.2 平台 FAQ — 資料模型 + 維護

- 新 Firestore collection `faqs`，每筆：
  ```jsonc
  {
    "question": "...",
    "answer": "...(markdown)",
    "category": "login",
    "order": 0,
    "published": true,
  }
  ```
- 答案用 **markdown**（沿用詳情頁 `react-markdown`），可放連結 / 步驟 / 程式碼。
- **維護介面**：`/admin` 加「FAQ 管理」區（沿用既有 admin 風格）：新增 / 編輯 / 排序（`order`）/ 上下架（`published`），存回 Firestore。**前端可編、不手改 DB**。
- **`firestore.rules`**：`faqs` 公開可讀；**僅 admin 可寫**（沿用 `isAdmin()`）。

### 3.3 分類（5 類）

|     | 分類 key                     | 涵蓋                                     |
| --- | ---------------------------- | ---------------------------------------- |
| 🔐  | `login` 登入 / 帳號          | 怎麼登入、Google / Face ID、登不進去找誰 |
| 🧭  | `usage` 使用工具             | 在哪找、權限不夠怎辦、手機 / 內網        |
| 📤  | `submit` 提需求 / 上架       | 怎麼提、誰能上架、審核多久               |
| 🛡️  | `security` 資料安全          | 能不能丟敏感資料、資料存哪、誰看得到     |
| 🧠  | `install` MCP / Skill 怎麼裝 | 簡答 + 導去 `/docs` ②                    |

### 3.4 版型

**A · 分類分組 + 頂部 chip 跳轉**（與 `/docs` 同調）：各分類成段往下排，頂部 chip 點了跳到該段。題不多也不擁擠、可掃讀。

### 3.5 單一工具 FAQ — block editor FAQ block

- 在既有 block editor 加一種 **`faq` block**（一組 Q&A 陣列），作者編自己工具詳情頁時可加，前台用同一顆 `Accordion` 渲染。
- 空的就不顯示（非占位）。零新增管理介面、複用既有自助編輯權限（rules: `authorUid==self || isAdmin()`）。

### 3.6 起手內容

模型+分類定後，spec 附錄（§12）草擬 **8–12 題起手 FAQ**，Jason 之後在後台改。

### 3.7 元件

- `src/components/Accordion.jsx`（共用）、`app/faq/page.jsx`、`/admin` FAQ 管理區（擴充 `app/admin/page.jsx` 或新子元件）、block editor 加 `faq` block 的編輯 + 渲染分支。

---

## 4. `/changelog` — 更新日誌（平台層）

### 4.1 資料來源（C：渲染但過濾技術段）

- **直接渲染既有 `CHANGELOG.md`**（單一來源、零重複維護、與 `/docs` 靜態同調）。
- 但**只預設顯示面向使用者的段**（版本摘要 + `新增` / `變動` / `移除`）；**技術段**（`內部` / `安全` 深技術 / `文件`）**收合**在「▸ 技術細節」之後，並附「看完整 CHANGELOG」連結。
- `CHANGELOG.md` 為 Keep-a-Changelog 格式（`## [版本] — 日期` + 摘要段 + `### 分節`），目前 0.1 → 0.7。需一個輕量 parser 把 markdown 切成 `{ version, date, summary, userSections, techSections }`。

### 4.2 版型

**A · 左側時間軸**（rail + 圓點，最具「更新日誌」辨識度）。RWD：手機上 rail 變細 / 圓點內嵌。

### 4.3 元件

- `app/changelog/page.jsx` + `CHANGELOG.md` 解析（build 時讀檔或 import raw）+ 時間軸渲染。每張版本卡：版本 badge + 日期 + 摘要 + 使用者段 + 「▸ 技術細節」收合。

### 4.4 不在本頁（→ Phase 2.5）

「每個工具的版本歷史 + 下載舊版」拆成獨立 spec（草案見 §10）。

---

## 5. `/access` — 取用說明 / 權限分級

### 5.1 三層權限（對齊 `firestore.rules` 現況）

| 能做什麼                        | 一般同仁 (viewer) | 開發者 (developer) | 管理員 (admin) |
| ------------------------------- | :---------------: | :----------------: | :------------: |
| 瀏覽 / 搜尋 / 使用所有資源      |         ✓         |         ✓          |       ✓        |
| 上架自己的工具 / 痛點卡（送審） |         —         |         ✓          |       ✓        |
| 編輯自己上架的內容              |         —         |         ✓          |       ✓        |
| 審核上架·退回、編輯全站內容     |         —         |         —          |       ✓        |
| 管理 FAQ／建開發者帳號／後台    |         —         |         —          |       ✓        |

- 對應 rules：tools/painCards `create` 需 role ∈ [developer, admin] 且 `authorUid==self`、`update/delete` 需 author 或 admin；`faqs` write 限 admin。
- 登入：Google 一鍵 / Face ID（passkey）；首次 Google 登入自動成為「一般同仁 (viewer)」。
- **顯示目前角色 + 條件式 CTA**（小加值，已採用）：讀 auth context → 顯示「你目前：◯◯」、highlight 對應欄、**只對 viewer 顯示申請 CTA**。

### 5.2 申請 / 提需求 —— 統一成一個管道

不用 mailto。站內共用表單 → 寫 Firestore + 即時通知 Jason。

- **collection `requests`**：
  ```jsonc
  { "type": "access" | "feature", "uid": "...", "email": "...", "name": "...", "message": "...", "status": "pending", "createdAt": <ts> }
  ```
- **共用表單 modal**（`src/components/RequestModal.jsx`，仿既有 `LoginModal`）：自動帶 email/name（from auth）+ 留言 textarea。
  - `/access` 開「申請成為開發者」（`type=access`）。
  - **footer「提需求」改開同一 modal（`type=feature`）**，淘汰 mailto。
- **API route `/api/request`**：驗證登入 → 寫 `requests` → 呼叫 `notify(message)`。
- **`notify()` 可抽換**（`src/lib/notify.js`）：
  - **Phase 2 先做 Discord webhook**：POST 到 `DISCORD_WEBHOOK_URL`（Vercel env）。最簡單可靠、零認證。
  - **LINE 後補**：Jason 已有 LINE bot（「AI-First工作坊小助手」，目前無功能，可改名/啟用）；之後用 Messaging API push（需 channel access token + Jason 的 userId）時，只在 `notify()` 多接一個 channel，不動其他程式。
- **`firestore.rules`**：`requests` `create` 限登入者（且 `uid==auth.uid`、`status=='pending'`）；`read/update` 限 admin。

### 5.3 版型

**A+B · 三欄角色卡（pricing 改造，主視覺）+ 下方小能力對照表（matrix）**。卡片手機疊三張；matrix 給想看精確差異的人，手機需橫捲 / 重排處理。

### 5.4 元件

- `app/access/page.jsx`、`src/components/RequestModal.jsx`、`app/api/request/route.js`、`src/lib/notify.js`、`firestore.rules`（加 `requests`）、footer 接線。

---

## 6. 資料模型 / 設定彙整（Phase 2 新增）

| 類型                 | 名稱                     | 說明                                                 |
| -------------------- | ------------------------ | ---------------------------------------------------- |
| Firestore collection | `faqs`                   | 平台 FAQ（admin 寫、公開讀）                         |
| Firestore collection | `requests`               | 申請開發者 / 提需求（登入者建、admin 讀改）          |
| block type           | `faq`                    | block editor 第 8 種：一組 Q&A，前台用共用 Accordion |
| Vercel env           | `DISCORD_WEBHOOK_URL`    | `notify()` Discord 通知                              |
| firestore.rules      | `faqs` / `requests` 規則 | 須 **Console 手動發布**（SA 無發布權，見 §9）        |

> 不改既有 `tools` / `painCards` 結構 → 無破壞性 migration。`faqs`/`requests` 為新 collection、`faq` block 為加法 → 對 AGENTS.md migration 鐵律無衝突。

---

## 7. 元件清單（Phase 2）

| 頁/類型    | 元件                              | 新增/擴充                              |
| ---------- | --------------------------------- | -------------------------------------- |
| chrome     | `Navbar`                          | 擴充：加 文件/FAQ/更新日誌 連結        |
| chrome     | `Footer`                          | 擴充：補連結 + 提需求改開 RequestModal |
| /docs      | `app/docs/page.jsx`               | 新增（靜態 + anchor nav）              |
| /faq       | `app/faq/page.jsx`                | 新增                                   |
| /faq       | `src/components/Accordion.jsx`    | 新增（/faq + 工具 FAQ block 共用）     |
| /faq       | `/admin` FAQ 管理區               | 擴充 admin                             |
| /faq       | block editor `faq` block          | 擴充（編輯 + 渲染分支）                |
| /changelog | `app/changelog/page.jsx`          | 新增（CHANGELOG.md parser + 時間軸）   |
| /access    | `app/access/page.jsx`             | 新增（三欄卡 + matrix + 角色感知）     |
| /access    | `src/components/RequestModal.jsx` | 新增（共用申請/提需求表單）            |
| /access    | `app/api/request/route.js`        | 新增（寫 requests + notify）           |
| /access    | `src/lib/notify.js`               | 新增（Discord webhook，可抽換）        |
| 資料       | `firestore.rules`                 | 擴充：`faqs` / `requests` 規則         |
| 資料       | `src/lib/db.js`                   | 擴充：`getFaqs()` 等 helper            |

---

## 8. 路由彙整（Phase 2 後）

| 路由                                                   | 內容                             | Phase    |
| ------------------------------------------------------ | -------------------------------- | -------- |
| `/` `/hub` `/tool/[id]` `/dashboard` `/admin` `/login` | 既有                             | 1 / 前期 |
| `/docs`                                                | 新手上路（3 路徑 + 錨點）        | **2**    |
| `/faq`                                                 | 常見問題（分類 accordion，可編） | **2**    |
| `/changelog`                                           | 平台更新日誌（左側時間軸）       | **2**    |
| `/access`                                              | 權限分級 + 申請表單              | **2**    |
| `/playground`                                          | 完整互動 demo                    | 3        |

---

## 9. 風險 / 注意事項

1. **RWD（守則 2）**：四頁皆須實測手機/平板/桌機。`/access` matrix 與 `/changelog` 左側 rail 是 RWD 重點。
2. **firestore.rules 發布**：新增 `faqs`/`requests` 規則後，因 SA 無 `firebaserules.releases.create` → `deploy-firestore-rules.mjs` 只能建 ruleset 不能發布（403）→ **改用 Firebase Console 手動貼上發布**（AGENTS.md 既有踩坑）。**規則沒發布＝新 collection 預設 deny**，要記得發。
3. **Discord webhook env**：`DISCORD_WEBHOOK_URL` 須在 Vercel 設好，否則 `notify()` 靜默失敗。`/api/request` 要在 webhook 失敗時仍**成功寫入 `requests`**（通知失敗不擋申請落地）。
4. **用詞（守則 1）**：四頁文案都要白話 + 括號專業詞；尤其 `/docs` ②③ 與 `/access` 角色名。
5. **不為佔位硬做（守則 3）**：`/docs` ③ 與 LINE 通知都是「誠實占位 / 後補」，不做半成品。
6. **block editor 加 `faq` block 的迴歸風險**：動到既有 7-block 編輯/渲染管線 → 加完要實測既有 block 沒壞、新 `faq` block 編輯與前台渲染正確。
7. **與 Phase 1 收尾的先後**：Phase 1 的 `migrate-category.mjs --apply` 仍待執行（merge 後須 deploy 綠燈 → 跑 migration → 驗 live）。Phase 2 為新增、不依賴該 migration，可平行設計/實作；但**正式上線前** Phase 1 的 migration 應已完成驗證，避免兩件事混在一起難除錯。

---

## 10. 未來（已拆出，不在本 spec）

### Phase 2.5 — 工具版本歷史 + 下載舊版（草案）

- **資料模型**：工具文件加 `versions` 陣列，每筆 `{ version, date, notes(markdown), fileUrl? }`。
  - download / doc / skill 型：每版有自己的下載檔（舊版檔留 Storage 可下載）。
  - webapp / mcp / api 型：每版僅版本號 + 日期 + 更新說明。
- **編輯**：沿用「作者可編自己工具」，在工具編輯流程加結構化「版本」編輯區（可排序 + 綁下載檔；非 freeform block）。
- **前台**：詳情頁加「🕒 版本」tab，由新到舊列版本/日期/說明/下載鈕；「最後更新時間」= 最新版日期。
- **migration**：把現有 `typeData.version` + 現有檔塞成 `versions[0]`，舊資料不掉。
- 規模較大（資料模型 + 開發者編輯 UI + 詳情頁 tab + Storage 多檔 + migration），故獨立成 spec/plan。

### Phase 3 — Playground

完整互動 demo（仿 twinkle 6 demo 卡），工程量大、另開 spec。

---

## 11. 驗收標準（Phase 2）

- [ ] Navbar 出現 文件 / FAQ / 更新日誌；Footer 補齊連結、「提需求」開 RequestModal（非 mailto）。
- [ ] `/docs` 三路徑（①完整 ②完整 ③誠實占位）+ 頂部分流器 + 錨點導覽 + 共通交叉連結；垂直分段版型；RWD 過。
- [ ] `/faq` 分類分組 + chip 跳轉、accordion 展開收合、markdown 答案；admin 可在前端新增/編輯/排序/上下架 FAQ（不手改 DB）；`faqs` 規則已發布。
- [ ] block editor 可加 `faq` block，作者編自己工具時可用，前台用同一 Accordion 渲染；既有 7 種 block 無迴歸。
- [ ] `/changelog` 渲染 `CHANGELOG.md` 成左側時間軸，預設只顯示使用者段、技術段可展開、附完整連結。
- [ ] `/access` 三欄角色卡 + 下方對照表；顯示目前角色 + 對 viewer 顯示申請 CTA。
- [ ] 申請/提需求表單送出 → 寫入 `requests` collection + Discord 收到通知；webhook 失敗不擋寫入；`requests` 規則已發布。
- [ ] 四頁 RWD（手機/平板/桌機）與既有設計系統一致；`npm run build` + `npm run lint` 通過。

---

## 12. 附錄 — 起手 FAQ 草稿（8–12 題，Jason 後台可改）

> 答案為 markdown；以下為內容方向，實作時填正式文案。

**🔐 登入 / 帳號**

1. 怎麼登入？ → Google 一鍵或 Face ID（passkey）；首次 Google 登入自動建立「一般同仁」身份。
2. 登不進去 / 沒有帳號怎麼辦？ → 用公司 Google 帳號即可；仍有問題聯絡窗口。

**🧭 使用工具** 3. 在哪裡找工具？ → 到「資源中心」`/hub`，用分類 tab 或搜尋。4. 為什麼有些工具我點不開 / 看不到？ → 可能是開發中或已終止；待審工具只有作者/admin 看得到。5. 手機 / 公司內網可以用嗎？ → （依實情填）。

**📤 提需求 / 上架** 6. 我想要一個目前沒有的工具怎麼辦？ → footer / `/access` 的「提需求」表單。7. 我要怎麼上架自己做的工具？ → 需「開發者」權限，到 `/access` 申請；之後在 `/dashboard` 提交。8. 上架後多久會審核？ → （依實情填）。

**🛡️ 資料安全** 9. 這些工具會把我的資料外傳嗎？ / 能不能丟敏感資料？ → （依實情填，重要）。10. 誰看得到我上傳的東西？ → （依可見性規則填）。

**🧠 MCP / Skill 怎麼裝** 11. MCP / Skill 是什麼、怎麼裝？ → 簡答 + 導去 `/docs` ② 完整步驟。12. 裝了沒反應怎麼辦？ → 確認已重啟 Claude；仍不行聯絡作者（詳情頁）或窗口。
