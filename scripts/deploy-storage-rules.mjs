/**
 * deploy-storage-rules.mjs
 *
 * 用 service account 透過 Firebase Security Rules REST API 部署 storage.rules，
 * 不需要 firebase CLI、不需要互動登入。
 *
 * ⚠️ 前提：service account 需有 `roles/firebaserules.admin`（Firebase Rules Admin）。
 *    預設的 Admin SDK SA 只能「建 ruleset」但不能「發布 release」（會 403）。
 *    若沒這權限，請改用 Firebase Console → Storage → Rules → 貼上 storage.rules → 發布。
 *
 * 流程：
 *   1. service account 取 access token
 *   2. 建 ruleset（上傳 storage.rules 內容）
 *   3. 建/更新 release，把 ruleset 綁到 storage bucket
 *
 * 用法：node scripts/deploy-storage-rules.mjs
 */

import { GoogleAuth } from "google-auth-library";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const keyPath = join(__dirname, "..", "serviceAccountKey.json");
const sa = JSON.parse(readFileSync(keyPath, "utf8"));
const PROJECT = sa.project_id; // simhope-platform
const BUCKET = `${PROJECT}.firebasestorage.app`;
const rulesContent = readFileSync(
  join(__dirname, "..", "storage.rules"),
  "utf8",
);

const auth = new GoogleAuth({
  keyFile: keyPath,
  scopes: [
    "https://www.googleapis.com/auth/cloud-platform",
    "https://www.googleapis.com/auth/firebase",
  ],
});

async function main() {
  const client = await auth.getClient();
  const token = (await client.getAccessToken()).token;
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  console.log(`\n=== deploy-storage-rules.mjs ===`);
  console.log(`Project: ${PROJECT}\nBucket:  ${BUCKET}\n`);

  // 1. 建 ruleset
  console.log("1. 建立 ruleset...");
  const rsRes = await fetch(
    `https://firebaserules.googleapis.com/v1/projects/${PROJECT}/rulesets`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        source: { files: [{ name: "storage.rules", content: rulesContent }] },
      }),
    },
  );
  if (!rsRes.ok) {
    throw new Error(`建 ruleset 失敗 (${rsRes.status}): ${await rsRes.text()}`);
  }
  const ruleset = await rsRes.json();
  console.log(`   ✅ ruleset: ${ruleset.name}`);

  // 2. 建/更新 release（storage release 名稱格式：firebase.storage/<bucket>）
  const releaseId = `firebase.storage/${BUCKET}`;
  const releaseName = `projects/${PROJECT}/releases/${releaseId}`;

  console.log("2. 綁定 release...");
  // 先試 create；若已存在 (409) 改用 patch 更新
  let relRes = await fetch(
    `https://firebaserules.googleapis.com/v1/projects/${PROJECT}/releases`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ name: releaseName, rulesetName: ruleset.name }),
    },
  );

  if (relRes.status === 409) {
    console.log("   release 已存在，改用 PATCH 更新...");
    relRes = await fetch(
      `https://firebaserules.googleapis.com/v1/${releaseName}?updateMask=rulesetName`,
      {
        method: "PATCH",
        headers,
        body: JSON.stringify({ name: releaseName, rulesetName: ruleset.name }),
      },
    );
  }

  if (!relRes.ok) {
    throw new Error(
      `綁 release 失敗 (${relRes.status}): ${await relRes.text()}`,
    );
  }
  console.log(`   ✅ release 綁定完成：${releaseId}`);
  console.log(`\n✅ storage.rules 已部署到 ${BUCKET}\n`);
}

main().catch((err) => {
  console.error("\n❌", err.message);
  process.exit(1);
});
