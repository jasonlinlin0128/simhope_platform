# 授權模型（authorization-model.md）

> 版本：v1（2026-07-12）· 階段一交付物

## 1. 原則

1. **權威在後端**：前端只負責「把後端給的清單畫出來」；任何直接輸入 `application_id` 的路徑（`/tool/[id]`、`/api/apps/{id}/open`）都在 server 再驗一次。
2. **RBAC 為主、預留 ABAC**：判斷函式簽名固定為 `canAccessApp(subject, app)`，`subject` 是屬性包（roles、department_id、employee_id、status）——未來加 ABAC 條件（如 data_classification × 職級）只擴充純函式，不動呼叫端。
3. **fail-closed**：缺欄位、母檔缺件、role 讀不到 → 一律拒絕（沿用既有 rules 慣例，如 `roleIsViewerOrAbsent`）。

## 2. 主體（Subject）

```
subject = {
  uid,                    // Firebase Auth
  employee_id,            // users.employee_id（啟用/綁定後才有）
  status,                 // employees.status — inactive 直接全拒
  roles: string[],        // 見下
  department_id,          // employees.department_id
}
```

角色：沿用既有三角色 + 可擴充的自訂角色 slugs。

| 角色                            | 意義                                              |
| ------------------------------- | ------------------------------------------------- |
| `viewer`                        | 一般員工（預設）                                  |
| `developer`                     | 子系統開發者：可註冊/維護自己 owner 的應用        |
| `admin`                         | 管理員：Registry CRUD、權限指派、審核、audit 檢視 |
| 自訂（如 `finance`、`qa-lead`） | 只作 ACL 比對值，不帶管理能力                     |

遷移：既有 `users.role`（單值）保留為「管理層級」，新增 `users.acl_roles: string[]`（ACL 比對用）— 不動既有 rules 的提權防護（`role` 欄位仍受 `roleIsViewerOrAbsent` 保護；`acl_roles` 只有 admin 能寫）。

## 3. 客體（Application）可見性規則

```
app.visibility ∈ {
  PUBLIC_ALL,   // 全員工可見（登入即可）
  BY_RULE,      // 按 allowed_users / allowed_departments / allowed_roles 聯集
  HIDDEN,       // 只有 owner + admin 可見（開發中/下架保留）
}
```

判斷（純函式 `src/lib/appAccess.mjs`，TDD）：

```
canAccessApp(subject, app):
  app.status ∉ {live, beta, new}            → false（停用系統不顯示，測試 4-9）
  subject.status != active                  → false（停用員工，測試 4-8）
  admin 或 app.owner_employee_id == subject.employee_id → true
  visibility == PUBLIC_ALL                  → true
  visibility == HIDDEN                      → false
  visibility == BY_RULE →
    employee_id ∈ allowed_users
    ∨ department_id ∈ allowed_departments
    ∨ roles ∩ allowed_roles ≠ ∅
```

## 4. 執行點（enforcement points）

| 路徑                | 機制                                                                                                                                                               |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 首頁 / hub 清單     | server（RSC/`GET /api/apps`）以 `canAccessApp` 過濾後才回傳；**BY_RULE/HIDDEN 的 app 資料不落入任何 client payload**                                               |
| 開啟應用            | `POST /api/apps/{id}/open`：verifyIdToken → canAccessApp → 寫 audit → 回 302/URL。前端竄改 id 在此擋下（測試 4-10）                                                |
| 詳情頁 `/tool/[id]` | server component 同樣過 canAccessApp，不通過回 404（不洩漏存在性）                                                                                                 |
| Registry 寫入       | `requireRole(["admin"])`；developer 只能改 `owner_employee_id == 自己` 的 app（route 層驗，不信 client）                                                           |
| Firestore rules     | `tools` 客端讀取收斂為 `visibility == 'PUBLIC_ALL' && status in [live,beta,new]`；BY_RULE/HIDDEN 只能經 server（Admin SDK）讀。`employees`、`audit_logs` 全 deny。 |

> ⚠️ rules 收斂是本設計裡唯一會影響既有讀取路徑的變更：現有 client 直讀 `tools` 的元件（admin 後台等走 Admin SDK/既有權限者除外）需盤點，遷移計畫見 [delivery-plan.md](delivery-plan.md) PR-4。既有工具 migration 時全部 backfill `visibility=PUBLIC_ALL`，行為不變。

## 5. 權限指派流程

- admin 在 `/admin` 權限分頁編輯 app 的 `allowed_*` 三欄；每次變更寫 `audit_logs`（action: `PERMISSION_CHANGE`，含 before/after diff）。
- 個人層例外（allowed_users）優先於部門/角色（聯集模型天然如此），不需要 deny 名單（YAGNI；若未來要 deny，ABAC 擴充點處理）。

## 6. ABAC 擴充點（預留，不實作）

- `canAccessApp(subject, app, context = {})`：`context` 保留時間、IP、裝置等屬性。
- `data_classification`（public/internal/confidential/restricted）已入 Registry schema——未來政策如「restricted 需 MFA」即為第一個 ABAC 規則。
