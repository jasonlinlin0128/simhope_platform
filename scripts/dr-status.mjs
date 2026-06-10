/**
 * dr-status.mjs — 唯讀查 Firestore DR 狀態（PITR + backup schedule + 近期 backups）。
 * 用法：node scripts/dr-status.mjs
 *
 * 註：SA 可讀 database metadata（PITR 狀態），但**無權列 backup schedules/backups**
 * （403，與建 index/發 rules 同樣的 SA 權限缺口）。故 ②③ 會回 403 → 改用 gcloud：
 *   gcloud firestore backups schedules list --database='(default)' --project=simhope-platform
 *   gcloud firestore backups list --project=simhope-platform
 */
import { GoogleAuth } from "google-auth-library";

const PERM_HINT = (cmd) =>
  `（SA 無權限列出 → 改用 gcloud：${cmd}）`;

const PROJECT = "simhope-platform";
const LOCATION = "asia-east1";
const DB = "(default)";
const base = `https://firestore.googleapis.com/v1/projects/${PROJECT}`;

const auth = new GoogleAuth({
  keyFile: "./serviceAccountKey.json",
  scopes: ["https://www.googleapis.com/auth/cloud-platform"],
});
const client = await auth.getClient();
const get = async (url) => (await client.request({ url })).data;

console.log("=== Firestore DR 狀態 ===\n");

// 1) PITR
try {
  const d = await get(`${base}/databases/${encodeURIComponent(DB)}`);
  const on =
    d.pointInTimeRecoveryEnablement === "POINT_IN_TIME_RECOVERY_ENABLED";
  console.log(`① PITR：${on ? "✅ ENABLED" : "❌ DISABLED"}`);
  if (on) {
    console.log(`   最早可復原：${d.earliestVersionTime || "(尚無)"}`);
    console.log(`   保留期：${d.versionRetentionPeriod || "(?)"}`);
  }
} catch (e) {
  console.log("① PITR：查詢失敗", e.response?.status || e.message);
}

// 2) backup schedules
try {
  const d = await get(
    `${base}/databases/${encodeURIComponent(DB)}/backupSchedules`,
  );
  const list = d.backupSchedules || [];
  console.log(`\n② Backup schedules：${list.length} 條`);
  for (const s of list) {
    const ret = s.retention || "?";
    const rec = s.dailyRecurrence
      ? "daily"
      : s.weeklyRecurrence
        ? "weekly"
        : "?";
    console.log(`   - ${rec}，保留 ${ret}（${s.name?.split("/").pop()}）`);
  }
  if (list.length === 0) console.log("   ❌ 尚無排程備份");
} catch (e) {
  const s = e.response?.status;
  console.log(
    `\n② Backup schedules：${s === 403 ? PERM_HINT("gcloud firestore backups schedules list --database='(default)' --project=simhope-platform") : "查詢失敗 " + (s || e.message)}`,
  );
}

// 3) 近期 backups
try {
  const d = await get(`${base}/locations/${LOCATION}/backups`);
  const list = d.backups || [];
  console.log(`\n③ 近期 backups：${list.length} 個`);
  for (const b of list.slice(0, 5)) {
    console.log(
      `   - ${b.snapshotTime || "?"}  state=${b.state}  (${b.name?.split("/").pop()})`,
    );
  }
  if (list.length === 0)
    console.log("   （尚無 — 排程建立後第一個 daily backup 才會出現）");
} catch (e) {
  const s = e.response?.status;
  console.log(
    `\n③ 近期 backups：${s === 403 ? PERM_HINT("gcloud firestore backups list --project=simhope-platform") : "查詢失敗 " + (s || e.message)}`,
  );
}

process.exit(0);
