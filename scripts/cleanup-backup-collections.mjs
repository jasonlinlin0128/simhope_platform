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
