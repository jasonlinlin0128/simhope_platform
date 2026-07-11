# 交付計畫：階段三～五（delivery-plan.md）

> 版本：v1（2026-07-12）· 把規格的 MVP／測試／交付需求切成可獨立 review 的小 PR（每個 PR：TDD 純函式 → route → UI，走既有 subagent-driven 慣例，merge 即 Vercel 部署）

## 1. 階段三 MVP — PR 序列

| PR                               | 內容                                                                                                                                                             | 依賴 |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| **PR-0（本 PR）**                | 階段一/二文件、`/api/health`、manifest 驗證器 `appManifest.mjs`+測試                                                                                             | —    |
| **PR-1 員工母檔**                | `employees`/`departments` collections、`import-employees.mjs`（dry-run/--apply）、rules 全 deny + rules 測試、seed script                                        | —    |
| **PR-2 首次啟用**                | `POST /api/auth/activate`（限流/鎖定/密碼政策/冪等 createUser/custom token）、`/activate` 頁、`COMPANY_TAX_ID` env                                               | PR-1 |
| **PR-3 audit log**               | `src/lib/auditLog.mjs`、audit 寫入掛進 activate/login-event、admin 檢視分頁、indexes、TTL                                                                        | PR-1 |
| **PR-4 Registry 欄位擴充 + ACL** | `canAccessApp` 純函式、M1 migration script、rules 收斂（先盤點 client 直讀點）、`GET /api/apps`、`POST /api/apps/{id}/open`（audit+跳轉）、ToolCard 改走過濾清單 | PR-3 |
| **PR-5 註冊 API**                | `POST/PATCH /api/registry/apps`（吃 manifest、pending 審核）、developer owner 檢查                                                                               | PR-4 |
| **PR-6 admin 權限 UI**           | 權限分頁（visibility/allowed_* 編輯 + PERMISSION_CHANGE audit）、員工管理分頁                                                                                    | PR-4 |
| **PR-7 收藏 + health 巡檢**      | `favoriteAppIds` + UI；`/api/cron/health-poll`（fetchWithTimeout、SSRF guard）+ 卡片狀態點                                                                       | PR-4 |

每個 PR 的 Firestore rules 變更照既有紀律：rules 測試先行 → Jason Console 手動發布（SA 無 `firebaserules.releases.create` 權限）。migration 照 AGENTS.md：code merge → deploy → 記 UTC 時間 → `--apply` → live 驗證；回滾靠 PITR（`docs/runbooks/firestore-dr.md` 情境 A）。

## 2. 階段四測試矩陣

| 層         | 工具（全既有，零新依賴）                                                                                                        | 涵蓋                                                                   |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 單元       | `npm run test:unit`（node --test，目前 160+）                                                                                   | canAccessApp 全分支、manifest 驗證、密碼政策、audit 組裝、鎖定計數     |
| rules/整合 | `npm run test:rules`（emulator，目前 80）                                                                                       | employees/audit_logs 全 deny、tools 讀收斂、users 新欄位寫權、提權迴歸 |
| API 整合   | node --test + 注入 fake admin（既有 apiAuth 測試模式）；另備 emulator exec 腳本打真 route                                       | activate 409/401/429、open 404、registry 400/409                       |
| E2E        | 手動腳本（部署後 checklist）＋既有「代驗 live」流程；先不引入 Playwright 依賴（若總部要求自動化 E2E，單獨 PR 加 dev-only 依賴） | 登入→清單→開啟→audit 出現                                              |
| 安全       | threat-model §2 的 8 項對應測試逐項落在上述層                                                                                   | 注入/XSS/CSRF/暴力/停用/竄改 id                                        |

## 3. 階段五交付物

- **README 增補章節**：本機啟動（`npm i` → `firebase emulators:start --only firestore,auth` → `node scripts/seed-portal-dev.mjs` → `npm run dev`）、測試指令、部署（merge main 即 Vercel prod；rules 手動發布步驟）、rollback（Vercel instant rollback + `git revert` + PITR）。
- **`.env.example`**（只放 key 名）：`FIREBASE_SERVICE_ACCOUNT`、`COMPANY_TAX_ID`、`CRON_SECRET`、`GEMINI_API_KEY`、`DISCORD_WEBHOOK_URL`、`NEXT_PUBLIC_FIREBASE_*`。
- **新子系統註冊教學**（docs/portal/README 段落）：① 在子系統 repo 放 `app-manifest.yaml`（照 example）② 向 admin 要 developer 角色 ③ `POST /api/registry/apps` 或請 admin 在後台代填 ④ admin 審核 → 發布當下自動出現在入口網 + Discord 公告（既有 announce 機制）——**免另行公告網址**。
- **已知限制**：統編啟用窗口風險（threat-model §3）、無 CSP、token revoke 1h 窗、staging Firebase 專案待建、E2E 為手動 checklist。

## 4. 第二階段 OIDC/SAML 遷移計畫（摘要，詳見 authentication-flow §6)

1. 確認 IdP（Entra/Workspace 存在與否 → 決定接現成 IdP 或升級 Identity Platform）。
2. Portal 先行：Portal 登入接 IdP（與員編密碼並存一個過渡季度）。
3. 子系統逐一升級：OIDC code+PKCE 接同一 IdP；Registry 只改 `authentication_mode=SSO_OIDC`、`supports_sso=true`，Portal 零重構。
4. 收斂：全數 SSO 後，員編密碼降為備援或停用；統編啟用流程退場。
