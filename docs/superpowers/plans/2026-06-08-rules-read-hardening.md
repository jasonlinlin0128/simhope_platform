# tools / painCards read 收緊 — 實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** firestore.rules 的 tools / painCards read 從 `if true` 收緊成「公開狀態 || 作者 || admin」，把未審內容的可見性下沉到資料層。

**Architecture:** 改 2 條 read 規則 + 補 emulator read 測試。**不改任何 code**（現有查詢全相容）。需 Jason Console 發布（SA 無發布權）。

**Tech Stack:** Firestore Security Rules v2 + `@firebase/rules-unit-testing`（emulator）。

**設計來源：** [spec](../specs/2026-06-08-rules-read-hardening-design.md)。

**驗證慣例：** `npm run test:rules`（emulator，需 Java）全綠；commit Conventional + 結尾 `Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>`。

---

## Task 1: firestore.rules — tools / painCards read 收緊

**Files:** Modify `firestore.rules`

- [ ] **Step 1: tools read（L53）**

old：

```
    // Tools: 公開可讀，developer/admin 可建立，只有作者或 admin 可修改/刪除
    match /tools/{toolId} {
      allow read: if true;
```

new：

```
    // Tools: 公開狀態人人可讀；未公開（pending）只有作者/admin 可讀；
    //        developer/admin 可建立，只有作者或 admin 可修改/刪除。
    match /tools/{toolId} {
      allow read: if resource.data.status in ['live', 'beta', 'new', 'dev', 'terminated']
        || (isSignedIn() && resource.data.authorUid == request.auth.uid)
        || isAdmin();
```

- [ ] **Step 2: painCards read（L72）**

old：

```
    // Pain Cards: 同 tools，但用 approval 欄位（pending/approved/rejected）
    match /painCards/{cardId} {
      allow read: if true;
```

new：

```
    // Pain Cards: 已核准人人可讀；未核准只有作者/admin 可讀（用 approval 欄位）。
    match /painCards/{cardId} {
      allow read: if resource.data.approval == 'approved'
        || (isSignedIn() && resource.data.authorUid == request.auth.uid)
        || isAdmin();
```

---

## Task 2: firestore.rules.test.mjs — 補 read 測試

**Files:** Modify `firestore.rules.test.mjs`

- [ ] **Step 1: 在 `// ===== TESTS END =====` 前插入 read 測試段**

old：

```js
// ===== TESTS END =====
```

new：

```js
console.log("tools / painCards read 收緊（S3）:");
await it("28. anon 讀公開 t_live → ALLOW", async () => {
  await assertSucceeds(getDoc(doc(anon, "tools", "t_live")));
});
await it("29. anon 讀未審 t_pending → DENY", async () => {
  await assertFails(getDoc(doc(anon, "tools", "t_pending")));
});
await it("30. dev2（非作者非 admin）讀 t_pending → DENY", async () => {
  await assertFails(getDoc(doc(dev2, "tools", "t_pending")));
});
await it("31. dev1（作者）讀自己 t_pending → ALLOW", async () => {
  await assertSucceeds(getDoc(doc(dev1, "tools", "t_pending")));
});
await it("32. admin 讀 t_pending → ALLOW", async () => {
  await assertSucceeds(getDoc(doc(admin, "tools", "t_pending")));
});
await it("33. viewer（無 role）讀公開 t_live → ALLOW", async () => {
  await assertSucceeds(getDoc(doc(viewer1, "tools", "t_live")));
});
await it("34. anon 讀已核准 pc1 → ALLOW", async () => {
  await assertSucceeds(getDoc(doc(anon, "painCards", "pc1")));
});
await it("35. anon 讀未核准 pc_dev1 → DENY", async () => {
  await assertFails(getDoc(doc(anon, "painCards", "pc_dev1")));
});
await it("36. dev1（作者）讀自己 pc_dev1 → ALLOW", async () => {
  await assertSucceeds(getDoc(doc(dev1, "painCards", "pc_dev1")));
});
await it("37. admin 讀 pc_dev1 → ALLOW", async () => {
  await assertSucceeds(getDoc(doc(admin, "painCards", "pc_dev1")));
});
// ===== TESTS END =====
```

> `getDoc`/`assertSucceeds`/`assertFails` 與 anon/dev1/dev2/admin/viewer1 contexts、fixtures 皆既有，免新 import。

---

## Task 3: 跑 emulator 測試 + commit

**Files:** 無（驗證）+ commit T1/T2

- [ ] **Step 1: 確認 Java 可用（emulator 需要）**

Run: `java -version`
若無 Java：跳過本地跑，於 PR 標明「需 CI / Jason 端跑 test:rules」；仍 commit（規則 + 測試碼）。

- [ ] **Step 2: 跑 rules 測試**

Run: `npm run test:rules`
Expected: `37 passed, 0 failed`（既有 1–27 + 新 28–37 全綠）。特別確認 28/33/34（公開 ALLOW）與 29/30/35（未審 DENY）。

- [ ] **Step 3: commit**

```bash
git add firestore.rules firestore.rules.test.mjs
git commit -m "fix(rules): tools/painCards read 收緊 — pending 未審內容資料層不外洩 (audit S3)

read: if true → 公開狀態(tools=status / painCards=approval) || 作者 || admin。
未審內容不再對任何知道 doc id 的人可讀。現有查詢全相容（公開頁 where 過第一條、
admin 無約束 list 過 isAdmin、dashboard 過作者條）→ 不需改 code。補 10 條
emulator read 測試（公開 ALLOW / 未審 DENY / 作者+admin ALLOW）。

⚠️ merge ≠ 生效：SA 無 firebaserules.releases.create → 需 Jason 在 Firebase
Console 手動貼上發布，發布後立即 live 驗首頁仍 14 工具（P0 教訓）。

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

## 完成後

- 推 `feature-rules-read-hardening` → 開 PR（base main；body：§4 相容性表、§6 Console 發布步驟 + P0 live 驗清單、**「merge ≠ 生效，需 Jason 發布」**醒目標註）。
- 獨立 reviewer subagent（對抗式，聚焦「公開可見性是否被收壞」「list query 相容性」「非存在 doc / 缺欄位 fixture 行為」）→ CI/Vercel 綠 → 等 Jason merge + Console 發布 + live 驗。

---

## Self-Review（plan vs spec）

- **Spec coverage**：§3.1 tools read→T1S1；§3.2 painCards read→T1S2；§5 測試→T2（10 條）+T3 跑；§6 Console→PR body。✓
- **Placeholder scan**：完整 old/new 規則 + 測試碼、exact 指令；無 TBD。✓
- **一致性**：tools 用 `status in [public]`、painCards 用 `approval == 'approved'`，兩者都 `|| (isSignedIn() && authorUid==uid) || isAdmin()`；測試涵蓋 anon/dev2/viewer DENY 未審 + 作者/admin ALLOW。✓
