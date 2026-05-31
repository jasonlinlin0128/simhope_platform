# Phase A：Google 登入 + 資安加固 — 設計 spec

> **建立日期**：2026-05-29
> **狀態**：✅ **implemented & deployed 2026-05-29**（PR #6 merged；firestore.rules 加固版已發布並複驗；Jason 實測 Google 登入成功進 admin）
> **範圍**：登入認證系統的 Phase A。Phase B（passkey / Face ID）、Phase C（LINE 登入）另開 spec。

---

## 0. 背景與動機

### 觸發點

Jason 無法登入 admin。調查 Firebase Auth 後發現：

| email                    | provider       | role                |
| ------------------------ | -------------- | ------------------- |
| jasonlin@simhope.com.tw  | **google.com** | admin               |
| jasonlin910128@gmail.com | google.com     | （無 role＝viewer） |
| porter.wu@simhope.com.tw | password       | developer           |
| testdev@simhope.com      | password       | developer           |

**關鍵事實**：`jasonlin@simhope.com.tw` 的 admin 帳號**只有 google.com provider、沒有密碼**。
但現行 `LoginModal` 只做 email/密碼登入 → 所以 Jason 被鎖在外面。
加 Google 登入按鈕後，他立刻能進 admin（不需重設任何密碼）。

### 順帶發現的資安漏洞（必修）

`firestore.rules` 的 `users` create 規則沒限制 role：

```
allow create: if request.auth.uid == userId || isAdmin();
```

→ 任何登入者都能自建 `users/{自己uid}`、`role: 'admin'`，直接提權成管理員。
一旦開放「任何 Google 帳號都能登入」，這個洞就能被利用。

### 決策（來自 brainstorming）

1. **誰能登**：任何 Google 帳號都能登，但**沒角色只能瀏覽**（viewer）。developer/admin 角色由 admin 手動授予。
2. **密碼登入**：保留（porter / testdev 是密碼帳號；且公司多數同仁是 webmail 非 Google，需要密碼或未來 LINE）。
3. **首次 Google 登入**：自動建一筆無 role 的 viewer 文件（admin 才看得到、才能提拔）。
4. **passkey / Face ID**：要做，但屬 Phase B（WebAuthn 是獨立大工程，且天然依賴先用 Google/密碼登入後才能註冊 passkey）。
5. **LINE 登入**：Phase C，綁 MCP/API/LINE bot 整體規劃。

---

## 1. Google 登入（前端）

- `LoginModal.jsx` 加「🔵 用 Google 登入」按鈕，與現有 email/密碼表單並存
- 用 `signInWithPopup(auth, new GoogleAuthProvider())`
- 不限定 domain（任何 Google 帳號可登）
- 登入成功 → `ensureUserDoc()` → 關閉 modal

## 2. 首次登入自動建 viewer 文件

- 新 helper `ensureUserDoc(user)`（放 `src/lib/db.js`）：
  - `getDoc(users/{uid})`；若不存在 → `setDoc` 寫入：
    ```js
    { uid, email, displayName, photoURL, provider, createdAt: serverTimestamp() }
    // 注意：不含 role 欄位
    ```
- 在 `AuthContext` 的 `onAuthStateChanged` 內、取 profile 前呼叫 `ensureUserDoc`
- 既有有 role 的文件不會被覆蓋（只在「不存在」時建）

## 3. 資安加固 — firestore.rules

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function isSignedIn() { return request.auth != null; }
    function isAdmin() {
      return isSignedIn()
        && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }
    // 自建文件時 role 必須不存在或為 viewer（擋自我提權）
    function roleIsViewerOrAbsent(data) {
      return !('role' in data.keys()) || data.role == 'viewer';
    }

    match /users/{userId} {
      allow read: if isSignedIn();
      allow create: if isSignedIn() && (
        (request.auth.uid == userId && roleIsViewerOrAbsent(request.resource.data)) ||
        isAdmin()
      );
      allow update: if isSignedIn() && (
        (request.auth.uid == userId
          && !('role' in request.resource.data.diff(resource.data).affectedKeys())) ||
        isAdmin()
      );
      // 不開放 delete
    }

    // tools：公開可讀；developer/admin 可建（status 須 pending、authorUid 須本人）
    match /tools/{toolId} {
      allow read: if true;
      allow create: if isSignedIn()
        && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role in ['developer', 'admin']
        && request.resource.data.authorUid == request.auth.uid
        && request.resource.data.status == 'pending';
      allow update, delete: if isSignedIn() && (
        resource.data.authorUid == request.auth.uid || isAdmin()
      );
    }

    // painCards：同上，用 approval 欄位
    match /painCards/{cardId} {
      allow read: if true;
      allow create: if isSignedIn()
        && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role in ['developer', 'admin']
        && request.resource.data.authorUid == request.auth.uid
        && request.resource.data.approval == 'pending';
      allow update, delete: if isSignedIn() && (
        resource.data.authorUid == request.auth.uid || isAdmin()
      );
    }
  }
}
```

重點變化：

- 抽出 `isSignedIn()` / `isAdmin()` / `roleIsViewerOrAbsent()` helper
- **create 加 `roleIsViewerOrAbsent` 檢查** → 修提權洞
- update 維持「自己不能改 role」

## 4. 修 createDeveloperAccount（role 文件改由 admin 寫，不需 server Admin SDK）

### 問題

`src/lib/adminAuth.js` 的 `createDeveloperAccount`：前端用 secondary Firebase app 建新帳號，然後以**新使用者身分**（secondary 的 db）寫 `role: developer`。加固後（自建只能 viewer）這個 write 會被擋。

### 解法（最小改動、一樣安全，**不需 Vercel service account**）

只要改「誰來寫 role 文件」：從**新使用者**改成**admin（primary session）**。
加固後的 create 規則允許 `isAdmin()` 寫任意 role，所以 admin 寫 `users/{newUid}` with `role: developer` 是合法的。

```js
// secondary app 只負責建 auth 帳號，建完立刻 signOut
const { user } = await createUserWithEmailAndPassword(
  secondaryAuth,
  email,
  password,
);
await signOut(secondaryAuth);
// 改用 primary db（admin 仍登入中）寫 role 文件 → 受 isAdmin() 授權
await setDoc(doc(primaryDb, "users", user.uid), {
  uid: user.uid,
  email,
  displayName,
  role: "developer",
  createdBy: adminUid,
  createdAt: serverTimestamp(),
});
```

為何安全：

- role 授予的 write 由 **admin 的 session** 發出，受加固規則 `isAdmin()` 把關
- 新使用者**不能**自己寫 role（被 `roleIsViewerOrAbsent` 擋）→ 提權洞已堵
- 不必把 service account 放到 Vercel（攻擊面更小、Jason 不用多做 env 設定）

> 為什麼不用 server-side Admin SDK endpoint？那需要把 service account 憑證放進
> Vercel 環境變數，多一個要保護的密鑰 + Jason 要多做設定。Phase A 用「admin 寫文件」
> 已達到一樣的授權安全性。未來若要完全去掉 client-side secondary-app（例如改成
> 伺服器端建帳號），再於後續階段引入 Admin SDK endpoint。

### admin 後台調整

- `createDeveloperAccount` 留著但改寫（role 文件改 primary db 寫）；不刪 `adminAuth.js`
- 「提拔現有使用者」沿用 `handleUpdateUserRole` 的 `updateDoc(users/{uid}, {role})` — admin session → `isAdmin()` 通過仍可運作

## 5. 部署順序（守 AGENTS.md）

firestore.rules 屬「規則變更」，跟 code 一起上：

```
1. code merge（含 Google 登入 / ensureUserDoc / createDeveloperAccount 改寫）
2. Vercel production deploy 成功
3. 才發布加固後的 firestore.rules
4. live 站驗證：Google 登入進 admin、自建 viewer、提拔、建開發者
```

⚠️ **順序很重要**：`createDeveloperAccount` 改寫（role 文件由 admin 寫）的 code
**必須在加固 rules 發布前先 deploy**。若先發布規則、後部署 code，舊 code
（新使用者寫 role）會被新規則擋 → 建開發者功能短暫壞掉。所以：**先 code deploy → 後 rules 發布**。

### firestore.rules 發布

跟 storage.rules 一樣，SA 可能沒 `firebaserules.releases.create`（403）。
我寫 `scripts/deploy-firestore-rules.mjs`（仿 storage 版）先試；卡權限就請 Jason
在 Console → Firestore → 規則 → 貼上 → 發布。

---

## 7. 安全 review（順帶交付）

聚焦 auth/授權面，出報告涵蓋：

- firestore.rules 全部規則（users / tools / painCards）的提權與越權路徑
- API endpoints（generate / enrich-tool）的 token 驗證與 role 檢查
- client 端 admin 判斷只是 UX gating，真正權限靠 rules
- createDeveloperAccount 的 secondary-app 流程是否有殘留風險
- secrets：firebaseConfig（public，OK）、GEMINI_API_KEY（不可外洩，確認只在 server）
- backup collections 無 rules（預設 deny，OK）

---

## 8. 不在這次範圍（YAGNI / 後續）

- passkey / Face ID（WebAuthn）→ Phase B
- LINE 登入 → Phase C
- domain 限定（@simhope.com.tw only）→ 已決定不做（任何 Google 可登 + 角色控管）
- email verification 強制 → 不需要（角色由 admin 授予，已是授權邊界）

---

## 9. 涉及檔案總覽

| 檔案                                 | 動作                                       |
| ------------------------------------ | ------------------------------------------ |
| `src/components/LoginModal.jsx`      | 加 Google 登入按鈕 + handler               |
| `src/context/AuthContext.jsx`        | onAuthStateChanged 內呼叫 ensureUserDoc    |
| `src/lib/db.js`                      | 加 ensureUserDoc() helper                  |
| `firestore.rules`                    | 加固（helper + roleIsViewerOrAbsent）      |
| `src/lib/adminAuth.js`               | 改寫：role 文件由 admin(primary) 寫        |
| `app/admin/page.jsx`                 | 傳 adminUid 給 createDeveloperAccount      |
| `scripts/deploy-firestore-rules.mjs` | 新增（仿 storage 版，部署 firestore 規則） |

> 無 Vercel env 變更、無新 server endpoint — Phase A 全部在現有架構內完成。
