/**
 * migrate-tool-versions.mjs
 *
 * 一次性遷移：把現有 typeData.version + 既有下載檔塞成 versions[0]，
 * 讓「工具版本歷史」（Phase 2.5）有起始資料。idempotent、可重跑。
 * 對照 docs/superpowers/specs/2026-06-05-simhope-hub-phase2.5-tool-versions-design.md
 *
 * === 使用方式 ===
 *   node scripts/migrate-tool-versions.mjs            # dry-run，印 diff，不寫
 *   node scripts/migrate-tool-versions.mjs --apply    # 實際寫入（先備份）
 *
 * === 規則 ===
 *  - 已有 versions（≥1 筆）→ skip（idempotent）
 *  - 有 legacy 版本訊號（typeData.version 或 typeData.fileUrl/skillZipUrl/
 *    download 的 tool.url）→ seed 單筆 versions[0]
 *  - 純 webapp / 無訊號 → 留 versions: []，不捏造
 *  - 不刪 typeData.version（留 legacy fallback）
 *
 * === 部署順序鐵律（AGENTS.md）===
 *  讀 versions[] 的新 code 先 merge + production deploy 綠燈 → 才跑 --apply → 連 live 驗證。
 */

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serviceAccount = JSON.parse(
  readFileSync(join(__dirname, "..", "serviceAccountKey.json"), "utf8"),
);

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const DRY_RUN = !process.argv.includes("--apply");
// 備份 collection 用執行當天日期（避免硬編，跑時帶入）
const BACKUP_DATE = new Date().toISOString().slice(0, 10);
const BACKUP_COLLECTION = `tools-backup-${BACKUP_DATE}`;

// Firestore Timestamp / Date / string / {_seconds} → "YYYY-MM-DD"，無法判定回 ""
function toYMD(ts) {
  if (!ts) return "";
  let d = null;
  if (typeof ts.toDate === "function") d = ts.toDate();
  else if (ts instanceof Date) d = ts;
  else if (typeof ts === "string") d = new Date(ts);
  else if (typeof ts._seconds === "number") d = new Date(ts._seconds * 1000);
  if (!d || isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

// 回傳要寫入的 versions 陣列；不需動就回 null
function computeVersions(tool) {
  const vs = tool.versions;
  if (Array.isArray(vs) && vs.length) return null; // 已有 → skip
  const td = tool.typeData || {};
  const file =
    td.fileUrl ||
    td.skillZipUrl ||
    (tool.type === "download" ? tool.url : undefined);
  const hasSignal = Boolean(td.version || file);
  if (!hasSignal) return null; // 無訊號 → 留 []
  const row = {
    version: td.version || "v1.0",
    date: toYMD(tool.createdAt || tool.updatedAt),
    notes: "",
  };
  if (file) row.fileUrl = file;
  return [row];
}

async function main() {
  console.log(`\n=== migrate-tool-versions.mjs ===`);
  console.log(
    `模式：${DRY_RUN ? "DRY-RUN（不會寫 Firestore）" : "APPLY（會實際寫入）"}`,
  );
  console.log(`備份 collection：${BACKUP_COLLECTION}\n`);

  const snapshot = await db.collection("tools").get();
  const tools = snapshot.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => a.id.localeCompare(b.id));

  const plans = [];
  for (const tool of tools) {
    const versions = computeVersions(tool);
    plans.push({ tool, versions });
    if (versions) {
      console.log(
        `  ✏️  ${tool.id.padEnd(16)} ${tool.title || "(無 title)"}\n` +
          `      → versions[0] = ${JSON.stringify(versions[0])}`,
      );
    } else {
      const reason =
        Array.isArray(tool.versions) && tool.versions.length
          ? "已有 versions"
          : "無版本訊號";
      console.log(
        `  ⏭️  ${tool.id.padEnd(16)} ${tool.title || ""}  (skip: ${reason})`,
      );
    }
  }

  const toWrite = plans.filter((p) => p.versions);
  console.log(`\n── 總結 ──`);
  console.log(`  共 ${tools.length} 筆，將 seed ${toWrite.length} 筆 versions[0]`);

  if (DRY_RUN) {
    console.log(`\n>>> dry-run，沒寫入。確認後加 --apply：`);
    console.log(`    node scripts/migrate-tool-versions.mjs --apply\n`);
    return;
  }

  if (toWrite.length === 0) {
    console.log(`\n✅ 無需寫入（全部 skip）。\n`);
    return;
  }

  console.log(`\n── 備份 + 寫入 ──\n`);
  // 單一 batch：每筆 2 ops（備份 set + update），Firestore batch 上限 500
  // → 安全到 ~250 筆待 seed。目前工具數遠低於此；若日後超過需分批 commit。
  const batch = db.batch();
  const backupRef = db.collection(BACKUP_COLLECTION);
  const toolsRef = db.collection("tools");

  for (const { tool, versions } of toWrite) {
    const { id, ...originalData } = tool;
    batch.set(backupRef.doc(id), {
      ...originalData,
      _backupAt: new Date().toISOString(),
      _migrationVersion: "2026-06-05-tool-versions",
      _operation: "seed-versions",
    });
    batch.update(toolsRef.doc(id), { versions });
    console.log(`  ✅ ${id}  備份 + 寫 versions[0]`);
  }

  console.log(`\n  正在 commit batch...`);
  await batch.commit();
  console.log(`\n✅ 完成。備份：${BACKUP_COLLECTION}/{toolId}`);
  console.log(`   rollback：把 backup 的 versions 寫回（或刪掉 seed 的 versions）\n`);
}

main().catch((err) => {
  console.error("\n❌ 執行失敗：", err.message);
  console.error(err.stack);
  process.exit(1);
});
