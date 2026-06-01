# Phase B：passkey / Face ID（WebAuthn）— 設計 spec

> **建立日期**：2026-05-29
> **狀態**：✅ **implemented & deployed 2026-05-29**（PR #7 merged；Vercel FIREBASE_SERVICE_ACCOUNT 已設；passkeys/webauthnChallenges deny 規則已發布並複驗；Jason 實測 passkey 註冊 + Face ID 登入成功）
> **前置**：Phase A（Google 登入 + 資安加固）已上線。passkey 依賴「先用 Google/密碼登入後才能註冊」。
> **決策（brainstorming）**：① service account 放 Vercel env（唯一正解，Jason OK）② usernameless 免輸入 email ③ 管理 UI = 首登提示 + dashboard 安全設定區，兩者都做。

---

## 0. 為什麼複雜

Firebase Auth 不原生支援 WebAuthn。必須自建：

- **註冊**（登入後）：瀏覽器 Face ID/指紋產生金鑰對 → 後端驗 attestation → 公鑰存 Firestore
- **登入**（免密碼）：瀏覽器 Face ID/指紋簽章 → 後端驗 assertion → 後端用 **Admin SDK 鑄 Firebase custom token** → 前端 `signInWithCustomToken`

「鑄 custom token」只能用 Admin SDK（伺服器端）→ 所以 **service account 必須放 Vercel env**。

---

## 1. 套件

- `@simplewebauthn/server`（後端 ceremony 驗證）
- `@simplewebauthn/browser`（前端 ceremony）
- `firebase-admin`：目前在 devDependencies，**移到 dependencies**（Next.js API route runtime 需要）

## 2. 伺服器端 Admin SDK

新 `src/lib/firebaseAdmin.js`：

```js
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const app = getApps().length
  ? getApps()[0]
  : initializeApp({
      credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
    });
export const adminAuth = getAuth(app);
export const adminDb = getFirestore(app);
```

- `FIREBASE_SERVICE_ACCOUNT` = serviceAccountKey.json 全文（JSON 字串），存 Vercel env（Jason 設）
- 本機 dev：放 `.env.local`（已 gitignore）

## 3. Firestore 結構（皆 server-only）

| collection           | doc id                   | 欄位                                                                       |
| -------------------- | ------------------------ | -------------------------------------------------------------------------- |
| `passkeys`           | credentialID (base64url) | `uid, publicKey, counter, transports[], deviceName, createdAt, lastUsedAt` |
| `webauthnChallenges` | 隨機 challengeId         | `challenge, uid?, type('register'\|'login'), createdAt`                    |

- 寫入/讀取**只透過 Admin SDK**（繞過 rules）
- `firestore.rules` 對這兩個 collection **拒絕所有 client 存取**：
  ```
  match /passkeys/{id} { allow read, write: if false; }
  match /webauthnChallenges/{id} { allow read, write: if false; }
  ```
- challenge 單次使用（verify 後刪除）+ TTL 5 分鐘（createdAt 檢查）

## 4. RP ID / Origin（WebAuthn 域綁定）

- 從 request `host` header 動態取：`rpID = host`（去 port）、`origin = https://${host}`
- production = `simhope-platform.vercel.app`；localhost dev = `localhost`
- passkey 綁域：prod 註冊的只能在 prod 用、preview 子網域不通用 — WebAuthn 設計如此，符合預期

## 5. API routes（6 個）

### 註冊（需登入）

1. **`POST /api/auth/passkey/register/options`**
   - Auth：Bearer idToken → 驗證 → uid
   - `generateRegistrationOptions({ rpName, rpID, userName: email, userID: uid(Uint8Array), excludeCredentials: 既有 passkeys, authenticatorSelection: { residentKey: 'required', userVerification: 'required' } })`
   - 存 `webauthnChallenges/{challengeId}` = { challenge, uid, type:'register', createdAt }
   - 回 `{ challengeId, options }`
2. **`POST /api/auth/passkey/register/verify`**
   - Auth：Bearer idToken → uid；Body：`{ challengeId, attestationResponse, deviceName }`
   - 讀 challenge doc（須 uid 相符 + type register + 未過期）
   - `verifyRegistrationResponse({ response, expectedChallenge, expectedOrigin, expectedRPID, requireUserVerification: true })`
   - 存 `passkeys/{credentialID}` = { uid, publicKey, counter, transports, deviceName, createdAt }
   - 刪 challenge；回 `{ success }`

### 登入（usernameless，免登入態）

3. **`POST /api/auth/passkey/login/options`**
   - `generateAuthenticationOptions({ rpID, allowCredentials: [], userVerification: 'required' })`（空 allowCredentials → 瀏覽器列出本域所有 resident key）
   - 存 `webauthnChallenges/{challengeId}` = { challenge, type:'login', createdAt }
   - 回 `{ challengeId, options }`
4. **`POST /api/auth/passkey/login/verify`**
   - Body：`{ challengeId, assertionResponse }`
   - 讀 challenge doc（type login + 未過期）
   - 用 assertion 的 credentialID 查 `passkeys/{credentialID}` → 拿 uid + publicKey + counter
   - `verifyAuthenticationResponse({ response, expectedChallenge, expectedOrigin, expectedRPID, credential: { id, publicKey, counter }, requireUserVerification: true })`
   - 驗 assertion 的 userHandle === 儲存的 uid（雙重確認）
   - 更新 counter + lastUsedAt；刪 challenge
   - **`adminAuth.createCustomToken(uid)`** → 回 `{ customToken }`
   - ⚠️ uid 來自**伺服器查到的 credential owner**，絕不信任 client 傳的 uid

### 管理（需登入）

5. **`GET /api/auth/passkey/list`** — Auth idToken → 回該 uid 的 passkeys（id, deviceName, createdAt, lastUsedAt）
6. **`POST /api/auth/passkey/delete`** — Auth idToken；Body `{ credentialID }` → 確認 owner 後刪

## 6. 前端

### `src/lib/passkey.js`（client helpers）

- `registerPasskey(deviceName)`：取 idToken → call register/options → `startRegistration()` → call register/verify
- `loginWithPasskey()`：call login/options → `startAuthentication()` → call login/verify → `signInWithCustomToken(auth, customToken)`
- `listPasskeys()` / `deletePasskey(id)`
- 用 `browserSupportsWebAuthn()` 偵測支援

### `LoginModal.jsx`

- 加「🔐 用 Face ID / 指紋登入」按鈕（passwordless）→ `loginWithPasskey()`
- 失敗（沒註冊過 / 不支援）給友善訊息

### dashboard 安全設定區

- 「🔐 註冊這台裝置的 Face ID / 指紋」按鈕 → `registerPasskey()`
- 列出已註冊裝置（deviceName + 最後使用）+ 刪除
- 偵測不支援時隱藏

### 首登提示 `PasskeyPrompt`

- Google/密碼登入後，若：瀏覽器支援 WebAuthn + 該使用者 passkey 數 = 0 → 彈一次「要不要設定 Face ID 快速登入？」（可略過、可設「不再提示」存 localStorage）

## 7. firestore.rules 追加

```
match /passkeys/{id} { allow read, write: if false; }
match /webauthnChallenges/{id} { allow read, write: if false; }
```

（沿用 Phase A 的 helper；其餘規則不動）

## 8. 安全要點（user 要求「不要有任何資安漏洞」）

| 風險                 | 對策                                                                                         |
| -------------------- | -------------------------------------------------------------------------------------------- |
| challenge 重放       | 單次使用（verify 後刪）+ TTL 5 分 + 隨機                                                     |
| origin/RP 偽造       | verify 檢查 expectedOrigin + expectedRPID                                                    |
| 生物辨識被略過       | requireUserVerification: true（UV flag 強制）                                                |
| authenticator 被複製 | counter 遞增檢查（不增→拒）                                                                  |
| 假冒他人登入         | custom token 的 uid 來自**伺服器查到的 credential owner**，非 client 輸入；再比對 userHandle |
| 替別人註冊 passkey   | register 需有效 idToken → 只能註冊自己的                                                     |
| client 偷讀公鑰庫    | passkeys/webauthnChallenges 規則 deny all（只 Admin SDK 存取）                               |
| service account 外洩 | 只在 Vercel server env + .env.local（gitignore）；不進 client bundle                         |

## 9. 部署順序（守 AGENTS.md）

1. Jason 設 Vercel env `FIREBASE_SERVICE_ACCOUNT`（**先設，否則 passkey API 會 500**）
2. code merge → Vercel deploy
3. 發布追加後的 firestore.rules（deny passkeys/challenges）
4. live 驗證：dashboard 註冊 passkey → 登出 → 用 Face ID 免密碼登入

> 註：firestore.rules 這次只「加更嚴」（deny 兩個新 collection），就算順序顛倒也不會弄壞既有功能（新 collection 本來就沒人用）。但仍照標準順序。

## 10. 涉及檔案

| 檔案                                             | 動作                                                                     |
| ------------------------------------------------ | ------------------------------------------------------------------------ |
| `src/lib/firebaseAdmin.js`                       | 新增（Admin SDK init）                                                   |
| `src/lib/passkey.js`                             | 新增（client helpers）                                                   |
| `app/api/auth/passkey/register/options/route.js` | 新增                                                                     |
| `app/api/auth/passkey/register/verify/route.js`  | 新增                                                                     |
| `app/api/auth/passkey/login/options/route.js`    | 新增                                                                     |
| `app/api/auth/passkey/login/verify/route.js`     | 新增                                                                     |
| `app/api/auth/passkey/list/route.js`             | 新增                                                                     |
| `app/api/auth/passkey/delete/route.js`           | 新增                                                                     |
| `src/components/LoginModal.jsx`                  | 加 passkey 登入按鈕                                                      |
| `src/components/PasskeyPrompt.jsx`               | 新增（首登提示）                                                         |
| `app/dashboard/page.jsx`                         | 加安全設定區                                                             |
| `firestore.rules`                                | deny passkeys/webauthnChallenges                                         |
| `package.json`                                   | +@simplewebauthn/server +@simplewebauthn/browser；firebase-admin 移 deps |
| Vercel env                                       | +FIREBASE_SERVICE_ACCOUNT（Jason 設）                                    |

## 11. 不在範圍（YAGNI）

- 跨裝置 passkey 同步管理（交給 OS/瀏覽器的 passkey sync，如 iCloud Keychain / Google Password Manager）
- passkey 命名自動偵測裝置型號（讓使用者自填 deviceName 即可）
- 多 RP ID / 自訂網域（之後上自訂域再處理）
