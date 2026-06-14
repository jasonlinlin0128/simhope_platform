import { test } from "node:test";
import assert from "node:assert/strict";
import { buildFindToolPrompt, validateToolMatches } from "./findTool.mjs";

const TOOLS = [
  { id: "pdf", title: "PDF 工具箱", tagline: "合併拆分 PDF", scenarios: ["文件"], tags: ["pdf", "合併"] },
  { id: "trans", title: "現場翻譯", tagline: "產線術語翻譯", scenarios: ["產線"], tags: ["翻譯"] },
];

// ---- buildFindToolPrompt ----
test("buildFindToolPrompt：含使用者 query", () => {
  const p = buildFindToolPrompt("我要合併 PDF", TOOLS);
  assert.ok(p.includes("我要合併 PDF"));
});

test("buildFindToolPrompt：列出每個工具的 id 與 title", () => {
  const p = buildFindToolPrompt("x", TOOLS);
  assert.ok(p.includes("pdf") && p.includes("PDF 工具箱"));
  assert.ok(p.includes("trans") && p.includes("現場翻譯"));
});

test("buildFindToolPrompt：含「不可編造」與 JSON schema 指示", () => {
  const p = buildFindToolPrompt("x", TOOLS);
  assert.ok(p.includes("不可編造"));
  assert.ok(p.includes("toolIds") && p.includes("reply"));
});

// ---- validateToolMatches ----
test("validateToolMatches：保留存在的 id、回完整工具物件", () => {
  const out = validateToolMatches({ toolIds: ["pdf"], reply: "找到了" }, TOOLS);
  assert.equal(out.reply, "找到了");
  assert.deepEqual(out.tools.map((t) => t.id), ["pdf"]);
});

test("validateToolMatches：濾掉不存在（幻覺）的 id", () => {
  const out = validateToolMatches({ toolIds: ["ghost", "trans"], reply: "r" }, TOOLS);
  assert.deepEqual(out.tools.map((t) => t.id), ["trans"]);
});

test("validateToolMatches：去重 + 截上限", () => {
  const out = validateToolMatches({ toolIds: ["pdf", "pdf", "trans"], reply: "r" }, TOOLS, 1);
  assert.deepEqual(out.tools.map((t) => t.id), ["pdf"]);
});

test("validateToolMatches：空 toolIds → tools 空 + 無結果 reply", () => {
  const out = validateToolMatches({ toolIds: [], reply: "" }, TOOLS);
  assert.deepEqual(out.tools, []);
  assert.ok(out.reply.includes("沒有現成"));
});

test("validateToolMatches：有結果但 reply 空 → 給通用 reply", () => {
  const out = validateToolMatches({ toolIds: ["pdf"], reply: "" }, TOOLS);
  assert.deepEqual(out.tools.map((t) => t.id), ["pdf"]);
  assert.ok(out.reply.length > 0);
});

test("validateToolMatches：壞輸入（null / 缺欄位）安全退化", () => {
  assert.deepEqual(validateToolMatches(null, TOOLS).tools, []);
  assert.deepEqual(validateToolMatches({}, TOOLS).tools, []);
  assert.deepEqual(validateToolMatches({ toolIds: "x" }, TOOLS).tools, []);
  assert.deepEqual(validateToolMatches({ toolIds: ["pdf"] }, null).tools, []);
});
