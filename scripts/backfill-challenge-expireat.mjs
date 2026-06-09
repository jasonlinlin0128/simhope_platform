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
