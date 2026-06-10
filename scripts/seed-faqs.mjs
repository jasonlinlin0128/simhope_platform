/**
 * seed-faqs.mjs
 *
 * 解析 docs/faq-content-2026-06-09.md（校對後的 FAQ 草稿），seed 進 faqs collection。
 * 之後的增刪改走 admin 後台 FaqManager；本 script 只負責一次性起手內容。
 *
 * === 使用方式 ===
 *   node scripts/seed-faqs.mjs           # dry-run（只讀＋印出將寫入的內容）
 *   node scripts/seed-faqs.mjs --apply   # 寫入
 *
 * 慣例對齊（repo migration scripts）：
 * - dry-run 預設、--apply 才寫入
 * - idempotent：deterministic doc id `seed-<category>-<order>` 已存在→跳過；
 *   另比對 question 全文，若 Jason 已用後台手貼同題（auto id）也跳過，不產生重複。
 * - 不備份：本 script 只「新增」文件，不碰任何既有 doc（非破壞性，同
 *   backfill-challenge-expireat 的理由）；seeded doc id 全部 `seed-` 開頭，要清可逐筆刪。
 *
 * 欄位 schema 與 FaqManager.save() 一致：question/answer/category/order/published。
 */

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DRAFT_PATH = join(__dirname, "..", "docs", "faq-content-2026-06-09.md");
// 與 src/lib/faq.js FAQ_CATEGORIES 同步（script 跑在 node、不 import client lib）
const VALID_CATEGORIES = ["login", "usage", "submit", "security", "install"];

const DRY_RUN = !process.argv.includes("--apply");

// ── 解析草稿 ──────────────────────────────────────────────
// 結構：`## <emoji> <key> — <label>` 開分類；`### [order N] 問題` 開一題；
// 內文到下一個 ###/##/--- 為止。非分類的 ## 段（如「貼上小撇步」）自動略過。
function parseDraft(md) {
  const lines = md.split(/\r?\n/);
  const faqs = [];
  let category = null;
  let current = null; // { category, order, question, bodyLines }

  const flush = () => {
    if (!current) return;
    const answer = current.bodyLines.join("\n").trim();
    if (!answer) {
      throw new Error(`「${current.question}」沒有答案內容，草稿格式可能跑掉`);
    }
    faqs.push({
      category: current.category,
      order: current.order,
      question: current.question,
      answer,
      published: true,
    });
    current = null;
  };

  for (const line of lines) {
    const catMatch = line.match(/^## \S+ (\w+) — /);
    if (catMatch) {
      flush();
      category = VALID_CATEGORIES.includes(catMatch[1]) ? catMatch[1] : null;
      continue;
    }
    if (/^## /.test(line) || /^---\s*$/.test(line)) {
      flush();
      if (/^## /.test(line)) category = null; // 非分類段（給 Jason 的小撇步）
      continue;
    }
    const qMatch = line.match(/^### \[order (\d+)\] (.+)$/);
    if (qMatch) {
      flush();
      if (!category) continue; // 分類外的 ### 不收
      current = {
        category,
        order: Number(qMatch[1]),
        question: qMatch[2].trim(),
        bodyLines: [],
      };
      continue;
    }
    if (current) current.bodyLines.push(line);
  }
  flush();
  return faqs;
}

const md = readFileSync(DRAFT_PATH, "utf8");
const faqs = parseDraft(md);

console.log("=== seed-faqs.mjs ===");
console.log(`模式：${DRY_RUN ? "DRY-RUN（只讀）" : "APPLY（寫入）"}\n`);
console.log(`草稿解析出 ${faqs.length} 題：`);
for (const c of VALID_CATEGORIES) {
  const n = faqs.filter((f) => f.category === c).length;
  console.log(`  ${c}: ${n} 題`);
}

const sa = JSON.parse(
  readFileSync(join(__dirname, "..", "serviceAccountKey.json"), "utf8"),
);
initializeApp({ credential: cert(sa) });
const db = getFirestore();

const snap = await db.collection("faqs").get();
const existingIds = new Set(snap.docs.map((d) => d.id));
const existingQuestions = new Set(
  snap.docs.map((d) => (d.data().question || "").trim()),
);
console.log(`\nfaqs collection 現有：${snap.size} 筆`);

let toWrite = [];
let skipped = 0;
for (const f of faqs) {
  const id = `seed-${f.category}-${f.order}`;
  if (existingIds.has(id) || existingQuestions.has(f.question)) {
    skipped++;
    console.log(`  跳過（已存在）：${id} ${f.question}`);
    continue;
  }
  toWrite.push({ id, data: f });
}

console.log(`\n待寫入 ${toWrite.length} 筆、跳過 ${skipped} 筆`);
for (const { id, data } of toWrite) {
  console.log(`\n── ${id}（order ${data.order}）`);
  console.log(`Q: ${data.question}`);
  console.log(`A: ${data.answer.slice(0, 120)}${data.answer.length > 120 ? "…" : ""}`);
}

if (DRY_RUN) {
  console.log("\n>>> dry-run，確認內容後加 --apply 寫入：");
  console.log("    node scripts/seed-faqs.mjs --apply");
  process.exit(0);
}

if (!toWrite.length) {
  console.log("\n沒有要寫入的，結束。");
  process.exit(0);
}

const batch = db.batch();
for (const { id, data } of toWrite) {
  batch.set(db.collection("faqs").doc(id), data);
}
await batch.commit();
console.log(`\n✅ 完成。${toWrite.length} 題已寫入 faqs collection。`);
console.log("   到 /faq 驗證顯示；後續編輯走 admin 後台 FaqManager。");
process.exit(0);
