// 唯讀盤點：列出 tools 缺 authorUid/status/createdAt 的文件；確認 painCards 無 authorUid。
// 執行：node scripts/__audit-tool-fields.mjs（連正式 Firestore，唯讀）
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sa = JSON.parse(
  readFileSync(join(__dirname, "..", "serviceAccountKey.json"), "utf8"),
);
initializeApp({ credential: cert(sa) });
const db = getFirestore();

const tools = await db.collection("tools").get();
const missing = [];
tools.forEach((d) => {
  const x = d.data();
  const miss = [];
  if (!("authorUid" in x)) miss.push("authorUid");
  if (!("status" in x)) miss.push("status");
  if (!("createdAt" in x)) miss.push("createdAt");
  if (miss.length) missing.push({ id: d.id, title: x.title, missing: miss.join(",") });
});
console.log(`\ntools 共 ${tools.size} 筆；缺欄位 ${missing.length} 筆：`);
if (missing.length) console.table(missing);
else console.log("  （全部都有 authorUid/status/createdAt，可安全發布規則）");

const cards = await db.collection("painCards").get();
const withAuthor = cards.docs.filter((d) => "authorUid" in d.data()).length;
console.log(`painCards 共 ${cards.size} 筆；有 authorUid 的 ${withAuthor} 筆（預期 0）。`);

process.exit(0);
