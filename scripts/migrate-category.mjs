// scripts/migrate-category.mjs
// 為現有 tools 補 category 欄位。預設 dry-run；--apply 才寫入。寫入前備份到 tools-backup-2026-06-01/。
// 映射：type==='mcp'→mcp；type==='skill'→skill；其餘→tool。platform/project 用 MANUAL_OVERRIDE 指定。
// ⚠️ 依 AGENTS.md：依賴 category 的 code 先 merge+deploy 成功才跑 --apply，跑完連 live 站驗證。
// ⚠️ 只在「本機」執行（吃 repo root 的 serviceAccountKey.json）；不在 CI / Vercel 上跑。
//    若 Step 1 看到的範本是用 env var 初始化 Admin SDK，照範本改用相同方式。
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const APPLY = process.argv.includes("--apply");
const BACKUP = "tools-backup-2026-06-01";

// 人工指定（Jason 看完 dry-run 後填）：{ toolId: 'platform' | 'project' }
const MANUAL_OVERRIDE = {
  // 例：'t_xxx': 'platform',
};

const __dirname = dirname(fileURLToPath(import.meta.url));
const sa = JSON.parse(
  readFileSync(join(__dirname, "..", "serviceAccountKey.json"), "utf8"),
);
initializeApp({ credential: cert(sa) });
const db = getFirestore();

// 安全檢查：印出要動的 project（dry-run 也印），避免改錯環境。
console.log(`🔑 Firebase project: ${sa.project_id}`);
console.log(`模式：${APPLY ? "APPLY（會寫入！）" : "DRY-RUN（只印，不寫）"}`);

// docId 與 data 分離 — 不把 __id 注入文件（審查指出）。
function deriveCategory(docId, data) {
  if (MANUAL_OVERRIDE[docId]) return MANUAL_OVERRIDE[docId];
  if (data.type === "mcp") return "mcp";
  if (data.type === "skill") return "skill";
  return "tool";
}

const snap = await db.collection("tools").get();
console.log(`tools 共 ${snap.size} 筆。`);

let changed = 0;
for (const doc of snap.docs) {
  const data = doc.data();
  const target = deriveCategory(doc.id, data);
  if (data.category === target) continue; // idempotent
  changed += 1;
  console.log(
    `  ${doc.id}: category ${data.category || "(無)"} → ${target}  [type=${data.type}]`,
  );
  if (APPLY) {
    await db.collection(BACKUP).doc(doc.id).set(data); // 備份原文件
    await doc.ref.update({ category: target });
  }
}
console.log(
  `${APPLY ? "已更新" : "將更新"} ${changed} 筆。${APPLY ? "備份於 " + BACKUP : "（dry-run，未寫入）"}`,
);
process.exit(0);
