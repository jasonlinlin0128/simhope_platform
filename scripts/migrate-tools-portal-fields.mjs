/**
 * migrate-tools-portal-fields.mjs — M1：既有 tools 補上入口網欄位
 * （docs/portal/data-model.md §2）
 *
 * === 使用方式 ===
 *   node scripts/migrate-tools-portal-fields.mjs            # dry-run
 *   node scripts/migrate-tools-portal-fields.mjs --apply
 *
 * 補的預設值**刻意等於現狀**，跑完前後行為必須完全一致：
 *   visibility = PUBLIC_ALL          （現在每個工具本來就全站可見）
 *   data_classification = internal
 *   supports_sso = false
 *   allowed_users/departments/roles = []
 *   authentication_mode = 依 type 推斷（webapp/embedded→EXTERNAL_AUTH，其餘→PUBLIC_LINK）
 *
 * 冪等：已有 visibility 的文件整筆跳過。安全網＝PITR（AGENTS.md，不寫 in-DB 備份）。
 *
 * ⚠️ 順序鐵律（AGENTS.md）：code merge → production deploy → 才跑 --apply → live 驗證。
 * 本 migration 之所以可以「先跑或後跑都不會壞」，是因為 rules 與 canAccessApp 都把
 * 「visibility 欄位缺席」視為 PUBLIC_ALL——但仍請照鐵律走。
 */

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DRY_RUN = !process.argv.includes("--apply");

const sa = JSON.parse(
  readFileSync(join(__dirname, "..", "serviceAccountKey.json"), "utf8"),
);
initializeApp({ credential: cert(sa) });
const db = getFirestore();

/** 有自己登入機制的類型視為 EXTERNAL_AUTH；純連結/下載/文件視為 PUBLIC_LINK。 */
function inferAuthMode(type) {
  return ["webapp", "embedded", "api", "mcp"].includes(type)
    ? "EXTERNAL_AUTH"
    : "PUBLIC_LINK";
}

async function main() {
  console.log(`\n=== migrate-tools-portal-fields.mjs ===`);
  console.log(`模式：${DRY_RUN ? "DRY-RUN" : "APPLY"}\n`);

  const snap = await db.collection("tools").get();
  const todo = snap.docs.filter((d) => !("visibility" in d.data()));

  console.log(`工具總數 ${snap.size}｜需補欄位 ${todo.length}｜已有 ${snap.size - todo.length}\n`);
  for (const d of todo) {
    const t = d.data();
    console.log(
      `  + ${d.id.padEnd(24)} status=${(t.status ?? "?").padEnd(10)} type=${(t.type ?? "?").padEnd(9)} → visibility=PUBLIC_ALL, auth=${inferAuthMode(t.type)}`,
    );
  }

  if (DRY_RUN) {
    console.log(`\n>>> dry-run，加 --apply 執行\n`);
    return;
  }
  if (todo.length === 0) {
    console.log("沒有需要處理的文件。\n");
    return;
  }

  console.log(`\n⚠️  APPLY 前請記下 UTC 時間（出事用 PITR 回滾）：${new Date().toISOString()}\n`);

  const batch = db.batch();
  for (const d of todo) {
    const t = d.data();
    batch.set(
      d.ref,
      {
        visibility: "PUBLIC_ALL", // ← 等於現狀：全站可見，零行為變化
        authentication_mode: inferAuthMode(t.type),
        supports_sso: false,
        data_classification: "internal",
        allowed_users: [],
        allowed_departments: [],
        allowed_roles: [],
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  }
  await batch.commit();
  console.log(`✅ 完成。${todo.length} 個工具已補上入口網欄位。`);
  console.log(`   下一步：連 live 站確認工具數量與 migration 前一致（AGENTS.md 第 4 點）。\n`);
}

main().catch((err) => {
  console.error("\n❌", err.message);
  console.error(err.stack);
  process.exit(1);
});
