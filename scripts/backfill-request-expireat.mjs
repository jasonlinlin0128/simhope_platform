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
