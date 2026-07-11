# 認證流程設計（authentication-flow.md）

> 版本：v1（2026-07-12）· 階段一交付物 · 前置閱讀：[architecture.md](architecture.md) 假設 A1–A5

## 1. 帳號模型：employees（母檔）與 users（帳號）分離

```
employees/{employee_id}        ← HR 名冊匯入，server-only（rules 全 deny）
  employee_id, name, department_id, status(active|inactive)
  activated: boolean           ← 是否已完成首次啟用
  activation_attempts, locked_until   ← 防暴力啟用
  uid: string|null             ← 綁定的 Firebase Auth uid

users/{uid}                    ← 既有 collection，登入後的 profile
  role（既有：viewer|developer|admin）
  employee_id: string|null     ← 新增：回綁員編（audit 與 ACL 用）
  favoriteAppIds: string[]     ← 新增：收藏
```

分離理由：母檔是「公司說你是誰」（HR 權威），帳號是「你證明過你是誰」（Auth 權威）；停用員工＝改母檔 `status`，登入時 server 檢查母檔即可封鎖，不必去 Firebase Auth 刪帳號。

## 2. 首次啟用流程（員編＋統編 → 個人密碼）

統編是全員相同的半公開弱密碼，**僅允許在此流程出現一次**（規格安全決策）。

```
員工 → POST /api/auth/activate { employee_id, tax_id, new_password }
  server（Admin SDK，全程後端）：
  1. IP 限流（既有 enforceRateLimit）＋ 該員編 activation_attempts ≥5 → 鎖 15 分（locked_until）
  2. 讀 employees/{employee_id}：
     - 不存在 / status != active   → 401（統一訊息「啟用資訊不正確」，不洩漏哪個欄位錯）
     - activated == true           → 409「已啟用，請直接登入」（防搶註）
     - tax_id != env.COMPANY_TAX_ID → 401 ＋ attempts++
  3. 密碼政策檢查（長度≥10、不得等於員編/統編/生日格式）
  4. adminAuth.createUser({ email: `emp${employee_id}@portal.simhope.internal`,
                            password: new_password })   ← Firebase scrypt 雜湊，永無明文落地
  5. 建 users/{uid}（role: viewer, employee_id）＋ employees 標 activated/uid
  6. 寫 audit_logs（action: AUTH_ACTIVATE）
  7. 回 custom token → client signInWithCustomToken → 直接登入
```

- 統編放 `COMPANY_TAX_ID` env，不進 DB、不進 repo。
- 步驟 4–5 需冪等處理：createUser 成功但後續寫入失敗時，重試以 email 查回 uid 續寫（不留半殘帳號）。

## 3. 日常登入

| 方式              | 流程                                                                                                                                                        | 現況         |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| 員編＋個人密碼    | client 把員編轉 alias email（確定性規則，無需查詢）→ Firebase `signInWithEmailAndPassword` → 登入後 server 於首個 API 呼叫驗 employees.status（停用即 403） | 新增         |
| Google 登入       | 既有；登入後若 users 無 employee_id，引導做一次員編綁定（走同一啟用驗證）                                                                                   | 既有＋補綁定 |
| Passkey / Face ID | 既有（WebAuthn usernameless，Admin SDK 鑄 custom token）                                                                                                    | 既有         |

登入成功由 client 打 `POST /api/auth/login-event` 記 audit（server 從 ID token 取 uid，不信任 body）。連續失敗鎖定由 Firebase Auth 內建暴力防護 + 我方 IP 限流雙層。

**停用員工封鎖點**（測試 4-8 對應）：所有受保護 API 經 `requireRole`／`requireEmployee` 時加查 `employees.status`，inactive 即 403 並 audit；可見清單過濾也以 status=active 為前提。

## 4. MFA 預留（高權限帳號）

- 第一階段：**admin 角色強烈要求綁 passkey**（既有功能，即為第二因素等級的 phishing-resistant 認證）；`/admin` 介面對未綁 passkey 的 admin 顯示常駐警示。
- 第二階段：升級 Firebase Identity Platform 後開 TOTP/SMS MFA enforcement（per-tenant policy）。資料模型已預留 `users.mfa_enrolled`。

## 5. 子系統登入模式（authentication_mode）

| 模式               | 意義                                    | Portal 行為                                                  |
| ------------------ | --------------------------------------- | ------------------------------------------------------------ |
| `LOCAL_ACCOUNT`    | 子系統自己的帳密                        | 卡片標示「需另行登入」；Portal 絕不代存/代填該密碼（非範圍） |
| `EXTERNAL_AUTH`    | 子系統接外部認證（如自家 Google OAuth） | 同上，標示認證方式                                           |
| `PUBLIC_LINK`      | 免登入                                  | 直接跳轉（仍過 ACL + audit）                                 |
| `SSO_OIDC`（預留） | 子系統作 OIDC RP                        | 階段二啟用，見下節                                           |
| `SSO_SAML`（預留） | 子系統作 SAML SP                        | 階段二啟用                                                   |

## 6. OIDC / SAML 整備（階段二路徑，不自製協議）

1. **IdP 決策**（假設 A1 解除後）：
   - 公司有 Entra ID / Google Workspace → Portal 與子系統都直接作其 RP，員編啟用流程轉為備援。
   - 沒有 → Firebase 升級 **Identity Platform**（同專案原地升級，帳號不搬遷），它原生支援 OIDC/SAML 供應商接入；或自架 Keycloak（次選，多一套維運）。
2. **子系統升級路徑**：`supports_sso=true` 的子系統逐一改接標準 OIDC（authorization code + PKCE）；Portal 端只改 Registry 的 `authentication_mode` 欄位，跳轉行為不變 → 這就是「架構預留」的實際意義：**SSO 化只動子系統與 IdP，Portal 不需重構**。
3. 過渡期兩制並存：同一員編身分，`LOCAL_ACCOUNT` 子系統維持原樣，完成 OIDC 的子系統享受單一登入。

## 7. Session / Token

- 全站以 **Firebase ID token（1h 自動輪替）** 為唯一憑證，`Authorization: Bearer` 傳遞；server 一律 `verifyIdToken`（既有 `requireRole` 模式）。
- 不用 cookie session → 無 session fixation 面、CSRF 面大幅縮小（見 threat-model §CSRF）。
- 登出＝client `signOut()`；高風險事件（權限變更）可 `revokeRefreshTokens(uid)` 強制重登。
