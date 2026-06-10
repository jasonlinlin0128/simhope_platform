# Firestore DR Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付 Firestore DR 的程式碼/文件面（runbook + 狀態查詢腳本 + 安全的舊備份清理腳本 + migration 慣例更新）；DR 本體的 gcloud 設定由 Jason 執行。

**Architecture:** 安全關鍵的「哪些 collection 該刪」抽成純函式 `isStaleBackupCollection`（node:test 可測、test:unit 把關），破壞性清理腳本 import 它；`dr-status.mjs` 用 SA REST 唯讀查 PITR/backup 狀態；runbook 記錄設定 + 復原步驟（含官方核對過的 gcloud 指令）。

**Tech Stack:** Node ESM / firebase-admin（Admin SDK，recursiveDelete）/ google-auth-library（Firestore Admin REST）/ node:test。

**慣例：** Conventional Commits，每個 commit 結尾必加 `Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>`。

---

### Task 1: `isStaleBackupCollection` — 安全的備份 collection 比對（TDD）

**Files:**

- Create: `src/lib/backupCollections.mjs`
- Test: `src/lib/backupCollections.test.mjs`

- [ ] **Step 1: 寫失敗測試**

Create `src/lib/backupCollections.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { isStaleBackupCollection } from "./backupCollections.mjs";

// 必須命中的 8 個正式 prod 舊備份 collection（2026-06-11 實測）
const SHOULD_MATCH = [
  "tools-backup-2026-05-27",
  "tools-backup-2026-05-28",
  "tools-backup-2026-05-29-approval",
  "tools-backup-2026-05-29-embedded",
  "tools-backup-2026-06-01",
  "painCards-backup-2026-05-28",
  "painCards-backup-2026-05-29",
  "requests-backup-2026-06-08",
];

// 絕對不可命中的真 collection（誤刪 = 災難）
const MUST_NOT_MATCH = [
  "tools",
  "requests",
  "painCards",
  "users",
  "faqs",
  "passkeys",
  "webauthnChallenges",
  "analytics",
  "analytics_daily",
  "site",
  "chatHistory",
  // 邊緣：像備份但沒日期 / 怪命名 → 一律不刪（fail-safe）
  "backup",
  "tools-backup",
  "tools-backupX",
  "my-backup-notes",
  "backup-tools",
];

test("命中全部 8 個正式舊備份 collection", () => {
  for (const n of SHOULD_MATCH)
    assert.equal(isStaleBackupCollection(n), true, `應命中: ${n}`);
});

test("絕不命中任何真 collection / 怪命名", () => {
  for (const n of MUST_NOT_MATCH)
    assert.equal(isStaleBackupCollection(n), false, `不該命中: ${n}`);
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npm run test:unit`
Expected: FAIL — `Cannot find module './backupCollections.mjs'`

- [ ] **Step 3: 寫實作**

Create `src/lib/backupCollections.mjs`:

```js
// src/lib/backupCollections.mjs
// 安全判斷「這個 collection 是 migration 留下的舊 in-DB 備份」（破壞性清理用）。
// 規則：名稱含 `-backup-YYYY-MM-DD`（base-backup-日期[-suffix]）。
// fail-safe：沒有日期樣式的一律不命中 → 絕不誤刪真 collection。

/**
 * @param {string} name  collection id
 * @returns {boolean} true = 是可刪的舊 in-DB 備份
 */
export function isStaleBackupCollection(name) {
  return /-backup-\d{4}-\d{2}-\d{2}/.test(name);
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npm run test:unit`
Expected: PASS（既有 52 + 新 2 = 54（matcher 命中 8 個 prod 備份） tests pass）

- [ ] **Step 5: Commit**

```bash
git add src/lib/backupCollections.mjs src/lib/backupCollections.test.mjs
git commit -m "feat(dr): isStaleBackupCollection — 安全比對舊 in-DB 備份（fail-safe）

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

### Task 2: `cleanup-backup-collections.mjs` — 清理舊 in-DB 備份（dry-run/--apply）

**Files:**

- Create: `scripts/cleanup-backup-collections.mjs`

沿用 repo migration script 慣例：dry-run 預設、`--apply` 才刪、idempotent、印出將刪清單。

- [ ] **Step 1: 寫實作**

Create `scripts/cleanup-backup-collections.mjs`:

```js
/**
 * cleanup-backup-collections.mjs
 *
 * 刪除 migration 留下的舊「in-DB 備份」collection（如 tools-backup-2026-05-27）。
 * 這些備份寫在同一個 Firestore，對 DR 無效（DB 掛了一起掛）；真 DR（PITR +
 * managed daily backup）上線後即冗餘。
 *
 * ⚠️ 破壞性。安全機制：
 *   - 只刪 isStaleBackupCollection() 命中的（名稱含 -backup-YYYY-MM-DD）；
 *   - dry-run 預設，先印出將刪 collection + doc 數；--apply 才真的刪；
 *   - idempotent（刪完重跑 = 0 命中）。
 * ⚠️ 執行時機：等 PITR + daily backup 確立、且至少有一個 daily backup 跑出來後才跑
 *    （真 DR 兜底）。見 docs/runbooks/firestore-dr.md。
 *
 * 用法：
 *   node scripts/cleanup-backup-collections.mjs            # dry-run
 *   node scripts/cleanup-backup-collections.mjs --apply    # 真的刪
 */
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { isStaleBackupCollection } from "../src/lib/backupCollections.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sa = JSON.parse(
  readFileSync(join(__dirname, "..", "serviceAccountKey.json"), "utf8"),
);
initializeApp({ credential: cert(sa) });
const db = getFirestore();

const DRY_RUN = !process.argv.includes("--apply");

console.log("=== cleanup-backup-collections.mjs ===");
console.log(`模式：${DRY_RUN ? "DRY-RUN（只讀）" : "APPLY（刪除）"}\n`);

const all = await db.listCollections();
const targets = all.map((c) => c.id).filter(isStaleBackupCollection);

if (targets.length === 0) {
  console.log("沒有命中的舊備份 collection，結束。");
  process.exit(0);
}

console.log(`命中 ${targets.length} 個舊備份 collection：`);
for (const id of targets) {
  const snap = await db.collection(id).count().get();
  console.log(`  ${id}  (${snap.data().count} docs)`);
}

if (DRY_RUN) {
  console.log("\n>>> dry-run。確認上列無誤後加 --apply 刪除：");
  console.log("    node scripts/cleanup-backup-collections.mjs --apply");
  process.exit(0);
}

console.log("\n── 開始刪除 ──");
for (const id of targets) {
  await db.recursiveDelete(db.collection(id));
  console.log(`  ✅ 已刪 ${id}`);
}
console.log(`\n✅ 完成。刪除 ${targets.length} 個舊備份 collection。`);
process.exit(0);
```

- [ ] **Step 2: dry-run 驗證（只讀，安全）**

Run: `node scripts/cleanup-backup-collections.mjs`
Expected: 印出**恰好 8 個** collection（`tools-backup-*`×5、`painCards-backup-*`×2、`requests-backup-2026-06-08`）+ 各自 doc 數；結尾 dry-run 提示。**不刪任何東西。**

- [ ] **Step 3: Commit**

```bash
git add scripts/cleanup-backup-collections.mjs
git commit -m "feat(dr): cleanup-backup-collections 腳本 — dry-run/--apply 清舊 in-DB 備份

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

### Task 3: `dr-status.mjs` — 查 PITR + backup 狀態（唯讀）

**Files:**

- Create: `scripts/dr-status.mjs`

用 SA + Firestore Admin REST 唯讀查狀態（Jason 跑完 gcloud 後我用這個代驗）。

- [ ] **Step 1: 寫實作**

Create `scripts/dr-status.mjs`:

```js
/**
 * dr-status.mjs — 唯讀查 Firestore DR 狀態（PITR + backup schedule + 近期 backups）。
 * 用法：node scripts/dr-status.mjs
 */
import { GoogleAuth } from "google-auth-library";

const PROJECT = "simhope-platform";
const LOCATION = "asia-east1";
const DB = "(default)";
const base = `https://firestore.googleapis.com/v1/projects/${PROJECT}`;

const auth = new GoogleAuth({
  keyFile: "./serviceAccountKey.json",
  scopes: ["https://www.googleapis.com/auth/cloud-platform"],
});
const client = await auth.getClient();
const get = async (url) => (await client.request({ url })).data;

console.log("=== Firestore DR 狀態 ===\n");

// 1) PITR
try {
  const d = await get(`${base}/databases/${encodeURIComponent(DB)}`);
  const on =
    d.pointInTimeRecoveryEnablement === "POINT_IN_TIME_RECOVERY_ENABLED";
  console.log(`① PITR：${on ? "✅ ENABLED" : "❌ DISABLED"}`);
  if (on) {
    console.log(`   最早可復原：${d.earliestVersionTime || "(尚無)"}`);
    console.log(`   保留期：${d.versionRetentionPeriod || "(?)"}`);
  }
} catch (e) {
  console.log("① PITR：查詢失敗", e.response?.status || e.message);
}

// 2) backup schedules
try {
  const d = await get(
    `${base}/databases/${encodeURIComponent(DB)}/backupSchedules`,
  );
  const list = d.backupSchedules || [];
  console.log(`\n② Backup schedules：${list.length} 條`);
  for (const s of list) {
    const ret = s.retention || "?";
    const rec = s.dailyRecurrence
      ? "daily"
      : s.weeklyRecurrence
        ? "weekly"
        : "?";
    console.log(`   - ${rec}，保留 ${ret}（${s.name?.split("/").pop()}）`);
  }
  if (list.length === 0) console.log("   ❌ 尚無排程備份");
} catch (e) {
  console.log(
    "\n② Backup schedules：查詢失敗",
    e.response?.status || e.message,
  );
}

// 3) 近期 backups
try {
  const d = await get(`${base}/locations/${LOCATION}/backups`);
  const list = d.backups || [];
  console.log(`\n③ 近期 backups：${list.length} 個`);
  for (const b of list.slice(0, 5)) {
    console.log(
      `   - ${b.snapshotTime || "?"}  state=${b.state}  (${b.name?.split("/").pop()})`,
    );
  }
  if (list.length === 0)
    console.log("   （尚無 — 排程建立後第一個 daily backup 才會出現）");
} catch (e) {
  console.log("\n③ 近期 backups：查詢失敗", e.response?.status || e.message);
}

process.exit(0);
```

- [ ] **Step 2: 跑一次（現況 PITR 應 DISABLED、無排程）**

Run: `node scripts/dr-status.mjs`
Expected: `① PITR：❌ DISABLED`、`② 尚無排程備份`、`③ 尚無`（Jason 還沒設定）。確認腳本能跑、查詢不報權限錯（SA 有讀權）。

- [ ] **Step 3: Commit**

```bash
git add scripts/dr-status.mjs
git commit -m "feat(dr): dr-status 腳本 — 唯讀查 PITR/backup schedule/backups

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

### Task 4: DR runbook 文件

**Files:**

- Create: `docs/runbooks/firestore-dr.md`

- [ ] **Step 1: 寫 runbook**

Create `docs/runbooks/firestore-dr.md`:

````markdown
# Firestore 災難復原 Runbook

> project `simhope-platform` · database `(default)` · FIRESTORE_NATIVE · region **asia-east1**
> 兩層：PITR（7 天連續）+ managed daily backup（留 14 天）。指令對照官方文件（2026-06-11）。

## 一次性設定（Jason 跑 gcloud；SA 無權）

```bash
# Layer 1：開 PITR（過去 7 天任一時間點可在現有 DB 復原）
gcloud firestore databases update --database='(default)' --enable-pitr --project=simhope-platform

# Layer 2：每日備份排程、留 14 天（備份落在 DB 同區 asia-east1）
gcloud firestore backups schedules create --database='(default)' \
  --recurrence=daily --retention=14d --project=simhope-platform

# 驗證（或請 Claude 跑 node scripts/dr-status.mjs 代驗）
gcloud firestore databases describe --database='(default)' --project=simhope-platform
gcloud firestore backups schedules list --database='(default)' --project=simhope-platform
```

> `--retention=14d` 是 daily 排程的上限（14 天）。

## 復原

### 情境 A — 剛 `--apply` migration 改錯（7 天內，用 PITR）

PITR clone 到一個新 DB，從中撈回正確資料：

```bash
gcloud firestore databases clone --source-database='(default)' \
  --snapshot-time='2026-06-11T10:20:00.00Z' \
  --destination-database='recover-20260611' --project=simhope-platform
```

- `snapshot-time`：RFC3339、**分鐘** granularity、要在「apply 之前」那一刻。
- 完成後 clone 出 `recover-20260611`，從它撈回受影響的 doc（或比對覆寫回 `(default)`）。確認無誤後刪掉 clone DB。

### 情境 B — 整庫毀損 / 誤刪（14 天內，用 daily backup）

```bash
gcloud firestore backups list --format="table(name, database, state)" --project=simhope-platform
gcloud firestore databases restore \
  --source-backup=projects/simhope-platform/locations/asia-east1/backups/BACKUP_ID \
  --destination-database='DESTINATION' --project=simhope-platform
```

- `BACKUP_ID`：上一行 list 裡挑最近一個 state=READY 的。
- `DESTINATION`：若 `(default)` 被刪 → 填 `(default)`；否則先 restore 到暫存 DB 驗證再處理。

### ⚠️ restore / clone 後**必做**（官方：restore 不含 Security Rules + TTL）

1. Console 重新發布 `firestore.rules`（repo 有全文：`firestore.rules`）。
2. 重建 TTL policy（Console / GCloud）：`requests`/`expireAt`、`webauthnChallenges`/`expireAt`、`analytics_daily`/`expireAt`。
3. 確認複合索引在（`firestore.indexes.json`：requests status+createdAt）。

## 清理舊 in-DB 備份（DR 確立後）

真 DR 上線 + 第一個 daily backup 跑出來後，舊的 `*-backup-*` collection 冗餘：

```bash
node scripts/cleanup-backup-collections.mjs           # dry-run 確認清單
node scripts/cleanup-backup-collections.mjs --apply   # 刪
```
````

- [ ] **Step 2: Commit**

```bash
git add docs/runbooks/firestore-dr.md
git commit -m "docs(dr): Firestore 災難復原 runbook（設定 + 復原 + 清理）

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

### Task 5: AGENTS.md — migration 慣例改靠 PITR

**Files:**

- Modify: `AGENTS.md`（在「部署與資料遷移的順序」規則區補一條）

- [ ] **Step 1: 找到 migration 規則區**

`AGENTS.md` 有「## 規則」段（談 migration script 要 `--apply`/自動備份/idempotent）。在該段末尾（第 3 點「每個 migration script 都要…」之後）加入：

```markdown
4. **PITR 上線後（2026-06-11）**：migration 的安全網改靠 **Firestore PITR**（7 天連續復原）+
   daily managed backup（留 14 天），**不必再寫「備份到 `<collection>-backup-YYYY-MM-DD`」的 in-DB 備份**
   （那種同庫備份對 DR 無效且累積垃圾）。新 migration 改成：跑 `--apply` 前記下 UTC timestamp，
   出事就照 `docs/runbooks/firestore-dr.md` 情境 A 用 PITR clone 回滾。既有 backfill/cleanup script
   的 in-DB 備份邏輯可保留（無害）或移除，新寫的不要再加。
```

- [ ] **Step 2: Commit**

```bash
git add AGENTS.md
git commit -m "docs(agents): migration 安全網改靠 PITR（不再寫 in-DB 備份 collection）

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

### Task 6: 全套驗證

**Files:** 無

- [ ] **Step 1: 單元測試**

Run: `npm run test:unit`
Expected: PASS（54：既有 52 + backupCollections 2）

- [ ] **Step 2: lint + build**

Run: `npm run lint`
Expected: 2 warnings（皆既有 tool/[id] img）0 errors

Run: `npm run build`
Expected: 成功（本 PR 不動 app 程式，純 scripts/docs/lib + AGENTS）

- [ ] **Step 3: cleanup dry-run 再確認一次（恰 8 個、不刪）**

Run: `node scripts/cleanup-backup-collections.mjs`
Expected: 命中恰好 8 個舊備份 collection、dry-run 不刪。

- [ ] **Step 4: 最終 commit（若有修正）**

```bash
git add -A
git commit -m "test(dr): 全套驗證綠（unit 54 / lint / build / cleanup dry-run 7 命中）

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

（無修正則略過。）

---

## 完成後（不在本計畫的自動步驟內）

1. **獨立 reviewer subagent** 審實作（**重點：破壞性 cleanup 腳本 + matcher 的 fail-safe**）。
2. 開 PR、等 Jason merge。
3. **Jason（merge 後）**：跑 runbook 的 2 條 gcloud（開 PITR + 建 daily backup schedule）。
4. **我代驗**：`node scripts/dr-status.mjs` → 確認 PITR ENABLED + schedule 存在。
5. **等第一個 daily backup 跑出來後**，才 `node scripts/cleanup-backup-collections.mjs --apply` 清 8 個舊備份（真 DR 兜底）。
