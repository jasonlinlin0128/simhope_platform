# 資料模型與 Migration（data-model.md）

> 版本：v1（2026-07-12）· 階段二交付物 · DB＝Firestore（migration＝scripts 慣例：預設 dry-run、`--apply` 才寫、冪等、PITR 為安全網——見 AGENTS.md）

## 1. Collections 總覽

規格的關聯式表格映射到 Firestore 如下（**刻意不建的表**：`roles`＝enum+自訂 slug，無需獨立表；`user_roles`＝`users.acl_roles` 陣列；`application_permissions`＝內嵌 app 文件的 `allowed_*` 三陣列——單 app ACL 名單量級小，內嵌省一次 join 且 rules 好寫；`favorites`＝`users.favoriteAppIds` 陣列。若未來名單破千再拆表）。

### `employees/{employee_id}`（新 · server-only，rules 全 deny）

| 欄位                    | 型別                 | 說明               |
| ----------------------- | -------------------- | ------------------ |
| employee_id             | string               | 主鍵（同 doc id）  |
| name                    | string               |                    |
| department_id           | string               | → departments      |
| status                  | `active`\|`inactive` | 停用員工封鎖點     |
| activated               | boolean              | 首次啟用完成       |
| uid                     | string\|null         | 綁定 Firebase Auth |
| activation_attempts     | number               | 防暴力             |
| locked_until            | timestamp\|null      |                    |
| created_at / updated_at | timestamp            |                    |

來源：`scripts/import-employees.mjs`（讀 HR CSV，dry-run/--apply，冪等 upsert，**永不**直連正式員工資料庫）。

### `departments/{department_id}`（新）

`department_id`、`name`、`parent_id`（預留層級）、`created_at/updated_at`。client 可讀（登入者），僅 admin 可寫。

### `users/{uid}`（既有，擴充）

新增：`employee_id: string|null`、`acl_roles: string[]`（僅 admin 可寫）、`favoriteAppIds: string[]`（本人可寫）、`mfa_enrolled: boolean`。既有 `role` 與其 rules 提權防護不動。

### `tools/{application_id}`（既有 ＝ Application Registry，擴充）

規格欄位 → 現況映射與新增：

| 規格欄位                                            | 現況                                             | 處理                                                                               |
| --------------------------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------- |
| application_id                                      | doc id                                           | 沿用                                                                               |
| name / description / icon                           | `title` / `desc` / `icon`                        | 沿用（映射層對齊，不改欄名——避免全站 regression）                                  |
| production_url                                      | `url`                                            | 沿用                                                                               |
| staging_url                                         | —                                                | 新增（選填）                                                                       |
| owner_department / owner_employee_id                | —                                                | 新增                                                                               |
| authentication_mode                                 | —                                                | 新增 enum：`LOCAL_ACCOUNT`\|`EXTERNAL_AUTH`\|`PUBLIC_LINK`\|`SSO_OIDC`\|`SSO_SAML` |
| supports_sso                                        | —                                                | 新增 boolean                                                                       |
| visibility                                          | —                                                | 新增 enum：`PUBLIC_ALL`\|`BY_RULE`\|`HIDDEN`                                       |
| allowed_users / allowed_departments / allowed_roles | —                                                | 新增 string[]（僅 visibility=BY_RULE 生效）                                        |
| health_check_url / repository_url                   | —                                                | 新增（選填；health 需 https 非內網）                                               |
| data_classification                                 | —                                                | 新增 enum：`public`\|`internal`\|`confidential`\|`restricted`，預設 internal       |
| status                                              | `status`（pending/live/beta/new/dev/terminated） | 沿用既有生命週期                                                                   |
| created_at / updated_at                             | `createdAt`/`updatedAt`                          | 沿用                                                                               |
| （既有）type / typeData / tags / category           | 既有                                             | 不動                                                                               |

### `audit_logs/{auto_id}`（新 · server-only 寫，admin 經 API 讀）

| 欄位                          | 說明                                                                                                                                                                           |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ts                            | server timestamp                                                                                                                                                               |
| action                        | `AUTH_ACTIVATE`\|`AUTH_LOGIN`\|`AUTH_LOGIN_FAIL`\|`APP_OPEN`\|`APP_REGISTER`\|`APP_UPDATE`\|`APP_STATUS_CHANGE`\|`PERMISSION_CHANGE`\|`EMPLOYEE_IMPORT`\|`EMPLOYEE_DEACTIVATE` |
| actor_uid / actor_employee_id | 行為者（來自 verifyIdToken，不信 body）                                                                                                                                        |
| target                        | 客體（application_id / employee_id / uid）                                                                                                                                     |
| detail                        | 精簡 diff（權限變更 before/after；不含密碼類值）                                                                                                                               |
| ip / ua                       | request 來源                                                                                                                                                                   |
| result                        | `ok`\|`denied`\|`error`                                                                                                                                                        |

寫入統一走 `src/lib/auditLog.mjs`（純組裝 + 注入 adminDb，TDD）。append-only：無任何 update/delete 路徑；rules 全 deny。保留：TTL 欄位 `expireAt`＝寫入＋400 天（比照 analytics_daily 的 TTL 慣例），admin 檢視分頁只做時間+action 篩選。

索引：`audit_logs(action, ts desc)`、`audit_logs(actor_employee_id, ts desc)` → `firestore.indexes.json` 版控（既有慣例）。

## 2. Migration 清單（全部照 AGENTS.md 順序紀律：code merge → deploy → 才跑 --apply）

| #   | Script                                      | 內容                                                                                                                                                                                      | 冪等策略                                                                            |
| --- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| M1  | `scripts/migrate-tools-portal-fields.mjs`   | 既有 tools 全數 backfill：`visibility=PUBLIC_ALL`、`authentication_mode=PUBLIC_LINK`（有外連 CTA 者）或依 type 推斷、`data_classification=internal`、`supports_sso=false`、空 `allowed_*` | 已有欄位者跳過                                                                      |
| M2  | `scripts/import-employees.mjs --file <csv>` | HR 名冊 → employees                                                                                                                                                                       | 以 employee_id upsert；`--deactivate-missing` 選項將名冊外者標 inactive（預設不開） |
| M3  | `scripts/backfill-user-employee-id.mjs`     | 既有 users 依 admin 提供的對照表補 `employee_id`                                                                                                                                          | 已綁定者跳過                                                                        |

規則變更（Console 手動發布，SA 無權——既有限制）：employees/audit_logs 全 deny、tools 讀收斂、users 新欄位寫權。rules 測試先行（emulator）。

## 3. 種子資料與本機環境

`scripts/seed-portal-dev.mjs`（僅接受 emulator host，偵測到非 emulator 即拒跑）：

- 3 部門（經企室/製造部/品保部）、6 員工（含 1 inactive、1 未啟用）、3 帳號（admin/developer/viewer）
- 8 個 applications：涵蓋三種 visibility × 三種 authentication_mode × 1 個 terminated（驗「停用不顯示」）
- 少量 audit_logs 樣本

本機：`firebase emulators:start --only firestore,auth` + `npm run dev`（`.env.local` 指向 emulator）；可選 `docker-compose.dev.yml` 包 emulator。
