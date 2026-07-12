/**
 * seed-portal-dev.mjs — 本機開發種子資料（僅限 emulator，見 docs/portal/data-model.md §3）
 *
 * === 使用方式 ===
 *   firebase emulators:start --only firestore,auth
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node scripts/seed-portal-dev.mjs
 *
 * 安全閥：未偵測到 FIRESTORE_EMULATOR_HOST 一律拒跑——此 script 不做 dry-run，
 * 絕不允許指向正式專案。
 *
 * 目前涵蓋 PR-1 範圍（departments/employees）；apps/audit 樣本隨 PR-4/PR-3 擴充。
 */

import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error("❌ 拒跑：未設 FIRESTORE_EMULATOR_HOST（本 script 僅限 emulator）");
  process.exit(1);
}

initializeApp({ projectId: "demo-simhope-portal" });
const db = getFirestore();

const DEPARTMENTS = [
  { department_id: "dept-admin", name: "經企室", parent_id: null },
  { department_id: "dept-mfg", name: "製造部", parent_id: null },
  { department_id: "dept-qa", name: "品保部", parent_id: null },
];

// 6 員工：1 inactive（驗停用封鎖）、1 已啟用（驗重匯不重置）、其餘未啟用
const EMPLOYEES = [
  { employee_id: "10001", name: "林測試", department_id: "dept-admin", status: "active", activated: true, uid: "seed-uid-10001" },
  { employee_id: "10002", name: "王小明", department_id: "dept-mfg", status: "active" },
  { employee_id: "10003", name: "李小華", department_id: "dept-mfg", status: "active" },
  { employee_id: "10004", name: "陳大文", department_id: "dept-qa", status: "active" },
  { employee_id: "10005", name: "張離職", department_id: "dept-qa", status: "inactive" },
  { employee_id: "10006", name: "吳新人", department_id: "dept-admin", status: "active" },
];

async function main() {
  const now = new Date();
  const batch = db.batch();
  for (const d of DEPARTMENTS) {
    batch.set(db.collection("departments").doc(d.department_id), { ...d, created_at: now, updated_at: now });
  }
  for (const e of EMPLOYEES) {
    batch.set(db.collection("employees").doc(e.employee_id), {
      activated: false, uid: null, activation_attempts: 0, locked_until: null,
      ...e, created_at: now, updated_at: now,
    });
  }
  await batch.commit();
  console.log(`✅ seed 完成：${DEPARTMENTS.length} 部門、${EMPLOYEES.length} 員工（emulator: ${process.env.FIRESTORE_EMULATOR_HOST}）`);
}

main().catch((err) => {
  console.error("❌", err.message);
  process.exit(1);
});
