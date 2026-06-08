# requests 歸檔 / TTL 自動清理 — 實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 結案（approved/rejected/handled）的 request 在 180 天後由 Firestore TTL 自動硬刪；pending 永不刪。

**Architecture:** RequestInbox 三個結案 `updateDoc` 各多寫一個 `expireAt`（client `Timestamp`，now+180d）；新增一次性回填 script 給既有已結案 doc 補 `expireAt`（createdAt+180d，dry-run/--apply/自動備份/idempotent/分批）；TTL policy 由 Jason 在 Firestore Console 建（欄位 `expireAt`）。建立路徑與 rules 皆不動。

**Tech Stack:** Next.js 16 + React 19 client component（`firebase/firestore` web SDK）；回填 script = Node ESM + `firebase-admin`。import 別名 `@/* → src/*`。

**設計來源：** [spec](../specs/2026-06-08-requests-ttl-design.md)（獨立 reviewer：VERDICT READY，3 nit 已納入本計畫）。

**全域驗證慣例：** `npm run lint` 基準 5 problems 不增；commit Conventional + 結尾 `Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>`。

---

## Task 1: RequestInbox 三結案路徑寫入 `expireAt`

**Files:**

- Modify: `src/components/RequestInbox.jsx`

- [ ] **Step 1: 加 `Timestamp` 到既有 import（L5-14）**

old：

```jsx
import {
  collection,
  getDocs,
  doc,
  updateDoc,
  query,
  orderBy,
  limit,
  startAfter,
} from "firebase/firestore";
```

new：

```jsx
import {
  collection,
  getDocs,
  doc,
  updateDoc,
  query,
  orderBy,
  limit,
  startAfter,
  Timestamp,
} from "firebase/firestore";
```

> reviewer nit #3：`Timestamp` 必須來自 `firebase/firestore`（web SDK），不是 firebase-admin。元件本就從這裡 import，只是把名字加進去。

- [ ] **Step 2: 在 `PAGE_SIZE` 常數下方加保留期常數 + helper**

old：

```jsx
const PAGE_SIZE = 50;
```

new：

```jsx
const PAGE_SIZE = 50;
// 結案後保留 180 天，過後由 Firestore TTL policy（欄位 expireAt）自動清除。
const RETENTION_MS = 180 * 24 * 60 * 60 * 1000;
const newExpireAt = () => Timestamp.fromMillis(Date.now() + RETENTION_MS);
```

> helper 用函式（非常數值）：每次結案以「當下」時間 +180 天計算。

- [ ] **Step 3: approve / reject / markHandled 三處 `updateDoc` 各加 `expireAt`**

approve（約 L91）old：

```jsx
await updateDoc(doc(db, "requests", r.id), { status: "approved" });
```

new：

```jsx
await updateDoc(doc(db, "requests", r.id), {
  status: "approved",
  expireAt: newExpireAt(),
});
```

reject（約 L101）old：

```jsx
await updateDoc(doc(db, "requests", r.id), { status: "rejected" });
```

new：

```jsx
await updateDoc(doc(db, "requests", r.id), {
  status: "rejected",
  expireAt: newExpireAt(),
});
```

markHandled（約 L109）old：

```jsx
await updateDoc(doc(db, "requests", r.id), { status: "handled" });
```

new：

```jsx
await updateDoc(doc(db, "requests", r.id), {
  status: "handled",
  expireAt: newExpireAt(),
});
```

- [ ] **Step 4: lint**

Run: `npm run lint`
Expected: 維持基準 5 problems（無新增；`Timestamp` 有被使用、`newExpireAt` 有被呼叫）。

- [ ] **Step 5: commit**

```bash
git add src/components/RequestInbox.jsx
git commit -m "feat(requests): 結案時寫入 expireAt（now+180d）供 TTL 自動清理 (audit #9)

approve/reject/markHandled 三路徑各加 expireAt（client Timestamp，
結案當下+180天）；pending 不寫→TTL 永不碰。建立路徑與 rules 不動。

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

## Task 2: 新增回填 script `scripts/backfill-request-expireat.mjs`

**Files:**

- Create: `scripts/backfill-request-expireat.mjs`

- [ ] **Step 1: 建立檔案（一字不差，依 `cleanup-approval-field.mjs` 範式）**

```js
/**
 * backfill-request-expireat.mjs
 *
 * 一次性回填：給「已結案但還沒有 expireAt」的 requests 補上 expireAt，
 * 讓 Firestore TTL policy（欄位 expireAt）能自動清掉舊的結案申請/需求。
 *
 * 只碰 status ∈ {approved, rejected, handled} 且尚無 expireAt 的 doc。
 * pending 永遠不碰（沒 expireAt → TTL 不刪）。
 * expireAt = createdAt + 180 天（createdAt 不是合法 Timestamp 時 fallback now + 180 天）。
 *
 * === 使用方式 ===
 *   node scripts/backfill-request-expireat.mjs           # dry-run（只讀、印出清單）
 *   node scripts/backfill-request-expireat.mjs --apply   # 寫入（先全量備份）
 *
 * 備份：requests-backup-2026-06-08/{reqId}
 * idempotent：已有 expireAt 者跳過，可重跑。
 *
 * ⚠️ 執行順序（AGENTS.md）：code merge + production deploy 成功後才跑 --apply；
 *    跑完再去 Firebase Console 建 TTL policy（欄位 expireAt）。
 */

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sa = JSON.parse(
  readFileSync(join(__dirname, "..", "serviceAccountKey.json"), "utf8"),
);
initializeApp({ credential: cert(sa) });
const db = getFirestore();

const BACKUP_COLLECTION = "requests-backup-2026-06-08";
const RESOLVED = ["approved", "rejected", "handled"];
const RETENTION_MS = 180 * 24 * 60 * 60 * 1000; // 180 天
const DRY_RUN = !process.argv.includes("--apply");
const BATCH_SIZE = 200; // 每筆 2 ops（backup set + update）→ 200×2=400 < 500 上限

// createdAt 應為 Admin SDK Timestamp；非合法 Timestamp（缺漏 / 亂碼 doc）→ fallback now。
// 用 typeof 檢查（非單純 truthy），避免字串/數字 createdAt 在 .toMillis() 拋錯中斷整批。
function expireMsFor(createdAt) {
  const base =
    createdAt && typeof createdAt.toMillis === "function"
      ? createdAt.toMillis()
      : Date.now();
  return base + RETENTION_MS;
}

function createdLabel(createdAt) {
  return createdAt && typeof createdAt.toMillis === "function"
    ? new Date(createdAt.toMillis()).toISOString().slice(0, 10)
    : "（無/異常）";
}

async function main() {
  console.log(`\n=== backfill-request-expireat.mjs ===`);
  console.log(`模式：${DRY_RUN ? "DRY-RUN（只讀）" : "APPLY（寫入）"}\n`);

  const snap = await db.collection("requests").get();
  const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const pending = all.filter((r) => !RESOLVED.includes(r.status));
  const already = all.filter((r) => RESOLVED.includes(r.status) && r.expireAt);
  const todo = all.filter((r) => RESOLVED.includes(r.status) && !r.expireAt);

  // reviewer nit #2：印 skipped 細項，方便核對 pending + 已有 + 待回填 === 總數。
  console.log(`總 requests：${all.length}`);
  console.log(`  pending / 非結案（不碰）：${pending.length}`);
  console.log(`  已結案且已有 expireAt（跳過）：${already.length}`);
  console.log(`  待回填（結案但無 expireAt）：${todo.length}\n`);

  if (todo.length === 0) {
    console.log("沒有需要回填的 doc，結束。\n");
    return;
  }

  console.log("── 待回填清單（id / type / status / created → expireAt）──\n");
  for (const r of todo) {
    const expLabel = new Date(expireMsFor(r.createdAt))
      .toISOString()
      .slice(0, 10);
    console.log(
      `  ${r.id.padEnd(22)} ${String(r.type).padEnd(8)} ${String(r.status).padEnd(9)} ${createdLabel(r.createdAt)} → ${expLabel}`,
    );
  }

  if (DRY_RUN) {
    console.log(`\n>>> dry-run，確認數字後加 --apply 寫入：`);
    console.log(`    node scripts/backfill-request-expireat.mjs --apply\n`);
    return;
  }

  console.log(`\n── 開始備份 + 寫入（每批 ${BATCH_SIZE} 筆）──\n`);
  const backupRef = db.collection(BACKUP_COLLECTION);
  const requestsRef = db.collection("requests");

  for (let i = 0; i < todo.length; i += BATCH_SIZE) {
    const chunk = todo.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    for (const r of chunk) {
      const { id, ...original } = r;
      batch.set(backupRef.doc(id), {
        ...original,
        _backupAt: new Date().toISOString(),
        _migrationVersion: "2026-06-08-backfill-expireat",
      });
      batch.update(requestsRef.doc(id), {
        expireAt: Timestamp.fromMillis(expireMsFor(r.createdAt)),
      });
    }
    await batch.commit();
    console.log(
      `  ✅ 已處理 ${Math.min(i + BATCH_SIZE, todo.length)}/${todo.length}`,
    );
  }

  console.log(`\n✅ 完成。${todo.length} 筆已結案 request 補上 expireAt。`);
  console.log(`   備份：${BACKUP_COLLECTION}/{reqId}（確認無誤後可自行刪）\n`);
}

main().catch((err) => {
  console.error("\n❌", err.message);
  console.error(err.stack);
  process.exit(1);
});
```

- [ ] **Step 2: 語法檢查**

Run: `node --check scripts/backfill-request-expireat.mjs`
Expected: 無輸出（語法 OK）。

- [ ] **Step 3: commit**

```bash
git add scripts/backfill-request-expireat.mjs
git commit -m "feat(requests): 回填 script — 給既有已結案 request 補 expireAt (audit #9)

dry-run 預設 / --apply 才寫；寫前全量備份 requests-backup-2026-06-08；
idempotent（已有 expireAt 跳過、可重跑）；分批 200 筆避免 batch 上限。
createdAt 用 typeof guard 防亂碼 doc 中斷；dry-run 印 skipped 細項。

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

## Task 3: build + 回填 dry-run 驗證（不 commit）

**Files:** 無（驗證）

- [ ] **Step 1: build**

Run: `npm run build`
Expected: 綠（RequestInbox 的 `Timestamp`/`newExpireAt` 無型別/未使用錯）。

- [ ] **Step 2: 回填 script dry-run（只讀正式 Firestore，給 Jason 真實筆數）**

Run: `node scripts/backfill-request-expireat.mjs`
Expected: 印出「總 requests / pending / 已有 expireAt / 待回填」四個數字（三者相加 === 總數）+ 待回填清單，且每筆 `expireAt` 落點為 2026 下半年（非 1970，驗證 ms 單位正確）。**不寫入**（無 `--apply`）。

> 此步驟讀正式 Firestore（serviceAccountKey.json 在 repo 根、gitignored）。只讀無寫，安全。把輸出貼進 PR 描述供 Jason 過目。

- [ ] **Step 3: 靜態複核**

Run: `grep -nE "expireAt|status:" src/components/RequestInbox.jsx`
Expected: 三個結案 `updateDoc` 都含 `expireAt`；建立路徑（在 `app/api/request/route.js`，本計畫未改）不含 `expireAt`；無 pending 路徑寫 `expireAt`。

---

## 完成後

- 推 `feature-requests-ttl` → 開 PR（base main）；PR body 必含：
  1. 行為說明（結案才設 expireAt、pending 永不刪）。
  2. **§5 執行順序**（code merge+deploy → 回填 dry-run → --apply → 建 TTL policy）。
  3. **Jason 待辦清單**：跑回填 dry-run/--apply 指令 + Firestore Console 建 TTL policy 步驟（spec §8）。
  4. dry-run 輸出（Task 3 Step 2）。
- 獨立 reviewer subagent（對抗式，聚焦資料誤刪/單位/順序）→ CI/Vercel 綠 → **等 Jason merge**。
- 提醒 Jason：**先 merge+deploy，才跑 --apply 回填，最後才建 TTL policy**（AGENTS.md 鐵則）。

---

## Self-Review（plan vs spec）

- **Spec coverage**：§3 改動表→T1（RequestInbox 3 路徑）+T2（回填 script）；§4 expireAt 語意（new=now+180d / 回填=createdAt+180d + typeof guard）→T1 helper + T2 `expireMsFor`；§5 執行順序→「完成後」+ script header 註解；§6 rules 免動→不改 rules（無 task，正確）；§7 回填 script 規格（dry-run/--apply/備份/idempotent/分批/skipped 細項）→T2 完整碼；§8 Console TTL→Jason 待辦（PR body）；§9 測試→T3（build/dry-run/grep）。✓
- **Placeholder scan**：完整碼、exact 指令與預期輸出；無 TBD。✓
- **Type consistency**：`RETENTION_MS`、`expireMsFor`、`newExpireAt`、`Timestamp.fromMillis`、`BACKUP_COLLECTION` 全程一致；RequestInbox 用 web SDK `Timestamp`、script 用 admin SDK `Timestamp`（各自 import，spec §9 reviewer nit #3 已分清）。✓
- **reviewer 3 nit**：#1 typeof guard（T2 `expireMsFor`）、#2 skipped 細項（T2 dry-run 輸出）、#3 `Timestamp` from `firebase/firestore`（T1 Step1）全數落地。✓
