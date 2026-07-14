# AI 應用單一入口網 — 架構設計（architecture.md）

> 版本：v1（2026-07-12）
> 狀態：階段一交付物
> 相關文件：[authentication-flow.md](authentication-flow.md) · [authorization-model.md](authorization-model.md) · [threat-model.md](threat-model.md) · [data-model.md](data-model.md) · [delivery-plan.md](delivery-plan.md)

## 0. 最重要的架構決策：本 repo 不是空的

規格階段一第 1 步要求「檢查現有 repository」。盤點結果：**simhope-tools-platform 已經是一個運作中的內部工具入口網**（production：simhope-platform.vercel.app），已實作規格中 9 個核心模組裡的大部分地基。因此本專案**不砍掉重練、不另起 repo、不導入新框架**，而是在既有平台上做「差距補齊」。

### 現況模組對照表

| #   | 規格模組                     | 現況                                                                               | 差距（要補的）                                                                                             |
| --- | ---------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| 1   | Portal Web UI                | ✅ `/`（首頁+熱門）、`/hub`（搜尋 Fuse.js、分類、排序）、ToolCard、深色模式、PWA   | 收藏（favorites）；卡片按 ACL 過濾                                                                         |
| 2   | Authentication Service       | ✅ Firebase Auth：密碼、Google、passkey/WebAuthn（custom token 由 Admin SDK 鑄造） | 員工編號帳號體系；首次啟用流程（員編+統編 → 設個人密碼）；登入 audit                                       |
| 3   | User/Dept/Role Mgmt          | ⚠️ `users/{uid}` 有單值 `role`（viewer/developer/admin），rules 已擋自我提權       | `departments` collection；`employees` 母檔；user↔employee 綁定；多角色                                     |
| 4   | Application Registry         | ✅ `tools` collection（17+ 工具、6 種 type、typeData、pending 審核流程）           | 欄位擴充（authentication_mode、visibility、allowed_*、health_check_url、data_classification…）＝ migration |
| 5   | Application Access Control   | ⚠️ 目前只有 status 可見性（public/pending）                                        | per-app ACL（user/dept/role）＋ server-side 過濾 ＋ rules 收斂                                             |
| 6   | Audit Log                    | ⚠️ 有 `analytics`（匿名彙總，非稽核）                                              | 新 `audit_logs` collection（server-only 寫入、含行為者）                                                   |
| 7   | Admin Console                | ✅ `/admin`：工具 CRUD、審核、需求收件匣、使用概況、健檢看板                       | 權限指派 UI（dept/role/user）、員工管理分頁、audit 檢視                                                    |
| 8   | Health Check / Status        | ⚠️ 有內容健檢看板（healthFlags）；無系統 health endpoint                           | `/api/health`（本 PR 已加）；per-app `health_check_url` 巡檢（cron）                                       |
| 9   | System Registration Workflow | ⚠️ 有 pending→審核→發布流程 + import script                                        | `app-manifest.yaml` schema（本 PR 已加）＋註冊 API                                                         |

## 1. 技術棧（沿用，附理由）

| 層        | 選擇                                                                           | 理由                                                                                                                                        |
| --------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 前端/後端 | Next.js 16 App Router（RSC + API routes）                                      | 既有、團隊已維運、公開頁已 RSC 化（ISR 5min）                                                                                               |
| 認證      | Firebase Auth（+ Admin SDK custom token）                                      | 既有；密碼由 Firebase scrypt 雜湊，滿足「密碼不得明文保存」；已有 passkey 可作高權限第二因素；未來可升級 Identity Platform 接 OIDC/SAML IdP |
| 資料庫    | Firestore                                                                      | 既有；rules 測試 80+ 條、PITR（7 天）+ daily backup（14 天）已上線                                                                          |
| 部署      | Vercel（main merge 即 production deploy）                                      | 既有；preview deployment 天然提供 staging URL                                                                                               |
| 搜尋      | Fuse.js（client）                                                              | 既有                                                                                                                                        |
| 測試      | `node --test`（單元）、`@firebase/rules-unit-testing` + emulator（rules/整合） | 既有慣例：純函式 `.mjs` + TDD                                                                                                               |

**刻意不做**：不引入 SQL DB（規格提到 migration/SQL injection 測試 — 對應到 Firestore 世界：migration＝`scripts/*.mjs` dry-run/--apply 慣例；SQLi 不適用，改測 NoSQL 注入面＝輸入驗證與 rules，見 threat-model）；不引入微服務（禁止事項）；不自製 OAuth/OIDC protocol（非範圍）。

## 2. 系統架構

```
員工瀏覽器
   │  Firebase ID token (Bearer)
   ▼
Next.js on Vercel ──────────────────────────────┐
│  RSC 公開頁（/, /hub — ISR 5min）              │
│  Client 島（搜尋/收藏/登入 UI）                 │
│  API routes（全部後端驗證）：                   │
│    /api/auth/*        認證+首次啟用             │
│    /api/apps/*        我可見的應用/開啟跳轉      │
│    /api/registry/*    子系統註冊（manifest）    │
│    /api/admin/*       管理（requireRole admin） │
│    /api/health        存活探測                  │
│    /api/cron/*        健康巡檢/週報              │
└───────┬────────────────────────────────────────┘
        │ Admin SDK（FIREBASE_SERVICE_ACCOUNT env）
        ▼
Firestore：employees / users / departments / tools(=applications)
           / audit_logs / analytics / requests …
Firebase Auth：帳號（員編 alias email、Google、passkey）

子系統（各自部署、各自網址）：Portal 只做「授權過濾 + audit + 302 跳轉」，
不代管密碼、不 iframe 嵌入（非範圍）。
```

關鍵原則：

1. **授權判斷全在後端**：可見清單由 server（Admin SDK 或 RSC + rules）過濾後才下發；前端竄改 `application_id` 會在 `/api/apps/{id}/open` 被 `canAccessApp()` 再驗一次。
2. **Portal 與 Registry 分離**：Registry＝`tools` collection + `/api/registry/*`（資料層），Portal＝展示層。子系統註冊只動 Registry，Portal 自動反映（新系統過審即出現，免公告網址）。
3. **稽核不可偽造**：`audit_logs` 只有 Admin SDK 能寫（rules 對 client 全 deny，含 admin），
   actor 一律取自伺服器已驗證身分。**但「不可偽造」≠「不可繞過」**：帳號啟用、權限變更、
   passkey 登入、開啟應用（PR-4）都經 server route ⇒ 權威；密碼／Google 登入直接打 Firebase
   不經我們的伺服器 ⇒ 只能由 client 回報，當事人可繞過（entry 標 `authoritative:false`，
   殘餘風險見 threat-model §3.6）。

## 3. 環境策略

| 環境         | 前端                                   | 資料                                                                              | 機密                                                       |
| ------------ | -------------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| 本機         | `npm run dev`                          | **Firebase Emulator**（firestore + auth）+ 種子資料 `scripts/seed-portal-dev.mjs` | `.env.local`（不入版控）                                   |
| 測試/staging | Vercel Preview（每個 PR 自動一條 URL） | 建議增設獨立 staging Firebase 專案（見假設 A6）                                   | Vercel env（Preview scope）                                |
| 正式         | Vercel Production（main merge 觸發）   | 正式 Firestore（PITR+backup 已有）                                                | Vercel env（Production scope）/ `FIREBASE_SERVICE_ACCOUNT` |

**Docker 化**：規格要求 Docker 開發環境。本棧的本機依賴只有 Node + Firebase Emulator（Java），提供 `docker-compose.dev.yml` 包 emulator suite 作為**可選**路徑；主路徑維持 `npm run dev` + `firebase emulators:start`（更輕、既有慣例）。若公司政策強制全 Docker，階段三再補 app 容器（deviation 已明示，不默默略過）。

機密紀律（既有慣例延續）：repo 永不提交密碼/token/私鑰；`FIREBASE_SERVICE_ACCOUNT`、`CRON_SECRET`、`GEMINI_API_KEY` 等一律 Vercel env；新增 `.env.example` 只放 key 名。

## 4. 關鍵假設（必讀 — 均未默默假設）

| #   | 假設                                                                                                                                             | 若不成立的影響                                                     | 需誰確認     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ | ------------ |
| A1  | **公司目前沒有可依賴的 IdP**（AD / Entra ID / Google Workspace 皆未確認存在）。第一階段以「員編＋個人密碼」為統一身分，架構預留 OIDC/SAML        | 若其實有 Entra/Workspace，階段二直接接 IdP，首次啟用流程降級為備援 | 總部 IT      |
| A2  | **員工母檔來源＝HR 提供的名冊**（員編、姓名、部門、在職狀態），以匯入 script 灌入 `employees` collection；**不直接連正式員工資料庫**（禁止事項） | 無名冊則啟用驗證無從比對；需先拿到匯出格式                         | HR / 總部    |
| A3  | 員工編號在公司內唯一且不回收重用                                                                                                                 | 若回收，需加「世代」欄位區分                                       | HR           |
| A4  | 統編＝公司統一編號，全員相同、半公開 → **只能當首次啟用的弱驗證**（配合限流+鎖定+一次性），永不作密碼（規格明訂）                                | —                                                                  | 已由規格確認 |
| A5  | 員工不一定有公司 email → 帳號主鍵是員編；Firebase Auth 用確定性 alias email（`emp{員編}@portal.simhope.internal`），僅內部識別用、不收發信       | 若全員有公司信箱，可改用 email 為主鍵並加信箱驗證                  | 總部         |
| A6  | 目前只有單一 Firebase 專案（prod）。建議增設 staging 專案；在它存在前，Preview 環境唯讀地共用 prod 資料的公開面                                  | staging 缺席期間，破壞性測試只能打 emulator                        | Jason        |
| A7  | 子系統擁有者能自行產 `app-manifest.yaml` 並呼叫註冊 API（或走 /admin 表單代填）                                                                  | 若不能，admin 代登錄，workflow 不變                                | 各系統 owner |
| A8  | 內部站可公網存取（Vercel），靠認證+授權把關，無 VPN/IP 白名單需求                                                                                | 若需網路層隔離，另議 Vercel firewall / 自架                        | 總部 IT      |

## 5. 非目標（第一階段，依規格）

不替子系統保存員工密碼；不自動填密碼；不 iframe 嵌未知外部系統；不強制既有子系統立刻 SSO；不自製 OAuth/OIDC；前端不做真正的存取判斷（只做 UX 上的顯示過濾，權威在後端）。
