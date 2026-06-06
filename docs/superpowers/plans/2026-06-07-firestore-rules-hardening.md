# Firestore Rules 硬化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 替 `firestore.rules` 的 tools/painCards `update` 加欄位守門，堵掉「作者自助把 pending 工具改 live 繞過審核」(P0) 與 authorUid 竄改 (P1)，並用 Firebase emulator 單元測試鎖住行為。

**Architecture:** 純 rules 改動（不動 client code）。先建 emulator rules 測試基建 → 寫完整測試矩陣（現行規則下 4 條安全案例 RED）→ 改 `firestore.rules` 讓全綠 → 加唯讀資料盤點腳本。安全欄位（status/authorUid）用 plain-equality fail-closed，createdAt 用 `.keys()` guarded；painCards update/delete 收斂為僅 admin。

**Tech Stack:** Firebase Security Rules、`@firebase/rules-unit-testing` v4、`firebase-tools`（emulator）、firebase client SDK（已是 dep）、firebase-admin（盤點腳本，已是 dep）。

> **環境前提**：Firebase emulator 需要 Java（JDK 11+）。Windows 上若 `firebase emulators:exec` 報找不到 Java，先裝 JDK 並確認 `java -version` 可跑。
>
> **設計來源**：`docs/superpowers/specs/2026-06-07-firestore-rules-hardening-design.md`。

---

## File Structure

| 檔案                                    | 動作 | 責任                                                      |
| --------------------------------------- | ---- | --------------------------------------------------------- |
| `package.json`                          | 改   | 加 devDeps + `test:rules` script                          |
| `firebase.json`                         | 改   | 加 firestore emulator 設定                                |
| `firestore.rules.test.mjs`              | 建   | emulator rules 單元測試（15 條矩陣，自帶迷你測試 runner） |
| `firestore.rules`                       | 改   | tools/painCards update 守門 + helper 函式                 |
| `scripts/__audit-tool-fields.mjs`       | 建   | 唯讀盤點：列出缺 authorUid/status/createdAt 的 tools      |
| `docs/optimization-audit-2026-06-07.md` | 改   | 完工後把 S1/S2 標記為已修                                 |

---

## Task 1: Emulator 測試基建（含 smoke test）

**Files:**

- Modify: `package.json`（devDependencies + scripts）
- Modify: `firebase.json`
- Create: `firestore.rules.test.mjs`（先放 harness + 1 條 smoke 斷言）

- [ ] **Step 1: 安裝測試相依**

Run:

```bash
npm install -D @firebase/rules-unit-testing@^4 firebase-tools@^14
```

Expected: `package.json` 的 devDependencies 多出兩個套件，無錯誤。

- [ ] **Step 2: 在 `firebase.json` 加 emulator 設定**

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

改為（保留既有欄位，只加 `emulators`；若實際內容不同，僅新增 `emulators` 區塊）：

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

- [ ] **Step 3: 建 `firestore.rules.test.mjs`（harness + smoke test）**

Create `firestore.rules.test.mjs`:

```js
// Firestore Security Rules 單元測試（跑在 Firebase emulator 上）。
// 執行：npm run test:rules
// （= firebase emulators:exec --only firestore "node firestore.rules.test.mjs"）
import { readFileSync } from "node:fs";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from "@firebase/rules-unit-testing";
import { doc, setDoc, updateDoc, deleteDoc } from "firebase/firestore";

const PROJECT_ID = "demo-simhope-rules";

let passed = 0;
let failed = 0;

const testEnv = await initializeTestEnvironment({
  projectId: PROJECT_ID,
  firestore: { rules: readFileSync("firestore.rules", "utf8") },
});

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

// ── smoke test：未登入可讀 tools（現行規則 read:if true）──
console.log("smoke:");
const anon = testEnv.unauthenticatedContext().firestore();
await it("smoke: 未登入讀 tools → ALLOW", async () => {
  const { getDoc } = await import("firebase/firestore");
  await assertSucceeds(getDoc(doc(anon, "tools", "t_pending")));
});

await testEnv.cleanup();
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
```

- [ ] **Step 4: 加 `test:rules` script 到 `package.json`**

把 `scripts` 區塊：

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "eslint"
}
```

改為：

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "eslint",
  "test:rules": "firebase emulators:exec --only firestore \"node firestore.rules.test.mjs\""
}
```

- [ ] **Step 5: 跑 smoke test 驗證基建可動**

Run:

```bash
npm run test:rules
```

Expected: emulator 啟動，輸出 `1 passed, 0 failed`，exit 0。（若報 Java 缺失，先裝 JDK。）

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json firebase.json firestore.rules.test.mjs
git commit -m "test(rules): 建 Firebase emulator rules 測試基建 + smoke test" -m "Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

## Task 2: 寫完整測試矩陣（RED — 現行規則下 4 條安全案例失敗）

**Files:**

- Modify: `firestore.rules.test.mjs`（把 smoke 換成 15 條矩陣）

- [ ] **Step 1: 用 15 條矩陣取代 smoke 區塊**

在 `firestore.rules.test.mjs` 中，把 `// ── smoke test ...` 到 `await testEnv.cleanup();` 之間（不含 cleanup 那兩行）整段，替換為：

```js
const dev1 = testEnv.authenticatedContext("dev1").firestore();
const dev2 = testEnv.authenticatedContext("dev2").firestore();
const admin = testEnv.authenticatedContext("admin1").firestore();

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

（保留檔案最上方的 import、`seed()`、`it()` 與最後的 `await testEnv.cleanup()` + 統計輸出。記得把 smoke 區塊用到的 `anon` 移除。）

- [ ] **Step 2: 跑測試，確認 RED（4 條安全案例失敗）**

Run:

```bash
npm run test:rules
```

Expected: `11 passed, 4 failed`，失敗的是 **#2、#3、#4、#13**（現行規則無欄位守門，這四個本該 DENY 的動作目前 ALLOW，故 `assertFails` 失敗）。exit 1。

> 這是預期的 RED 狀態 —— 證明測試真的能抓到漏洞。**先別** commit（測試紅燈不入庫）。

---

## Task 3: 硬化 tools update 規則（讓 #2/#3/#4 轉綠）

**Files:**

- Modify: `firestore.rules`

- [ ] **Step 1: 在 `firestore.rules` 加欄位不變式 helper**

在 `roleIsViewerOrAbsent` 函式（約 firestore.rules:15-17）之後、`match /users` 之前，插入：

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

- [ ] **Step 2: 改 tools 的 update 規則**

把現有 tools update（約 firestore.rules:44-46）：

```
      allow update, delete: if isSignedIn() && (
        resource.data.authorUid == request.auth.uid || isAdmin()
      );
```

拆成 update（加守門、作者分支在前以省 isAdmin() 的 get()）+ delete（維持原樣）：

```
      // 作者：可改自己工具的「內容」，但不可改 status/authorUid/createdAt（作者分支在前→自編0次get）。
      // admin：不受不變式限制（改 status、轉移 authorUid 皆可）。
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

（tools 的 `allow read: if true;` 與 `allow create:` 維持不動。）

- [ ] **Step 3: 跑測試，確認 tools 全綠、painCards #13 仍紅**

Run:

```bash
npm run test:rules
```

Expected: `14 passed, 1 failed`，僅剩 **#13** 失敗（painCards 尚未改）。tools 的 #2/#3/#4 與其餘全綠。

- [ ] **Step 4: Commit**

```bash
git add firestore.rules
git commit -m "fix(rules): tools update 加欄位守門，擋作者自助改 status/authorUid 繞過審核" -m "P0：作者原可 updateDoc({status:'live'}) 繞過 admin 審核上架；P1：authorUid 可被竄改。改為非 admin 不可改 status/authorUid/createdAt。" -m "Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

## Task 4: 硬化 painCards update/delete（僅 admin，讓 #13 轉綠、全綠）

**Files:**

- Modify: `firestore.rules`

> 設計決策：現存 24 張 painCard 無 `authorUid`，加作者分支等於對既有卡 fail-closed 的死碼；且全 repo 無 painCards client 寫入。依 YAGNI，update/delete 收斂為僅 admin（不需 approvalUnchanged helper）。

- [ ] **Step 1: 改 painCards 的 update/delete 規則**

把現有 painCards update（約 firestore.rules:56-58）：

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

（painCards 的 `allow read: if true;` 與 `allow create:` 維持不動。）

- [ ] **Step 2: 跑測試，確認 15 條全綠**

Run:

```bash
npm run test:rules
```

Expected: `15 passed, 0 failed`，exit 0。

- [ ] **Step 3: Commit**

```bash
git add firestore.rules
git commit -m "fix(rules): painCards update/delete 收斂為僅 admin（擋自核准 approval）" -m "Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

## Task 5: 上線前資料盤點腳本（唯讀）

**Files:**

- Create: `scripts/__audit-tool-fields.mjs`

> 目的：確認正式 tools 都有 `authorUid`/`status`/`createdAt`，否則缺欄位的舊工具會變「僅 admin 可編輯」。依 AGENTS.md「資料 × 程式碼順序」，發布規則前必跑。

- [ ] **Step 1: 建盤點腳本**

Create `scripts/__audit-tool-fields.mjs`:

```js
// 唯讀盤點：列出 tools 缺 authorUid/status/createdAt 的文件；確認 painCards 無 authorUid。
// 執行：node scripts/__audit-tool-fields.mjs
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

- [ ] **Step 2: 跑盤點（dry-run，唯讀）**

Run:

```bash
node scripts/__audit-tool-fields.mjs
```

Expected: 列出缺欄位的 tools。

- 若「缺欄位 0 筆」→ 可直接發布規則。
- 若有缺 `authorUid` 或 `status` 的工具 → 人工判斷：是「只有 admin 維護的平台/專案工具」則可接受；是「需作者能編輯」則**先寫 backfill migration 補欄位**（沿用 repo 慣例：dry-run 預設、`--apply` 才寫、自動備份、idempotent）再發規則。把結果記到 PR 描述。

- [ ] **Step 3: Commit**

```bash
git add scripts/__audit-tool-fields.mjs
git commit -m "chore(scripts): 加 tools 欄位盤點腳本（發布 rules 前置檢查）" -m "Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

## Task 6: 收尾驗證 + 標記 backlog

**Files:**

- Modify: `docs/optimization-audit-2026-06-07.md`

- [ ] **Step 1: 確認既有檢查不被破壞**

Run:

```bash
npm run lint
npm run build
```

Expected: lint 維持原狀（不新增 error；既有 2 errors/3 warnings 不在本次範圍）、build 成功。

> 本次只動 rules + 測試 + 腳本，不碰 app/src，故 lint/build 應無新增問題。

- [ ] **Step 2: 在 backlog 標記 S1/S2 為已修**

在 `docs/optimization-audit-2026-06-07.md` 的第 2 節表格，把 S1/S2 列尾各加「✅ 已修（PR #）」，並在 S3 註明「仍為 follow-up」。

- [ ] **Step 3: Commit**

```bash
git add docs/optimization-audit-2026-06-07.md
git commit -m "docs(audit): 標記 S1/S2 rules 硬化已修" -m "Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

- [ ] **Step 4: 開 PR（人工 / 用 feature skill）**

```bash
git push -u origin fix-firestore-rules-hardening
```

PR 描述須包含：Task 5 盤點結果、提醒 reviewer「**merge 後需到 Firebase Console 手動發布 rules**（SA 缺 firebaserules.releases.create），再連 live 站驗證」。

---

## 上線後人工步驟（非自動化，列在 PR 描述提醒）

1. **Firebase Console → Firestore → Rules** 貼上 merge 後的 `firestore.rules` 發布（`deploy-*-rules.mjs` 只能建 ruleset 不能發布）。
2. **連 live 站驗證**：
   - developer 帳號試把自己 pending 工具改 live → 應 permission-denied。
   - admin 後台改 status / 跑 wizard → 正常。
   - 作者編輯自己工具內容 → 正常。

---

## Self-Review（已執行）

- **Spec coverage**：spec §4.1 helper→Task 3 Step 1；§4.2 tools→Task 3 Step 2；§4.3 painCards admin-only→Task 4；§5 盤點→Task 5；§6 測試矩陣 15 條→Task 2；§7 rollout→Task 6 + 上線後步驟；§8 已知限制→測試 #11（作者可刪自己 live 工具，ALLOW）已涵蓋驗證。**註**：spec §4.1 列了 `approvalUnchanged()`，但 §4.3 決定 painCards 僅 admin → 該 helper 不需要，本計畫刻意不實作（YAGNI）。
- **Placeholder scan**：無 TBD/TODO；每個 code step 都有完整檔案內容。
- **Type/名稱一致**：測試用的 `seed()`/`it()`/context 變數（dev1/dev2/admin）跨 task 一致；helper 名稱 `statusUnchanged/authorUidUnchanged/createdAtUnchanged` 在 Task 3 定義並於 tools update 引用，無孤兒參照（approvalUnchanged 已說明不使用）。
