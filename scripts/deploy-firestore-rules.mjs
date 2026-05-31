/**
 * deploy-firestore-rules.mjs
 *
 * 用 service account 透過 Firebase Security Rules REST API 部署 firestore.rules。
 * 仿 scripts/deploy-storage-rules.mjs。
 *
 * ⚠️ 前提：service account 需有 `roles/firebaserules.admin`。預設 Admin SDK SA
 *    只能「建 ruleset」但不能「發布 release」（會 403）。若沒這權限，請改用
 *    Firebase Console → Firestore Database → 規則 → 貼上 firestore.rules → 發布。
 *
 * 用法：node scripts/deploy-firestore-rules.mjs
 */

import { GoogleAuth } from 'google-auth-library';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const keyPath = join(__dirname, '..', 'serviceAccountKey.json');
const sa = JSON.parse(readFileSync(keyPath, 'utf8'));
const PROJECT = sa.project_id;
const rulesContent = readFileSync(join(__dirname, '..', 'firestore.rules'), 'utf8');

const auth = new GoogleAuth({
  keyFile: keyPath,
  scopes: ['https://www.googleapis.com/auth/cloud-platform', 'https://www.googleapis.com/auth/firebase'],
});

async function main() {
  const client = await auth.getClient();
  const token = (await client.getAccessToken()).token;
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  console.log(`\n=== deploy-firestore-rules.mjs ===\nProject: ${PROJECT}\n`);

  // 1. 建 ruleset
  console.log('1. 建立 ruleset...');
  const rsRes = await fetch(`https://firebaserules.googleapis.com/v1/projects/${PROJECT}/rulesets`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ source: { files: [{ name: 'firestore.rules', content: rulesContent }] } }),
  });
  if (!rsRes.ok) throw new Error(`建 ruleset 失敗 (${rsRes.status}): ${await rsRes.text()}`);
  const ruleset = await rsRes.json();
  console.log(`   ✅ ruleset: ${ruleset.name}`);

  // 2. 綁定 release（firestore release 名稱固定為 cloud.firestore）
  const releaseName = `projects/${PROJECT}/releases/cloud.firestore`;
  console.log('2. 綁定 release...');
  let relRes = await fetch(`https://firebaserules.googleapis.com/v1/projects/${PROJECT}/releases`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ name: releaseName, rulesetName: ruleset.name }),
  });
  if (relRes.status === 409) {
    console.log('   release 已存在，改用 PATCH 更新...');
    relRes = await fetch(`https://firebaserules.googleapis.com/v1/${releaseName}?updateMask=rulesetName`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ name: releaseName, rulesetName: ruleset.name }),
    });
  }
  if (!relRes.ok) throw new Error(`綁 release 失敗 (${relRes.status}): ${await relRes.text()}`);
  console.log(`   ✅ release 綁定完成：cloud.firestore`);
  console.log(`\n✅ firestore.rules 已部署\n`);
}

main().catch(err => {
  console.error('\n❌', err.message);
  process.exit(1);
});
