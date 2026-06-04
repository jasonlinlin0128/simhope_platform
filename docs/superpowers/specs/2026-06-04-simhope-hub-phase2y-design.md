# SimHope Hub Phase 2.y — admin 移除帳號 + Modal 防誤關 + 開發者 email/密碼自助註冊 · 設計 spec

> **建立日期**：2026-06-04
> **狀態**：📝 **設計中（待 implement）**
> **前置**：Phase 2.x（PR #10，merge `f7c835f`）已上線並驗 live（開發者自助申請+審核閘、AI 輔助提需求卡、統一收件匣、手機選單）。本 spec 沿用既有 auth（Google/passkey/密碼）、role 機制、admin tab、firestore.rules helper、AuthContext。
> **範圍**：三項 Jason 上線後的回饋強化，併入同一份 spec。
>
> 1. **① admin 移除帳號**（撤銷權限 = 降回 viewer）
> 2. **② Modal 防誤關**（LoginModal + RequestCard 拿掉點背景關閉）
> 3. **③ 開發者 email/密碼自助註冊**（註冊 tab 加 email/密碼/確認密碼）

---

## 0. 背景

Phase 2.x 上線後 Jason 用起來提的三點：

1. admin「帳號管理」只能改 role（開發者↔管理員），**無法移除帳號**。
2. 登入/註冊與提需求卡 modal **點背景就關**，輸入到一半會誤關、內容消失。
3. 開發者註冊只有 Google/passkey；希望也能**用 email/密碼自助註冊**（密碼輸入兩次防錯），之後有固定帳密可重複登入、少按幾步。

## 0.5 全域原則（沿用）

1. 用詞新手+專業都懂；RWD/UIUX。
2. 複用既有（admin tab、LoginModal、`ensureUserDoc`、firestore.rules helper `isAdmin()`、`createUserWithEmailAndPassword`）。
3. 破壞性/開放操作要有防呆（移除帳號要確認 + 不能移除自己；自助註冊只到 viewer，role 仍需 admin 核准）。
4. **改 firestore.rules 須 Firebase Console 手動發布**（SA 無發布權）。

---

## 1. ① admin 移除帳號（撤銷權限）

### 1.1 語意

「移除」＝**撤銷該帳號的角色**：刪除其 `users/{uid}` 文件 → 該人降回「一般同仁（無 role viewer）」，仍可瀏覽/使用工具，只是失去開發者/admin 身分。**不刪 Firebase Auth 帳號**（Google 登入本來就開放、刪 Auth 也擋不住重新登入；真要封鎖是另一題）。

### 1.2 UI 與行為

- `app/admin/page.jsx` 的「👥 所有帳號」清單，每列在角色下拉旁加一顆 **「🗑 移除」** 按鈕。
- **自己那列 disabled**（與既有角色下拉一致：`u.id === user.uid` 不可操作）—— 防止移除自己。
- 點「移除」→ `confirm("確定移除 ◯◯（email）的權限？該帳號會降回一般同仁。")` → 確認後 `deleteDoc(doc(db, "users", u.id))` → 重新 load 清單。
- 移除後該人 `users` 文件不存在；下次他登入時既有 `ensureUserDoc` 會重建一個無 role viewer（乾淨）。

### 1.3 firestore.rules

`users` 目前無 `delete` 規則（預設拒絕）。加：

```
match /users/{userId} {
  ...（既有 read / create / update 不動）...
  allow delete: if isAdmin();   // admin 後台移除帳號（撤銷角色）
}
```

**⚠️ 須 Console 重新發布**（否則「移除」會 permission-denied）。

### 1.4 元件

- 改：`app/admin/page.jsx`（加移除鈕 + `handleRemoveUser(u)`：confirm → deleteDoc → load）、`firestore.rules`（users delete）。

---

## 2. ② Modal 防誤關

### 2.1 行為

- **`LoginModal`**：移除最外層 overlay 的背景點擊關閉（現為 `onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}` → 拿掉該 `onClick`）。只保留右上 ✕ 與「登入/送出/關閉」成功後關閉。
- **`RequestCard`**：移除最外層 overlay 的 `onClick={onClose}`（內層卡片已 `stopPropagation`；改成 overlay 不再關閉）。只保留 ✕ / 完成後關閉。
- **不加 Esc 關閉**（保持單純，避免誤觸與多掛監聽）。

### 2.2 元件

- 改：`src/components/LoginModal.jsx`、`src/components/RequestCard.jsx`（各拿掉 overlay 的關閉 handler；保留內層 stopPropagation 與 ✕）。

---

## 3. ③ 開發者 email/密碼自助註冊

### 3.1 流程

在「開發者註冊」tab 的**未登入狀態**，於 Google/passkey 之下加「**或用 email 註冊**」分隔 + 表單：**email、密碼、再次確認密碼、「建立帳號並繼續」**。

1. 前端驗證：email 格式正確、密碼 ≥ 6 碼、兩次密碼一致 → 否則就地提示、不送出。
2. `createUserWithEmailAndPassword(auth, email, password)`（**primary auth**，建完即登入；`AuthContext` 的 `ensureUserDoc` 建無 role viewer）。
3. **不關 modal** → 自動進入既有的「填理由 → 送出申請」步驟（與 Google/passkey 註冊後相同）。
4. 之後該使用者可在「登入」tab 用該 email/密碼直接登入。

### 3.2 政策與錯誤處理

- **不限網域**（任何 email 可註冊）；**不寄驗證信**（YAGNI）——真正的開發者門檻是 admin 在收件匣核准，自助註冊只到 viewer。
- Firebase 錯誤對應（前端顯示）：
  - `auth/email-already-in-use` →「此 email 已註冊，請改用『登入』分頁。」
  - `auth/weak-password` →「密碼至少 6 碼。」
  - `auth/invalid-email` →「email 格式不正確。」
  - 兩次密碼不一致（前端先擋）→「兩次密碼不一致。」
- `createUserWithEmailAndPassword` 在 primary auth 建帳號即登入本人（不需 secondary app；那是 admin 幫別人建帳號的 `createDeveloperAccount` 場景，不在此）。

### 3.3 元件

- 改：`src/components/LoginModal.jsx`（註冊 tab 的未登入分支加 email/密碼/確認密碼欄 + signup handler + 錯誤對應；沿用既有理由步驟）。`createUserWithEmailAndPassword` 由 `firebase/auth` import。

---

## 4. 動到的檔案彙整

| 檔案                             | 變更                                                                                     |
| -------------------------------- | ---------------------------------------------------------------------------------------- |
| `app/admin/page.jsx`             | ① 每列加「🗑 移除」鈕（自己 disabled）+ `handleRemoveUser`（confirm + deleteDoc + load） |
| `src/components/LoginModal.jsx`  | ② 拿掉背景關閉；③ 註冊 tab 加 email/密碼/確認密碼自助註冊                                |
| `src/components/RequestCard.jsx` | ② 拿掉背景關閉                                                                           |
| `firestore.rules`                | ① `users` 加 `allow delete: if isAdmin()`（**Console 發布**）                            |

無新 collection / 欄位 / env / API route。

---

## 5. 風險 / 注意

1. **firestore.rules 須 Console 重新發布**（users delete）—— 否則「移除」會 permission-denied（RequestInbox 同模式，admin 會看到 alert）。
2. **移除是刪 users 文件**：不可「復原」該文件，但該人重新登入會重建 viewer（等同重置角色），且其上架的 tools/painCards（`authorUid` 綁定）不受影響——只是他暫時失去編輯權限直到再次被授角色。可接受。
3. **email/密碼自助註冊開放**（不限網域）：任何人可建 viewer 帳號，但**成為開發者仍需 admin 核准**；自助建帳號本身只到 viewer，無提權風險（沿用既有 `roleIsViewerOrAbsent` users create 規則 + ensureUserDoc 建無 role）。
4. **Modal 拿掉背景關閉後**：使用者只能用 ✕ 關 —— 確保 ✕ 在兩 modal 都明顯可點（既有都有 ✕）。
5. 沿用既有不破壞：admin 既有角色下拉/建帳號表單、LoginModal 既有登入/Google/passkey/理由流程、RequestCard 既有表單。

---

## 6. 驗收標準

- [ ] `/admin → 帳號管理` 每列有「🗑 移除」鈕；自己那列 disabled；點移除 → 確認框 → 該帳號從清單消失（users 文件刪除）→ 該人重整後降回無 role viewer。
- [ ] `users` delete 規則已發布；admin 移除成功（非 permission-denied）。
- [ ] LoginModal、RequestCard 點背景**不再關閉**；只 ✕ / 完成關閉；輸入到一半點背景不會消失。
- [ ] 開發者註冊 tab（未登入）有 Google/passkey **＋ email/密碼/確認密碼**；密碼 <6 或兩次不一致 → 前端擋並提示；建立成功 → 自動登入 → 進理由步驟 → 送出申請；之後可用該 email/密碼登入。
- [ ] email 已存在 → 提示改用登入；弱密碼/格式錯 → 對應提示。
- [ ] `npm run build` + `npm run lint`（無新錯）；RWD（移除鈕、註冊表單手機寬度）。

---

## 7. 未來 / backlog（不在本 spec）

- 完全刪除 Auth 帳號 / 網域白名單封鎖登入（若日後真需徹底封鎖某人）。
- email 驗證信、密碼強度政策強化。
- 首頁 metrics 動態化、`/faq` 起手內容（既有 backlog）。
