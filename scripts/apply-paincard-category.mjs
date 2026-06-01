/**
 * apply-paincard-category.mjs
 *
 * 一次性給 24 張 painCards 補上 category 欄位（7 個類別）。
 *
 * === 使用方式 ===
 *   node scripts/apply-paincard-category.mjs              # dry-run
 *   node scripts/apply-paincard-category.mjs --apply
 *
 * 備份位置：painCards-backup-2026-05-29/{cardId}
 */

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sa = JSON.parse(
  readFileSync(join(__dirname, "..", "serviceAccountKey.json"), "utf8"),
);
initializeApp({ credential: cert(sa) });
const db = getFirestore();

const BACKUP_COLLECTION = "painCards-backup-2026-05-29";
const DRY_RUN = !process.argv.includes("--apply");

// painCard ID → category key
// 7 個類別（key 跟 app/page.jsx 跟 PainCard.jsx 的 CATEGORIES 對齊）
const CATEGORY_MAP = {
  // 🌏 跨國溝通
  pc1: "communication",

  // 📊 日報表 / 工時統計
  pc3: "reports",
  "5q7qjkx6a6y9Zwio0gja": "reports",

  // 📄 文書處理
  pc5: "documents",
  pc7: "documents",
  pc10: "documents",
  UBHH4a4lbd5ialL3OgEY: "documents",

  // 🛡️ 資安管控
  pc9: "security",
  UTfQJSfbAA3v0D1kgV91: "security",
  XHQJwluQhf9TpdFwbO5C: "security",
  YuOIoOBh7hh1ok1lxqzP: "security",

  // 🏭 生產製造
  pc11: "manufacturing",
  on2xpEWVSh1Ceg9RmDvm: "manufacturing",
  saTxNWfNZ0hkc0b1bZaU: "manufacturing",
  xmtAFiai5KUf8gd8TdSi: "manufacturing",
  pH6Mu1QJvlRHpGUg6PeP: "manufacturing",

  // 🔧 品保 / SOP
  PiRyKMvBjC71s2YKDsRr: "quality",
  pc4: "quality",
  pc6: "quality",

  // 📋 行政協作 / 知識
  pc8: "admin",
  pc_ai_1772085135196_15: "admin",
  pc2: "admin",
  pc_ai_1772085135196_10: "admin",
  L2GkFOuRnrHknOwu7QP0: "admin",
};

async function main() {
  console.log(`\n=== apply-paincard-category.mjs ===`);
  console.log(`模式：${DRY_RUN ? "DRY-RUN" : "APPLY"}\n`);

  const snap = await db.collection("painCards").get();
  const cards = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  console.log(`Firestore 共有 ${cards.length} 張 painCards\n`);

  const plans = [];
  const notFound = [];

  for (const card of cards) {
    const target = CATEGORY_MAP[card.id];
    if (!target) {
      notFound.push(card);
      continue;
    }
    if (card.category === target) {
      plans.push({ card, target, noop: true });
    } else {
      plans.push({ card, target, noop: false });
    }
  }

  console.log("── 變更 ──\n");
  let needsUpdate = 0;
  for (const { card, target, noop } of plans) {
    const tag = noop
      ? "（已是新版）"
      : `${card.category || "(無)"} → ${target}`;
    console.log(`  ${card.id.padEnd(28)} ${tag}`);
    if (!noop) needsUpdate++;
  }

  if (notFound.length > 0) {
    console.log("\n⚠️  沒列在 CATEGORY_MAP 的 painCards：");
    for (const c of notFound) console.log(`  ${c.id}`);
  }

  console.log(`\n── 總結 ──`);
  console.log(`  需要更新: ${needsUpdate}`);
  console.log(`  未涵蓋  : ${notFound.length}`);

  if (DRY_RUN) {
    console.log(`\n>>> dry-run，加 --apply：`);
    console.log(`    node scripts/apply-paincard-category.mjs --apply\n`);
    return;
  }

  // APPLY
  console.log(`\n── 寫入 ──\n`);
  const batch = db.batch();
  const backupRef = db.collection(BACKUP_COLLECTION);
  const cardsRef = db.collection("painCards");

  for (const { card, target, noop } of plans) {
    if (noop) continue;
    const { id, ...original } = card;
    batch.set(backupRef.doc(card.id), {
      ...original,
      _backupAt: new Date().toISOString(),
      _migrationVersion: "2026-05-29-paincard-category",
    });
    batch.update(cardsRef.doc(card.id), { category: target });
    console.log(`  ✅ ${card.id.padEnd(28)} category=${target}`);
  }

  await batch.commit();
  console.log(`\n✅ 完成。備份位置：${BACKUP_COLLECTION}/{id}\n`);
}

main().catch((err) => {
  console.error("\n❌", err.message);
  console.error(err.stack);
  process.exit(1);
});
