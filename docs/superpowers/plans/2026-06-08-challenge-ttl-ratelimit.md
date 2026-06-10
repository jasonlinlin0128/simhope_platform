# webauthnChallenges TTL + options 限流 — 實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 孤兒 webauthnChallenges 由 Firestore TTL 自動清；options endpoints 加 IP 限流擋免費寫入放大。

**Architecture:** `storeChallenge` 加 `expireAt` Timestamp（複用 #9 TTL）；2 個 options route 鏡像 refine-request 加 IP 限流；新增無備份 backfill 清既有 6 筆孤兒；Jason Console 建 TTL policy。不動 rules / consumeChallenge / client。

**Tech Stack:** Next.js route + firebase-admin（Timestamp）+ 既有 `rateLimit.mjs`。

**設計來源：** [spec](../specs/2026-06-08-challenge-ttl-ratelimit-design.md)。

**驗證慣例：** `npm run lint` 基準 3（0 error）不增、`npm run test:unit` 26 綠；commit Conventional + 結尾 `Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>`。

---

## Task 1: passkeyServer.js — storeChallenge 加 expireAt

**Files:** Modify `src/lib/passkeyServer.js`

- [ ] **Step 1: import admin Timestamp（在 `import { HttpError }...` 後）**

old：

```js
import { HttpError } from "./httpError.mjs";
```

new：

```js
import { HttpError } from "./httpError.mjs";
import { Timestamp } from "firebase-admin/firestore";
```

- [ ] **Step 2: storeChallenge 寫入加 expireAt**

old：

```js
export async function storeChallenge({ challenge, uid = null, type }) {
  const { adminDb } = getAdmin();
  const challengeId = randomUUID();
  await adminDb.collection("webauthnChallenges").doc(challengeId).set({
    challenge,
    uid,
    type,
    createdAt: Date.now(),
  });
  return challengeId;
}
```

new：

```js
export async function storeChallenge({ challenge, uid = null, type }) {
  const { adminDb } = getAdmin();
  const challengeId = randomUUID();
  const now = Date.now();
  await adminDb
    .collection("webauthnChallenges")
    .doc(challengeId)
    .set({
      challenge,
      uid,
      type,
      createdAt: now,
      // TTL：Firestore TTL policy（欄位 expireAt）過期後清掉沒被消費的孤兒 challenge。
      expireAt: Timestamp.fromMillis(now + CHALLENGE_TTL_MS),
    });
  return challengeId;
}
```

> `consumeChallenge` 的 5min 檢查仍用 `createdAt`（數字）→ 不動。

---

## Task 2: options routes — IP 限流

**Files:** Modify `app/api/auth/passkey/login/options/route.js`、`app/api/auth/passkey/register/options/route.js`

- [ ] **Step 1: login/options 加 import + 限流**

old（import 區）：

```js
import { getRpInfo, storeChallenge } from "@/lib/passkeyServer";
```

new：

```js
import { getRpInfo, storeChallenge } from "@/lib/passkeyServer";
import { rateLimit, clientIp } from "@/lib/rateLimit.mjs";
import { HttpError } from "@/lib/httpError.mjs";
```

old（try 開頭）：

```js
  try {
    const { rpID } = getRpInfo(request);
```

new：

```js
  try {
    const ip = clientIp(request);
    if (!rateLimit(`pk-login:${ip}`, { limit: 10, windowMs: 60000 }).ok)
      throw new HttpError(429, "操作過於頻繁，請稍後再試");

    const { rpID } = getRpInfo(request);
```

- [ ] **Step 2: register/options 加 import + 限流**

old（import 區）：

```js
import { requireUser, getRpInfo, storeChallenge } from "@/lib/passkeyServer";
```

new：

```js
import { requireUser, getRpInfo, storeChallenge } from "@/lib/passkeyServer";
import { rateLimit, clientIp } from "@/lib/rateLimit.mjs";
import { HttpError } from "@/lib/httpError.mjs";
```

old（try 開頭）：

```js
  try {
    const decoded = await requireUser(request);
```

new：

```js
  try {
    const ip = clientIp(request);
    if (!rateLimit(`pk-register:${ip}`, { limit: 10, windowMs: 60000 }).ok)
      throw new HttpError(429, "操作過於頻繁，請稍後再試");

    const decoded = await requireUser(request);
```

---

## Task 3: 新增 backfill script（無備份）

**Files:** Create `scripts/backfill-challenge-expireat.mjs`

- [ ] **Step 1: 建立檔案（一字不差）**

```js
/**
 * backfill-challenge-expireat.mjs
 *
 * 給既有「無 expireAt」的 webauthnChallenges 補 expireAt = createdAt + 5min，
 * 讓 Firestore TTL policy（欄位 expireAt）清掉殘留的孤兒 challenge。
 *
 * 不備份：challenge 是單次性、已過期、無價值的 server-only nonce（備份純儀式）；
 * 且本 script 只「加 expireAt」非破壞性，真正刪除由 TTL 做（Jason 建 policy 才觸發）。
 *
 * === 使用方式 ===
 *   node scripts/backfill-challenge-expireat.mjs           # dry-run（只讀）
 *   node scripts/backfill-challenge-expireat.mjs --apply   # 寫入
 *
 * idempotent：已有 expireAt 跳過、可重跑。
 * ⚠️ 執行順序：code merge + deploy 後跑 --apply；再去 Console 建 TTL policy。
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

const CHALLENGE_TTL_MS = 5 * 60 * 1000; // 與 passkeyServer 一致
const DRY_RUN = !process.argv.includes("--apply");
const BATCH_SIZE = 200;

// createdAt 應為數字（Date.now()）；異常→fallback now（typeof guard）。
function expireMsFor(createdAt) {
  const base = typeof createdAt === "number" ? createdAt : Date.now();
  return base + CHALLENGE_TTL_MS;
}

async function main() {
  console.log(`\n=== backfill-challenge-expireat.mjs ===`);
  console.log(`模式：${DRY_RUN ? "DRY-RUN（只讀）" : "APPLY（寫入）"}\n`);

  const snap = await db.collection("webauthnChallenges").get();
  const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const already = all.filter((c) => c.expireAt);
  const todo = all.filter((c) => !c.expireAt);

  console.log(`總 challenges：${all.length}`);
  console.log(`  已有 expireAt（跳過）：${already.length}`);
  console.log(`  待回填（無 expireAt）：${todo.length}\n`);

  if (todo.length === 0) {
    console.log("沒有需要回填的 doc，結束。\n");
    return;
  }

  for (const c of todo) {
    const exp = new Date(expireMsFor(c.createdAt)).toISOString().slice(0, 16);
    console.log(`  ${c.id}  type=${c.type ?? "?"}  → expireAt=${exp}`);
  }

  if (DRY_RUN) {
    console.log(`\n>>> dry-run，加 --apply 寫入：`);
    console.log(`    node scripts/backfill-challenge-expireat.mjs --apply\n`);
    return;
  }

  console.log(`\n── 寫入（每批 ${BATCH_SIZE}）──\n`);
  const ref = db.collection("webauthnChallenges");
  for (let i = 0; i < todo.length; i += BATCH_SIZE) {
    const chunk = todo.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    for (const c of chunk) {
      batch.update(ref.doc(c.id), {
        expireAt: Timestamp.fromMillis(expireMsFor(c.createdAt)),
      });
    }
    await batch.commit();
    console.log(`  ✅ ${Math.min(i + BATCH_SIZE, todo.length)}/${todo.length}`);
  }
  console.log(
    `\n✅ 完成。${todo.length} 筆補上 expireAt（TTL policy 建立後自動清）。\n`,
  );
}

main().catch((err) => {
  console.error("\n❌", err.message);
  console.error(err.stack);
  process.exit(1);
});
```

- [ ] **Step 2: 語法檢查**

Run: `node --check scripts/backfill-challenge-expireat.mjs`
Expected: 無輸出。

---

## Task 4: 驗證 + commit

**Files:** 無（驗證）+ commit T1/T2/T3

- [ ] **Step 1: build + lint + unit**

Run: `npm run build`（綠）、`npm run lint`（基準 3、0 error）、`npm run test:unit`（26 綠）。

- [ ] **Step 2: backfill dry-run（只讀正式 Firestore）**

Run: `node scripts/backfill-challenge-expireat.mjs`
Expected: 「總 6 / 已有 expireAt 0 / 待回填 6」，列 6 筆（login×4 / register×2），expireAt 落點為過去（已過期）。**不寫入**。

- [ ] **Step 3: grep 複核**

Run: `grep -nE "expireAt|pk-login|pk-register|rateLimit" src/lib/passkeyServer.js app/api/auth/passkey/login/options/route.js app/api/auth/passkey/register/options/route.js`
Expected: passkeyServer 有 expireAt；兩 route 各有 `pk-login`/`pk-register` + rateLimit。

- [ ] **Step 4: commit**

```bash
git add src/lib/passkeyServer.js "app/api/auth/passkey/login/options/route.js" "app/api/auth/passkey/register/options/route.js" scripts/backfill-challenge-expireat.mjs
git commit -m "fix(passkey): webauthnChallenges TTL + options IP 限流 (audit #6)

storeChallenge 加 expireAt Timestamp（now+5min）→ Firestore TTL 清孤兒
（建了沒消費的）；consumeChallenge 即刪邏輯不動。login/register options
加 IP 限流（pk-login/pk-register，10/60s，鏡像 refine-request）擋免費寫入
放大。新增 backfill 清既有 6 筆孤兒（無備份：無價值 ephemeral；非破壞性，
刪除由 TTL 做）。不動 rules/consumeChallenge/client。

⚠️ Jason：部署後跑 backfill --apply + Console 建 TTL policy
（webauthnChallenges/expireAt，可跟 #28 一起）。

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

## 完成後

- 推 `feature-challenge-ttl-ratelimit` → 開 PR（base main；body：6 孤兒實證、§4 執行順序、Console policy 步驟、限流值、無備份正當化）。
- 獨立 reviewer subagent（聚焦：expireAt 真 Timestamp、createdAt/consumeChallenge 不受影響、限流 key/import/429 接線、backfill typeof guard+idempotent+無備份正當）→ CI/Vercel 綠 → 等 Jason merge + 部署 + backfill + Console policy。

---

## Self-Review（plan vs spec）

- **Spec coverage**：§3.1 storeChallenge→T1；§3.2 兩 route 限流→T2；§3.3 backfill→T3；§5 測試→T4（build/lint/unit/dry-run/grep）。✓
- **Placeholder scan**：完整 old/new 碼、exact 指令；無 TBD。✓
- **一致性**：`CHALLENGE_TTL_MS = 5min` 在 passkeyServer（既有）與 backfill 一致；限流 `pk-login`/`pk-register` + HttpError 429 鏡像 refine-request；backfill typeof guard 同 #9。✓
