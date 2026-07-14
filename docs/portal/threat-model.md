# 威脅模型（threat-model.md）

> 版本：v1（2026-07-12）· 階段一交付物 · STRIDE 分析，對照規格階段四的安全測試清單

## 0. 資產與信任邊界

- **資產**：員工身分（員編↔帳號綁定）、子系統 URL 與 ACL（內部系統存在性即敏感）、audit_logs 完整性、`FIREBASE_SERVICE_ACCOUNT` 等機密、統編（弱共享秘密）。
- **信任邊界**：瀏覽器 ↔ Next.js API（不可信輸入）；Next.js ↔ Firestore（Admin SDK，特權）；client SDK ↔ Firestore（受 rules）；Portal ↔ 子系統（僅跳轉，無信任關係）。

## 1. STRIDE 分析

### S — Spoofing（假冒）

| 威脅                                                     | 緩解                                                                                                                                                                                                                        |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 用他人員編＋統編搶先啟用帳號（統編全員相同＝最大風險面） | 一次性（activated 即 409）；每員編 5 次錯誤鎖 15 分；IP 限流；統一錯誤訊息不洩漏員編是否存在；啟用成功寫 audit；**建議**：啟用開放期由 admin 分批匯入母檔並公告，縮短可搶註窗口。被搶註救援：admin 重置該員編（audit 留痕） |
| 暴力猜密碼                                               | Firebase Auth 內建節流 + IP 限流（既有 `enforceRateLimit`）；密碼政策擋員編/統編/生日樣式（規格禁用清單）                                                                                                                   |
| 偽造 Bearer token                                        | `verifyIdToken` 簽章驗證（既有 requireRole）；不接受任何 body 內的 uid                                                                                                                                                      |

### T — Tampering（竄改）

| 威脅                                                         | 緩解                                                                                                                                                                   |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 前端竄改 application_id 繞過權限                             | `/api/apps/{id}/open` 與 `/tool/[id]` server 端 `canAccessApp` 重驗（測試 4-10）                                                                                       |
| client 直改 Firestore（提權、改 ACL、改 audit）              | rules：`users.role`/`acl_roles` 僅 admin 可寫（既有 `roleIsViewerOrAbsent` 延續）；`tools.allowed_*` 客端不可寫；`employees`/`audit_logs` 全 deny，只有 Admin SDK 可動 |
| 註冊 API 餵惡意 manifest（超長字串、惡意 URL、原型污染 key） | schema 驗證白名單欄位（`src/lib/appManifest.mjs`，僅接受已知欄位、型別、enum、URL 需 https 且非內網位址）；註冊進 `status=pending`，admin 審核後才可見                 |

### R — Repudiation（否認）

| 威脅                      | 緩解                                                                                                                                                                                          |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 「不是我開的/不是我改的」 | `audit_logs`：登入、啟用、開啟應用、Registry CRUD、權限變更全記（actor_uid + employee_id + ip + ua + ts）；server-only 寫入、無 update/delete API → append-only；保留策略見 data-model §audit |

### I — Information Disclosure（資訊洩漏）

| 威脅                             | 緩解                                                                                                                                                              |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 未授權者看到受限系統的存在與 URL | BY_RULE/HIDDEN app 不進 client payload；詳情頁 404 而非 403（不洩漏存在性）；rules 收斂 client 直讀                                                               |
| 錯誤訊息洩漏內部細節             | 既有 `apiErrorPayload`：非預期錯誤一律 500「伺服器錯誤」，細節只進 server log                                                                                     |
| 機密進 repo                      | 既有紀律：env only；`.env.example` 只放 key 名；統編放 env 不入 DB                                                                                                |
| XSS 竊 token                     | React 預設轉義；描述欄位經 react-markdown（不啟用 raw HTML）；既有安全 headers（nosniff/XFO/Referrer-Policy）；CSP 已決策暫不上（內部站 ROI 低——殘餘風險，列 §3） |

### D — Denial of Service

| 威脅                                           | 緩解                                                                                                           |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| 啟用/登入/註冊 API 洪水                        | 既有 IP 限流 helper 全面套用；Vercel 平台層防護；外呼（health check 巡檢）用既有 `fetchWithTimeout` 防上游拖垮 |
| health_check_url 指向慢速/內網位址（SSRF-ish） | 巡檢 fetch：timeout、`redirect:'manual'`（既有 enrich-tool 模式）、禁 RFC1918/localhost 目標                   |

### E — Elevation of Privilege

| 威脅                   | 緩解                                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------------ |
| viewer 自我提權        | 既有 rules 防護 + 25 條提權測試已在 CI；新欄位 `acl_roles`/`employee_id` 綁定納入同套 rules 測試 |
| developer 改別人的 app | route 層 owner 檢查（不信 client 傳的 owner 欄位）                                               |
| admin 帳號被釣魚       | MFA 預留：admin 綁 passkey（phishing-resistant）＝第一階段要求，見 authentication-flow §4        |

## 2. 規格階段四安全測試 → 具體對應

| 規格測試            | 本棧對應                                                                                                                                                |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SQL injection       | 不適用（Firestore 無 SQL）；等價面＝**輸入驗證測試**：manifest/activate/ACL API 餵型別錯亂、超長、控制字元、`__proto__` key，斷言 400 且不落庫          |
| XSS                 | 描述/名稱欄位存入 `<script>`、markdown image onerror 等 payload，斷言 render 後為文字（React/remark 轉義），無 `dangerouslySetInnerHTML`                |
| CSRF                | 全站無 cookie session（Bearer only）→ 跨站請求帶不到憑證；測試：無 Authorization header 的狀態變更請求一律 401                                          |
| Session fixation    | 無 server session id 可固定；Firebase token 由 SDK 管理。測試：登入前後 token 不可互用、revoke 後舊 token 失效（1h 內為 Firebase 已知窗口，列殘餘風險） |
| 暴力登入            | activate/login-event 限流測試：第 N+1 次 429；員編鎖定測試：5 次錯 → 鎖 15 分                                                                           |
| 停用員工無法登入    | employees.status=inactive → requireEmployee 403 + 清單為空（單元 + rules 測試）                                                                         |
| 停用系統不顯示      | status=terminated/dev → canAccessApp false（單元測試）                                                                                                  |
| 竄改 application_id | 對無權 app 打 `/api/apps/{id}/open` → 404/403 + 無 audit 的 `APP_OPEN` 成功紀錄                                                                         |

## 3. 已接受的殘餘風險

1. **統編為弱共享秘密**：啟用窗口內可被在職同事假冒啟用（有 audit 可追、admin 可重置）。更強做法（一次性啟用碼逐人發放）列為建議，成本由總部評估。
2. **無 CSP**：既有決策（內部站、破站風險高）；XSS 依賴框架轉義。
3. **Firebase ID token 1h 有效窗**：revoke 後最長 1h 舊 token 仍可用（`checkRevoked` 逐請求驗證已評估為 DoS 放大，不開）。
4. **staging Firebase 專案未建**（假設 A6）前，整合測試僅 emulator。
5. **啟用端點對「已知統編者」是員工狀態 oracle**（2026-07-14 review 提出）：統編正確時，
   401（查無/停用）／409（已啟用）／429（鎖定中）三種回應可區分員編狀態。**刻意保留**——
   能通過統編驗證的本就是內部人，而員編對同事並非秘密；改回統一 401 會讓正常員工在
   「已啟用」情境下卡死且不知所措（UX 代價 > 安全收益）。統編未過者一律統一 401，
   外部人無此 oracle。
6. **密碼／Google 登入的稽核是 client 自報，非權威**（PR-3）：這兩條路徑由 Firebase SDK
   直接對 Firebase 認證，不經過我們的伺服器 → 我們無從攔截。目前由 AuthContext 登入後
   回報 `/api/auth/login-event`（entry 標 `authoritative:false`）。**當事人可以繞過**
   （改 sessionStorage、擋一個 XHR，或乾脆用 Firebase REST 登入後直接讀 Firestore）。
   要真正權威需 Identity Platform 的 blocking function（`beforeSignIn`）＝ Firebase 專案
   升級 GCIP，屬「不串付費 API」決策範圍，需 Jason 決定。**帳號啟用、權限變更、passkey
   登入是伺服器端權威紀錄**，不受此限。admin 稽核頁已標示此邊界，避免把「沒紀錄」誤讀成
   「沒登入」。
7. **PUBLIC_ALL 工具的原始文件仍可被匿名整份讀取**（PR-4 review 提出）：Firestore 的
   document read 無法逐欄位遮蔽——`allow read` 放行了，整份文件（含 `owner_employee_id`、
   `health_check_url` 等入口網欄位）就都讀得到。`/api/apps` 的欄位白名單只保護 API 路徑，
   保護不了 client SDK / REST 直讀。目前可接受：公開工具的 owner 員編與健檢網址不算機密
   （健檢網址還被 manifest 驗證器強制為公網 https）。**但未來若要在 tools 文件放真正機密的
   欄位（憑證、內部端點），必須先把公開展示資料與私有 Registry 欄位拆成兩個 collection。**
8. **稽核的 append-only 是規則層保證，不是儲存層**：firestore.rules 對 client 全 deny
   （含 admin），但 Admin SDK 天生繞過 rules → 任何未來拿到 `adminDb` 的 route 都能改寫
   歷史。真正的不可竄改需外部 WORM 儲存，目前不做（內部站 ROI）。

9. **停用員工的即時封鎖已實作於 `requireRole`（PR-2）**，但 Firestore rules 層仍以 users.role
   為準——未過 API 的 client 直讀路徑（tools 公開清單）不查 employees。PR-4 rules 收斂
   時一併處理；在那之前，離職員工仍可讀公開工具清單（＝與匿名訪客同等，非提權）。
