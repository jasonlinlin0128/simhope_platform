/**
 * import-employees.mjs — HR 名冊 CSV → employees 母檔（M2，見 docs/portal/data-model.md）
 *
 * CSV 格式：employee_id,name,department_id[,status]（UTF-8 含 header）
 *
 * === 使用方式 ===
 *   node scripts/import-employees.mjs --file roster.csv                       # dry-run
 *   node scripts/import-employees.mjs --file roster.csv --apply
 *   node scripts/import-employees.mjs --file roster.csv --apply --deactivate-missing
 *
 * 冪等：以 employee_id upsert。名冊欄位（name/department_id/status）每次覆蓋；
 * 啟用狀態（activated/uid/activation_attempts/locked_until）只在新建時初始化，
 * 重匯**不會**重置——否則會把已啟用員工打回未啟用。
 * `--deactivate-missing`：名冊外的 active 員工標 inactive（預設不開）。
 * 安全網：PITR（AGENTS.md）——不寫 in-DB 備份。**永不**直連正式員工資料庫。
 */

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { parseEmployeeCsv, planImport, CREATE_DEFAULTS } from "../src/lib/employeeImport.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DRY_RUN = !process.argv.includes("--apply");
const DEACTIVATE_MISSING = process.argv.includes("--deactivate-missing");
const fileIdx = process.argv.indexOf("--file");
const csvPath = fileIdx !== -1 ? process.argv[fileIdx + 1] : null;

if (!csvPath) {
  console.error("用法：node scripts/import-employees.mjs --file <roster.csv> [--apply] [--deactivate-missing]");
  process.exit(1);
}

const sa = JSON.parse(readFileSync(join(__dirname, "..", "serviceAccountKey.json"), "utf8"));
initializeApp({ credential: cert(sa) });
const db = getFirestore();

async function main() {
  console.log(`\n=== import-employees.mjs ===`);
  console.log(`模式：${DRY_RUN ? "DRY-RUN" : "APPLY"}  名冊：${csvPath}\n`);

  const parsed = parseEmployeeCsv(readFileSync(csvPath, "utf8"));
  if (!parsed.ok) {
    console.error("❌ CSV 驗證失敗：");
    for (const e of parsed.errors) console.error(`   ${e}`);
    process.exit(1);
  }

  const snap = await db.collection("employees").get();
  const existing = new Map(snap.docs.map((d) => [d.id, d.data()]));
  const plan = planImport(parsed.rows, existing);

  console.log(`名冊 ${parsed.rows.length} 人｜現有 ${existing.size} 筆`);
  console.log(`新建 ${plan.create.length}｜更新 ${plan.update.length}｜不變 ${plan.unchanged.length}｜名冊外 active ${plan.missing.length}\n`);
  for (const r of plan.create) console.log(`  + ${r.employee_id} ${r.name} (${r.department_id}, ${r.status})`);
  for (const r of plan.update) console.log(`  ~ ${r.employee_id} ${r.name} (${r.department_id}, ${r.status})`);
  for (const id of plan.missing) {
    console.log(`  ${DEACTIVATE_MISSING ? "− " : "! "}${id} 名冊外${DEACTIVATE_MISSING ? " → 標 inactive" : "（--deactivate-missing 才停用）"}`);
  }

  if (DRY_RUN) {
    console.log(`\n>>> dry-run，加 --apply 執行\n`);
    return;
  }

  const batch = db.batch();
  const col = db.collection("employees");
  const now = FieldValue.serverTimestamp();
  for (const r of plan.create) {
    batch.set(col.doc(r.employee_id), { ...r, ...CREATE_DEFAULTS, created_at: now, updated_at: now });
  }
  for (const r of plan.update) {
    batch.set(col.doc(r.employee_id), { ...r, updated_at: now }, { merge: true });
  }
  if (DEACTIVATE_MISSING) {
    for (const id of plan.missing) {
      batch.set(col.doc(id), { status: "inactive", updated_at: now }, { merge: true });
    }
  }
  await batch.commit();
  console.log(`\n✅ 完成。新建 ${plan.create.length}、更新 ${plan.update.length}${DEACTIVATE_MISSING ? `、停用 ${plan.missing.length}` : ""}。\n`);
}

main().catch((err) => {
  console.error("\n❌", err.message);
  console.error(err.stack);
  process.exit(1);
});
