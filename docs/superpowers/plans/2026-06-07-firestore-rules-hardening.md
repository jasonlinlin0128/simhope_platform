# Firestore Rules 硬化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 替 `firestore.rules` 的 tools/painCards `update` 加欄位守門，堵掉「作者自助把 pending 工具改 live 繞過審核」(P0) 與 authorUid 竄改 (P1)，並用 Firebase emulator 單元測試鎖住行為。

**Architecture:** 純 rules 改動（不動 client code）。每個 task 自成一個 red→green→commit 循環。安全欄位（status/authorUid）用 plain-equality fail-closed，createdAt 用 `.keys()` guarded；painCards update/delete 收斂為僅 admin。

**Tech Stack:** Firebase Security Rules、`@firebase/rules-unit-testing` v4、`firebase-tools`（emulator）、firebase client SDK（已是 dep）、firebase-admin（盤點腳本，已是 dep）。

> **設計來源**：`docs/superpowers/specs/2026-06-07-firestore-rules-hardening-design.md`。

---

## 環境：Java（emulator 依賴）

Firebase emulator 需要 Java。本機已裝免安裝 JDK：

- **JDK 路徑**：`C:\Users\user\.jdks\temurin21\jdk-21.0.11+10`（Temurin 21 LTS）
- `JAVA_HOME` 已設在 User 環境變數 → **新開的 terminal** 會自動帶到，可直接 `npm run test:rules`。
- **但這個 session 的 tool-call shell 不會繼承**（繼承到舊 env block）。在這種 shell 跑 `npm run test:rules` 前，先帶上 JAVA 前綴（PowerShell）：

```powershell
$env:JAVA_HOME="C:\Users\user\.jdks\temurin21\jdk-21.0.11+10"; $env:PATH="$env:JAVA_HOME\bin;$env:PATH"; npm run test:rules
```

> 下文凡是「跑 `npm run test:rules`」的步驟，若 shell 內 `java -version` 失敗，一律改用上面這行（帶 JAVA 前綴）。

---

## File Structure

| 檔案                                    | 動作 | 責任                                                            |
| --------------------------------------- | ---- | --------------------------------------------------------------- |
| `package.json`                          | 改   | 加 devDeps + `test:rules` script                                |
| `firebase.json`                         | 改   | 加 firestore emulator 設定                                      |
| `firestore.rules.test.mjs`              | 建   | emulator rules 單元測試（harness + 15 條矩陣，自帶迷你 runner） |
| `firestore.rules`                       | 改   | tools/painCards update 守門 + helper 函式                       |
| `scripts/__audit-tool-fields.mjs`       | 建   | 唯讀盤點：列出缺 authorUid/status/createdAt 的 tools            |
| `docs/optimization-audit-2026-06-07.md` | 改   | 完工後把 S1/S2 標記為已修                                       |

**Task 切割原則**：每個 task 自成 red→green→commit，不跨 task 留未 commit 的紅燈測試。

---

## Task 1: Emulator 測試基建（harness + smoke，green commit）

**Files:**

- Modify: `package.json`（devDependencies + scripts）
- Modify: `firebase.json`
- Create: `firestore.rules.test.mjs`（harness + seed + 1 條 smoke）

- [ ] **Step 1: 安裝測試相依**

Run:

```bash
npm install -D @firebase/rules-unit-testing@^4 firebase-tools@^14
```

Expected: devDependencies 多兩個套件，無錯誤。

- [ ] **Step 2: `firebase.json` 加 emulator 設定**

把現有 `firebase.json`：

```json
{
  "firestore": {
    "rules": "firestore.rules"
  },
  "storage": {
    "rules": "storage.rules"
  }
}
```

改為：

```json
{
  "firestore": {
    "rules": "firestore.rules"
  },
  "storage": {
    "rules": "storage.rules"
  },
  "emulators": {
    "firestore": {
      "port": 8080
    },
    "singleProjectMode": true
  }
}
```

- [ ] **Step 3: `package.json` 加 `test:rules` script**

`scripts` 區塊改為：

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "eslint",
  "test:rules": "firebase emulators:exec --only firestore --project demo-simhope-rules \"node firestore.rules.test.mjs\""
}
```

- [ ] **Step 4: 建 `firestore.rules.test.mjs`（完整 harness + smoke）**

Create `firestore.rules.test.mjs`:

```js
// Firestore Security Rules 單元測試（跑在 Firebase emulator 上）。
// 執行：npm run test:rules（shell 需有 java；見 plan 的「環境：Java」）。
import { readFileSync } from "node:fs";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from "@firebase/rules-unit-testing";
import { doc, setDoc, updateDoc, deleteDoc, getDoc } from "firebase/firestore";

const PROJECT_ID = "demo-simhope-rules";
let passed = 0;
let failed = 0;

const testEnv = await initializeTestEnvironment({
  projectId: PROJECT_ID,
  firestore: { rules: readFileSync("firestore.rules", "utf8") },
});

const anon = testEnv.unauthenticatedContext().firestore();
const dev1 = testEnv.authenticatedContext("dev1").firestore();
const dev2 = testEnv.authenticatedContext("dev2").firestore();
const admin = testEnv.authenticatedContext("admin1").firestore();

// 每條測試前清空並重新種子 → 測試彼此獨立。
async function seed() {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "users", "admin1"), { role: "admin" });
    await setDoc(doc(db, "users", "dev1"), { role: "developer" });
    await setDoc(doc(db, "users", "dev2"), { role: "developer" });
    await setDoc(doc(db, "users", "viewer1"), { email: "v@x.com" }); // 無 role
    await setDoc(doc(db, "tools", "t_pending"), {
      authorUid: "dev1",
      status: "pending",
      createdAt: 1000,
      title: "P",
    });
    await setDoc(doc(db, "tools", "t_live"), {
      authorUid: "dev1",
      status: "live",
      createdAt: 1000,
      title: "L",
    });
    await setDoc(doc(db, "tools", "t_legacy_nocreated"), {
      authorUid: "dev1",
      status: "pending",
      title: "NoCreated", // 缺 createdAt
    });
    await setDoc(doc(db, "painCards", "pc1"), {
      approval: "approved",
      before: "b",
      after: "a", // 正式資料：無 authorUid
    });
    await setDoc(doc(db, "painCards", "pc_dev1"), {
      authorUid: "dev1",
      approval: "pending",
      before: "b",
      after: "a",
    });
  });
}

async function it(name, fn) {
  await seed();
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.error(`  ✗ ${name}\n    ${e.message}`);
  }
}

// ===== TESTS START =====
console.log("smoke:");
await it("smoke: 未登入讀 tools → ALLOW", async () => {
  await assertSucceeds(getDoc(doc(anon, "tools", "t_pending")));
});
// ===== TESTS END =====

await testEnv.cleanup();
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
```

- [ ] **Step 5: 跑 smoke（驗證基建）**

Run（shell 無 java 時帶 JAVA 前綴，見「環境：Java」）:

```bash
npm run test:rules
```

Expected: emulator 啟動，輸出 `1 passed, 0 failed`，exit 0。

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json firebase.json firestore.rules.test.mjs
git commit -m "test(rules): 建 Firebase emulator rules 測試基建 + smoke test" -m "Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

## Task 2: tools 守門（測試 RED → 改 rules GREEN → commit）

**Files:**

- Modify: `firestore.rules.test.mjs`（用 tools 測試矩陣取代 smoke）
- Modify: `firestore.rules`

- [ ] **Step 1: 用 tools 測試矩陣取代 smoke 區塊**

把 `firestore.rules.test.mjs` 中 `// ===== TESTS START =====` 與 `// ===== TESTS END =====` 之間（含 smoke）整段替換為：

```js
// ===== TESTS START =====
console.log("tools:");
await it("1. 作者改自己 pending 工具內容 → ALLOW", async () => {
  await assertSucceeds(
    updateDoc(doc(dev1, "tools", "t_pending"), {
      url: "https://x",
      type: "webapp",
    }),
  );
});
await it("2. 作者把自己工具 status 改 live（P0） → DENY", async () => {
  await assertFails(
    updateDoc(doc(dev1, "tools", "t_pending"), { status: "live" }),
  );
});
await it("3. 作者改自己工具 authorUid → DENY", async () => {
  await assertFails(
    updateDoc(doc(dev1, "tools", "t_pending"), { authorUid: "dev2" }),
  );
});
await it("4. 作者改自己工具 createdAt → DENY", async () => {
  await assertFails(
    updateDoc(doc(dev1, "tools", "t_pending"), { createdAt: 9999 }),
  );
});
await it("5. admin 改任一工具 status → ALLOW", async () => {
  await assertSucceeds(
    updateDoc(doc(admin, "tools", "t_pending"), { status: "beta" }),
  );
});
await it("6. admin 改工具 authorUid（轉移） → ALLOW", async () => {
  await assertSucceeds(
    updateDoc(doc(admin, "tools", "t_live"), { authorUid: "dev2" }),
  );
});
await it("7. 非作者非 admin 改別人的工具 → DENY", async () => {
  await assertFails(
    updateDoc(doc(dev2, "tools", "t_pending"), { url: "https://y" }),
  );
});
await it("8. developer create status:'live' → DENY", async () => {
  await assertFails(
    setDoc(doc(dev1, "tools", "t_new_live"), {
      authorUid: "dev1",
      status: "live",
      createdAt: 1,
    }),
  );
});
await it("9. developer create status:'pending'、authorUid 自己 → ALLOW", async () => {
  await assertSucceeds(
    setDoc(doc(dev1, "tools", "t_new_pending"), {
      authorUid: "dev1",
      status: "pending",
      createdAt: 1,
    }),
  );
});
await it("10. 作者編輯缺 createdAt 的舊工具內容（不 brick） → ALLOW", async () => {
  await assertSucceeds(
    updateDoc(doc(dev1, "tools", "t_legacy_nocreated"), { url: "https://z" }),
  );
});
await it("11. 作者刪自己工具 → ALLOW", async () => {
  await assertSucceeds(deleteDoc(doc(dev1, "tools", "t_live")));
});
await it("12. 非作者刪別人工具 → DENY", async () => {
  await assertFails(deleteDoc(doc(dev2, "tools", "t_pending")));
});
// ===== TESTS END =====
```

- [ ] **Step 2: 跑測試，確認 RED**

Run `npm run test:rules`（帶 JAVA 前綴）。
Expected: `9 passed, 3 failed`，失敗為 **#2、#3、#4**（現行規則無守門，本該 DENY 的動作目前 ALLOW）。exit 1。先別 commit。

- [ ] **Step 3: 在 `firestore.rules` 加欄位不變式 helper**

在 `roleIsViewerOrAbsent` 函式（約 firestore.rules:15-17）之後、`match /users` 之前插入：

```
    // 欄位不變式：非 admin 編輯自己文件時必須成立。
    // status / authorUid 用 plain equality（fail-closed：現值缺欄位→error→作者分支false→只有admin能改）。
    // createdAt 用 guarded（不敏感、舊文件可能缺，避免誤擋內容編輯）。
    function statusUnchanged() {
      return request.resource.data.status == resource.data.status;
    }
    function authorUidUnchanged() {
      return request.resource.data.authorUid == resource.data.authorUid;
    }
    function createdAtUnchanged() {
      return !('createdAt' in resource.data.keys())
        || request.resource.data.createdAt == resource.data.createdAt;
    }
```

- [ ] **Step 4: 改 tools 的 update 規則**

把現有 tools 的：

```
      allow update, delete: if isSignedIn() && (
        resource.data.authorUid == request.auth.uid || isAdmin()
      );
```

改為（作者分支在前→自編 0 次 get()）：

```
      allow update: if isSignedIn() && (
        ( resource.data.authorUid == request.auth.uid
          && authorUidUnchanged()
          && statusUnchanged()
          && createdAtUnchanged() )
        || isAdmin()
      );
      allow delete: if isSignedIn() && (
        resource.data.authorUid == request.auth.uid || isAdmin()
      );
```

（tools 的 `allow read` 與 `allow create` 不動。）

- [ ] **Step 5: 跑測試，確認 tools 全綠**

Run `npm run test:rules`（帶 JAVA 前綴）。
Expected: `12 passed, 0 failed`，exit 0。

- [ ] **Step 6: Commit（rules + 測試一起，green）**

```bash
git add firestore.rules firestore.rules.test.mjs
git commit -m "fix(rules): tools update 加欄位守門，擋作者自助改 status/authorUid 繞過審核" -m "P0：作者原可 updateDoc({status:'live'}) 繞過 admin 審核上架；P1：authorUid 可被竄改。改為非 admin 不可改 status/authorUid/createdAt，附 emulator 測試 12 條。" -m "Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

## Task 3: painCards 守門（測試 RED → 改 rules GREEN → commit）

**Files:**

- Modify: `firestore.rules.test.mjs`（追加 painCards 測試）
- Modify: `firestore.rules`

> 設計決策：現存 24 張 painCard 無 `authorUid`，加作者分支等於對既有卡 fail-closed 的死碼；全 repo 無 painCards client 寫入。依 YAGNI，update/delete 收斂為僅 admin（不需 approvalUnchanged helper）。

- [ ] **Step 1: 追加 painCards 測試（插在 `// ===== TESTS END =====` 之前）**

在 `firestore.rules.test.mjs` 的 `// ===== TESTS END =====` 那行**之前**插入：

```js
console.log("painCards:");
await it("13. developer 改自己 painCard approval → DENY", async () => {
  await assertFails(
    updateDoc(doc(dev1, "painCards", "pc_dev1"), { approval: "approved" }),
  );
});
await it("14. admin 改 painCard approval → ALLOW", async () => {
  await assertSucceeds(
    updateDoc(doc(admin, "painCards", "pc1"), { approval: "rejected" }),
  );
});
await it("15. developer create painCard approval:'pending' → ALLOW", async () => {
  await assertSucceeds(
    setDoc(doc(dev1, "painCards", "pc_new"), {
      authorUid: "dev1",
      approval: "pending",
      before: "b",
      after: "a",
    }),
  );
});
```

- [ ] **Step 2: 跑測試，確認 #13 RED**

Run `npm run test:rules`（帶 JAVA 前綴）。
Expected: `14 passed, 1 failed`，失敗為 **#13**（現行 painCards 允許作者 update approval）。exit 1。先別 commit。

- [ ] **Step 3: 改 painCards 的 update/delete 規則**

把現有 painCards 的：

```
      allow update, delete: if isSignedIn() && (
        resource.data.authorUid == request.auth.uid || isAdmin()
      );
```

改為：

```
      // 無 client 編輯流程；現存卡無 authorUid。update/delete 一律僅 admin。
      allow update, delete: if isAdmin();
```

（painCards 的 `allow read` 與 `allow create` 不動。）

- [ ] **Step 4: 跑測試，確認 15 條全綠**

Run `npm run test:rules`（帶 JAVA 前綴）。
Expected: `15 passed, 0 failed`，exit 0。

- [ ] **Step 5: Commit**

```bash
git add firestore.rules firestore.rules.test.mjs
git commit -m "fix(rules): painCards update/delete 收斂為僅 admin（擋自核准 approval）" -m "Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

## Task 4: 上線前資料盤點腳本（唯讀，讀 production）

**Files:**

- Create: `scripts/__audit-tool-fields.mjs`

> 目的：確認正式 tools 都有 `authorUid`/`status`/`createdAt`，否則缺欄位的舊工具會變「僅 admin 可編輯」。依 AGENTS.md「資料 × 程式碼順序」，發布規則前必跑。**此腳本連線正式 Firestore，但唯讀（只 .get()，不寫入）。**

- [ ] **Step 1: 建盤點腳本**

Create `scripts/__audit-tool-fields.mjs`:

```js
// 唯讀盤點：列出 tools 缺 authorUid/status/createdAt 的文件；確認 painCards 無 authorUid。
// 執行：node scripts/__audit-tool-fields.mjs（連正式 Firestore，唯讀）
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sa = JSON.parse(
  readFileSync(join(__dirname, "..", "serviceAccountKey.json"), "utf8"),
);
initializeApp({ credential: cert(sa) });
const db = getFirestore();

const tools = await db.collection("tools").get();
const missing = [];
tools.forEach((d) => {
  const x = d.data();
  const miss = [];
  if (!("authorUid" in x)) miss.push("authorUid");
  if (!("status" in x)) miss.push("status");
  if (!("createdAt" in x)) miss.push("createdAt");
  if (miss.length)
    missing.push({ id: d.id, title: x.title, missing: miss.join(",") });
});
console.log(`\ntools 共 ${tools.size} 筆；缺欄位 ${missing.length} 筆：`);
if (missing.length) console.table(missing);
else console.log("  （全部都有 authorUid/status/createdAt，可安全發布規則）");

const cards = await db.collection("painCards").get();
const withAuthor = cards.docs.filter((d) => "authorUid" in d.data()).length;
console.log(
  `painCards 共 ${cards.size} 筆；有 authorUid 的 ${withAuthor} 筆（預期 0）。`,
);

process.exit(0);
```

- [ ] **Step 2: 跑盤點（唯讀）**

Run:

```bash
node scripts/__audit-tool-fields.mjs
```

Expected: 列出缺欄位的 tools。

- 缺欄位 0 筆 → 可安全發布規則。
- 有缺 `authorUid`/`status` 者 → 人工判斷：只由 admin 維護則可接受；需作者編輯則**先寫 backfill migration 補欄位**（dry-run 預設、`--apply` 才寫、自動備份、idempotent）再發規則。把結果記到 PR 描述。

- [ ] **Step 3: Commit**

```bash
git add scripts/__audit-tool-fields.mjs
git commit -m "chore(scripts): 加 tools 欄位盤點腳本（發布 rules 前置檢查）" -m "Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

## Task 5: 收尾驗證 + 標記 backlog + PR

**Files:**

- Modify: `docs/optimization-audit-2026-06-07.md`

- [ ] **Step 1: 確認既有檢查不被破壞**

Run:

```bash
npm run lint
npm run build
```

Expected: 不新增 lint error（既有 2 errors/3 warnings 不在本次範圍）、build 成功。本次只動 rules/測試/腳本，不碰 app/src。

- [ ] **Step 2: 在 backlog 標記 S1/S2 為已修**

`docs/optimization-audit-2026-06-07.md` 第 2 節表格 S1/S2 列尾各加「✅ 已修（branch fix-firestore-rules-hardening）」，S3 註明「仍為 follow-up」。

- [ ] **Step 3: Commit + 開 PR**

```bash
git add docs/optimization-audit-2026-06-07.md
git commit -m "docs(audit): 標記 S1/S2 rules 硬化已修" -m "Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
git push -u origin fix-firestore-rules-hardening
```

PR 描述須含：Task 4 盤點結果、提醒「**merge 後需到 Firebase Console 手動發布 rules**（SA 缺 firebaserules.releases.create），再連 live 站驗證」。

---

## 上線後人工步驟（PR 描述提醒，非自動化）

1. **Firebase Console → Firestore → Rules** 貼上 merge 後的 `firestore.rules` 發布。
2. **連 live 站驗證**：
   - developer 帳號試把自己 pending 工具改 live → 應 permission-denied。
   - admin 後台改 status / 跑 wizard → 正常。
   - 作者編輯自己工具內容 → 正常。

---

## Self-Review

- **Spec coverage**：spec §4.1 helper→Task 2 Step 3；§4.2 tools→Task 2 Step 4；§4.3 painCards admin-only→Task 3 Step 3；§5 盤點→Task 4；§6 測試矩陣 15 條→Task 2/3；§7 rollout→Task 5 + 上線後步驟；§8 已知限制→測試 #11（作者可刪自己 live 工具 ALLOW）涵蓋。spec §4.1 的 `approvalUnchanged()` 因 painCards 改僅 admin 而不需要，刻意不實作（YAGNI）。
- **Commit hygiene**：每個 task 自成 red→green→commit；測試檔在轉綠的同一 task 與 rules 一起 commit，無跨 task 未 commit 紅燈。
- **Placeholder scan**：無 TBD/TODO；每個 code step 都有完整內容。
- **Type/名稱一致**：harness 的 `seed()`/`it()`/context（anon/dev1/dev2/admin）在 Task 1 定義，Task 2/3 沿用；helper 名稱 `statusUnchanged/authorUidUnchanged/createdAtUnchanged` Task 2 定義並引用，無孤兒參照。
