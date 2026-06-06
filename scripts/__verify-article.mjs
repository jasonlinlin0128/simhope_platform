// scripts/__verify-article.mjs — 純函式 sanity check
import assert from "node:assert";
import { splitMarkdownSections } from "../src/lib/article.js";

// 無 ## → 全進 lead（Pattern C fallback）
assert.deepEqual(
  splitMarkdownSections("**Before**：痛點\n**After**：改善"),
  { lead: "**Before**：痛點\n**After**：改善", sections: [] },
);

// lead + 2 段
{
  const r = splitMarkdownSections("開頭導言\n\n## 緣由\n內文A\n\n## 更新\n內文B");
  assert.equal(r.lead, "開頭導言");
  assert.equal(r.sections.length, 2);
  assert.deepEqual(r.sections[0], { heading: "緣由", body: "內文A" });
  assert.deepEqual(r.sections[1], { heading: "更新", body: "內文B" });
}

// ### / # 不切段（留在 body / lead）
{
  const r = splitMarkdownSections("## 標題\n### 子標題\n內文\n# 大標也不切");
  assert.equal(r.sections.length, 1);
  assert.equal(r.sections[0].heading, "標題");
  assert.ok(r.sections[0].body.includes("### 子標題"));
  assert.ok(r.sections[0].body.includes("# 大標也不切"));
}

// 行中 ## 不切
{
  const r = splitMarkdownSections("一行 ## 不是標題");
  assert.equal(r.sections.length, 0);
  assert.equal(r.lead, "一行 ## 不是標題");
}

// 空 body 段落 → body ""
{
  const r = splitMarkdownSections("## A\n## B\n內容");
  assert.deepEqual(r.sections[0], { heading: "A", body: "" });
  assert.deepEqual(r.sections[1], { heading: "B", body: "內容" });
}

// CRLF 容錯
{
  const r = splitMarkdownSections("導言\r\n## 段\r\n內文\r\n");
  assert.equal(r.lead, "導言");
  assert.deepEqual(r.sections[0], { heading: "段", body: "內文" });
}

// 空輸入
assert.deepEqual(splitMarkdownSections(""), { lead: "", sections: [] });
assert.deepEqual(splitMarkdownSections(null), { lead: "", sections: [] });

console.log("✅ article verify passed");
