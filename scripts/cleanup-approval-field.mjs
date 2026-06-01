/**
 * cleanup-approval-field.mjs
 *
 * 一次性整理：把 tools collection 上的 legacy `approval` 欄位移除。
 * `approval` 是舊版用的「審核狀態」(pending/approved/rejected)，
 * 新版完全靠 `status` 表達 (pending/live/beta/new/dev/terminated)。
 *
 * === 使用方式 ===
 *   node scripts/cleanup-approval-field.mjs              # dry-run
 *   node scripts/cleanup-approval-field.mjs --apply
 *
 * 備份：tools-backup-2026-05-29-approval/{toolId}
 */

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sa = JSON.parse(
  readFileSync(join(__dirname, "..", "serviceAccountKey.json"), "utf8"),
);
initializeApp({ credential: cert(sa) });
const db = getFirestore();

const BACKUP_COLLECTION = "tools-backup-2026-05-29-approval";
const DRY_RUN = !process.argv.includes("--apply");

async function main() {
  console.log(`\n=== cleanup-approval-field.mjs ===`);
  console.log(`模式：${DRY_RUN ? "DRY-RUN" : "APPLY"}\n`);

  const snap = await db.collection("tools").get();
  const tools = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const toClean = tools.filter((t) => "approval" in t);
  console.log(
    `找到 ${tools.length} 個工具，其中 ${toClean.length} 個有 legacy approval 欄位\n`,
  );

  console.log("── 將移除 approval 欄位 ──\n");
  for (const t of toClean) {
    console.log(
      `  ${t.id.padEnd(20)} status=${t.status} approval=${t.approval} (移除)`,
    );
  }

  if (DRY_RUN) {
    console.log(`\n>>> dry-run，加 --apply：`);
    console.log(`    node scripts/cleanup-approval-field.mjs --apply\n`);
    return;
  }

  console.log(`\n── 開始備份 + 寫入 ──\n`);
  const batch = db.batch();
  const backupRef = db.collection(BACKUP_COLLECTION);
  const toolsRef = db.collection("tools");

  for (const t of toClean) {
    const { id, ...original } = t;
    batch.set(backupRef.doc(t.id), {
      ...original,
      _backupAt: new Date().toISOString(),
      _migrationVersion: "2026-05-29-cleanup-approval",
    });
    batch.update(toolsRef.doc(t.id), { approval: FieldValue.delete() });
    console.log(`  ✅ ${t.id}`);
  }

  await batch.commit();
  console.log(`\n✅ 完成。${toClean.length} 個工具 approval 欄位已移除。`);
  console.log(`   備份：${BACKUP_COLLECTION}/{toolId}\n`);
}

main().catch((err) => {
  console.error("\n❌", err.message);
  console.error(err.stack);
  process.exit(1);
});
