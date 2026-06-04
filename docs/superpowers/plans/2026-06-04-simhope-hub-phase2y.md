# SimHope Hub Phase 2.y Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ① admin 帳號管理加「移除帳號」（撤銷角色）；② LoginModal + RequestCard 拿掉點背景關閉；③ 開發者註冊 tab 加 email/密碼自助註冊。

**Architecture:** 純前端 + firestore.rules 微調，無新 collection/route/env。① 客戶端 `deleteDoc(users/{uid})`（受 `isAdmin()` 授權）；② 移除兩 modal overlay 的關閉 handler；③ `createUserWithEmailAndPassword`（primary auth，建完即登入 → 既有理由步驟）。

**Tech Stack:** Next.js 16 / React 19 / Firebase 12（client SDK）/ Tailwind 4。

**Spec:** `docs/superpowers/specs/2026-06-04-simhope-hub-phase2y-design.md`（commit `a646fa3`）。

---

## 驗證取向（同 Phase 2.x）

無測試框架。Gate：`npm run build` + `npm run lint`（無**新**錯；既有 test\*.js / ThemeProvider / tool[id] / dashboard 忽略）。互動/RWD 視覺由 controller 在 local dev 用 Chrome 驗。**Branch：** 已在 `feature-hub-phase2y`（從 main 開）。每 commit 結尾：

```
Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>
```

⚠️ Task 1 改 `firestore.rules` 須**部署後 Console 手動發布**（SA 無發布權）。

---

## 檔案結構

**修改（無新增檔）：**

- `firestore.rules` — `users` 加 `allow delete: if isAdmin()`
- `app/admin/page.jsx` — 帳號列加「🗑 移除」鈕 + `handleRemoveUser`
- `src/components/RequestCard.jsx` — 拿掉 overlay 點背景關閉
- `src/components/LoginModal.jsx` — 拿掉 overlay 點背景關閉 + 註冊 tab 加 email/密碼自助註冊

**順序：** 1 rules → 2 admin 移除 → 3 RequestCard 防誤關 → 4 LoginModal 防誤關 + email 註冊 → 5 整合。

---

## Task 1: firestore.rules — users 加 delete

**Files:** Modify `firestore.rules`

- [ ] **Step 1: 在 `match /users/{userId}` 區塊加 delete**

在 `users` 區塊的 `allow update: ...` 之後（`}` 之前）加一行：

```
      allow delete: if isAdmin();
```

完整區塊變成：

```
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
      allow delete: if isAdmin();
    }
```

- [ ] **Step 2: build（sanity；rules 不進 build）+ Commit**

Run: `npm run build` → 成功。

```bash
git add firestore.rules
git commit -m "feat(rules): users 加 delete: if isAdmin()（admin 移除帳號）

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

> ⚠️ 部署時須 Firebase Console 重新發布；未發布前「移除」會 permission-denied。

---

## Task 2: admin 移除帳號

**Files:** Modify `app/admin/page.jsx`

`deleteDoc` / `doc` / `db` 已 import（既有）。`users` / `setUsers` / `user`（目前登入者）已在 scope。

- [ ] **Step 1: 加 `handleRemoveUser`**

在既有 `handleUpdateUserRole` 函式附近（同一層）加：

```jsx
const handleRemoveUser = async (u) => {
  if (u.id === user.uid) return; // 不能移除自己
  if (
    !confirm(
      `確定移除 ${u.displayName || u.email || u.id} 的權限？\n該帳號會降回一般同仁（viewer），仍可瀏覽/使用工具。`,
    )
  )
    return;
  try {
    await deleteDoc(doc(db, "users", u.id));
    setUsers((prev) => prev.filter((x) => x.id !== u.id));
  } catch (e) {
    alert("移除失敗：" + (e.code || e.message));
  }
};
```

- [ ] **Step 2: 帳號列加「🗑 移除」鈕**

在「所有帳號」清單每列的角色 `<select>` 區塊（`app/admin/page.jsx` 約 line 450-467 的 `<div className="flex items-center gap-3 ...">` 內），於 `<select>`（+ 既有 `(目前帳號)` span）之後加一顆移除鈕：

```jsx
<button
  onClick={() => handleRemoveUser(u)}
  disabled={u.id === user.uid}
  className="px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm font-bold hover:bg-red-100 dark:hover:bg-red-900/40 transition disabled:opacity-40 disabled:cursor-not-allowed"
  title={u.id === user.uid ? "不能移除自己" : "移除此帳號權限"}
>
  🗑 移除
</button>
```

> 放在 `disabled={u.id === user.uid}` 的 select 同一個 flex 容器內，與 `(目前帳號)` span 並列即可。

- [ ] **Step 3: build + lint + 視覺實測（controller）**

Run: `npm run build` → 成功；`npm run lint app/admin/page.jsx` → 無新錯。
Controller（admin 登入 local）：帳號管理每列出現「🗑 移除」；自己那列 disabled；點別人 → 確認框 → 該列消失（Firestore users 文件刪除，**需 Task 1 rules 已發布才會成功**；本機若連 prod 未發布會 alert permission-denied）。

- [ ] **Step 4: Commit**

```bash
git add app/admin/page.jsx
git commit -m "feat(admin): 帳號管理加移除帳號（撤銷角色，自己不可移除）

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

## Task 3: RequestCard 防誤關

**Files:** Modify `src/components/RequestCard.jsx`

- [ ] **Step 1: 拿掉 overlay 點背景關閉**

RequestCard 最外層 overlay 目前是：

```jsx
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
```

把 `onClick={onClose}` 移除：

```jsx
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
```

（內層卡片的 `onClick={(e) => e.stopPropagation()}` 可保留，無害；✕ 與「關閉」按鈕仍照常關。）

- [ ] **Step 2: build + 視覺實測（controller）+ Commit**

Run: `npm run build` → 成功。
Controller：開提需求卡 → 點外圍模糊區 → **不關**；填到一半點背景不會消失；只 ✕ / 送出後「關閉」會關。

```bash
git add src/components/RequestCard.jsx
git commit -m "fix(request): RequestCard 拿掉點背景關閉（防誤關、不丟輸入）

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

## Task 4: LoginModal 防誤關 + email/密碼自助註冊

**Files:** Modify `src/components/LoginModal.jsx`

四個改動：(A) import 加 `createUserWithEmailAndPassword`；(B) `confirmPassword` state；(C) `mapAuthErr` 加 3 個錯誤碼 + `handleEmailSignup`；(D) overlay 拿掉點背景關閉；(E) 註冊 tab `!user` 分支加 email/密碼註冊表單。

- [ ] **Step 1: import + state**

(A) 檔頭 firebase/auth import 從：

```jsx
import {
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
} from "firebase/auth";
```

改成（加 `createUserWithEmailAndPassword`）：

```jsx
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
} from "firebase/auth";
```

(B) 在 `const [applied, setApplied] = useState(false);` 之後加：

```jsx
const [confirmPassword, setConfirmPassword] = useState("");
```

- [ ] **Step 2: mapAuthErr 加 3 碼 + handleEmailSignup**

(C) 在 `mapAuthErr` 物件內（既有錯誤碼之後、`})[err.code]` 之前）加三行：

```jsx
      "auth/email-already-in-use": "此 email 已註冊，請改用「登入」分頁。",
      "auth/weak-password": "密碼至少 6 碼。",
      "auth/invalid-email": "email 格式不正確。",
```

在 `handlePasskeyForRegister` 之後加 `handleEmailSignup`（建完帳號**不關** modal → user 狀態更新後註冊 tab 自動顯示理由表單）：

```jsx
const handleEmailSignup = async () => {
  if (!email || !password) return setError("請填寫 email 與密碼");
  if (password.length < 6) return setError("密碼至少 6 碼");
  if (password !== confirmPassword) return setError("兩次密碼不一致");
  setError("");
  setLoading(true);
  try {
    await createUserWithEmailAndPassword(auth, email, password);
    // 不關 modal：登入後 user 狀態更新 → 註冊 tab 自動進「填理由」步驟
  } catch (err) {
    setError(mapAuthErr(err));
  } finally {
    setLoading(false);
  }
};
```

- [ ] **Step 3: 拿掉 overlay 點背景關閉**

(D) 最外層 overlay 目前：

```jsx
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
```

改成（移除 onClick）：

```jsx
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm">
```

- [ ] **Step 4: 註冊 tab `!user` 分支加 email/密碼註冊**

(E) 在註冊 tab 的 `!user` 分支內（`<>...passkey 按鈕...</>`），於 passkey 按鈕（`{showPasskey && (...)}`）之後、該 fragment `</>` 之前，加「或用 email 註冊」分隔 + 表單：

```jsx
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-[var(--color-card-border)]" />
                  <span className="text-xs font-bold text-[var(--color-text-mid)]">
                    或用 email 註冊
                  </span>
                  <div className="flex-1 h-px bg-[var(--color-card-border)]" />
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@simhope.com.tw"
                  className="w-full px-4 py-2.5 rounded-xl border border-[var(--color-card-border)] bg-[var(--color-card-bg)] text-[var(--color-text-dark)] font-semibold text-sm outline-none focus:border-[var(--color-clay-purple)]"
                />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="密碼（至少 6 碼）"
                  className="w-full px-4 py-2.5 rounded-xl border border-[var(--color-card-border)] bg-[var(--color-card-bg)] text-[var(--color-text-dark)] font-semibold text-sm outline-none focus:border-[var(--color-clay-purple)]"
                />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="再次輸入密碼"
                  className="w-full px-4 py-2.5 rounded-xl border border-[var(--color-card-border)] bg-[var(--color-card-bg)] text-[var(--color-text-dark)] font-semibold text-sm outline-none focus:border-[var(--color-clay-purple)]"
                />
                <button
                  type="button"
                  onClick={handleEmailSignup}
                  disabled={loading}
                  className="w-full py-3 rounded-xl bg-gradient-to-br from-[var(--color-clay-purple)] to-[var(--color-clay-blue)] text-white font-extrabold text-sm shadow-md disabled:opacity-60"
                >
                  {loading ? "建立中..." : "建立帳號並繼續"}
                </button>
```

> 流程：建立成功 → `auth` 登入該新帳號 → `useAuth` 的 `user` 更新 → 註冊 tab 重渲染進入 `!user` 為 false → 落到「已登入 viewer」分支顯示理由表單（與 Google/passkey 註冊後一致）。

- [ ] **Step 5: build + lint + 視覺實測（controller）**

Run: `npm run build` → 成功；`npm run lint src/components/LoginModal.jsx` → 無新錯。
Controller（local，登出狀態）：

1. 開 modal → 點外圍模糊區 **不關**（只 ✕ 關）。
2. 開發者註冊 tab → 出現 Google/passkey **＋「或用 email 註冊」email/密碼/確認密碼/建立帳號並繼續**。
3. 密碼 <6 → 「密碼至少 6 碼」；兩次不一致 → 「兩次密碼不一致」（前端擋、不送出）。
4. 填新 email + 密碼 + 確認 → 建立 → 自動進「填理由」→ 送出申請 → 「審核中」。（會真的建一個 Firebase Auth 帳號 + 登入；測試用可拋棄 email。）
5. 用該 email/密碼到「登入」tab → 可登入。
6. email 重複 → 「此 email 已註冊，請改用登入」。

- [ ] **Step 6: Commit**

```bash
git add src/components/LoginModal.jsx
git commit -m "feat(auth): LoginModal 拿掉點背景關閉 + 開發者註冊加 email/密碼自助註冊

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

## Task 5: 整合驗收

- [ ] **Step 1: 全量 build + lint**

Run: `npm run build` → 成功；`npm run lint` → 無新錯（既有 pre-existing 忽略）。

- [ ] **Step 2: 對照 spec §6 驗收逐項（controller，local + Chrome）**

帳號管理移除（自己 disabled、確認框、列消失）；LoginModal + RequestCard 點背景不關、只 ✕；開發者 email/密碼註冊（驗證擋、建立→理由→申請、重複 email 提示、之後可登入）；RWD（移除鈕、註冊表單手機寬度）。

- [ ] **Step 3: 用 superpowers:finishing-a-development-branch 決定合併（建議開 PR）。**

- [ ] **Step 4: 部署待辦（人工）**

1. merge PR → Vercel deploy 綠燈。
2. **Firebase Console 重新發布 `firestore.rules`**（users delete）—— 否則 admin「移除」會 permission-denied。
3. 連 live 驗證：移除一個測試帳號（降回 viewer）、modal 防誤關、email/密碼註冊→登入。

---

## Self-Review（plan 對照 spec）

- **spec §1 移除帳號**：Task 1（rules users delete）+ Task 2（移除鈕 + handleRemoveUser，自己 disabled + confirm + deleteDoc + setUsers filter）。✅
- **spec §2 Modal 防誤關**：Task 3（RequestCard overlay）+ Task 4 Step 3（LoginModal overlay）。✅
- **spec §3 email/密碼註冊**：Task 4 Step 1-2-4（import + state + handler + 錯誤碼 + 表單；createUserWithEmailAndPassword → 不關 → 理由步驟）。✅
- **Placeholder 掃描**：各 step 附實際碼/精確錨點，無 TBD。✅
- **型別一致性**：`handleRemoveUser(u)` 用 `u.id`/`u.email`/`u.displayName`（與 users 文件欄位一致）；`handleEmailSignup` 用既有 `email`/`password` state + 新 `confirmPassword`；`mapAuthErr` 錯誤碼鍵與 Firebase 一致；overlay 移除 onClick 後內層 stopPropagation 仍在（無害）。✅

---

## 已知取捨 / backlog

- 移除 = 刪 users 文件（撤銷角色），不刪 Firebase Auth（spec §1.1）；徹底封鎖登入/網域白名單 = 未來題。
- email/密碼自助註冊不限網域、不寄驗證信（spec §3.2）；role 仍需 admin 核准。
- LoginModal 登入 tab 與註冊 tab 共用 `email`/`password` state（切 tab 值會留存）——可接受。
