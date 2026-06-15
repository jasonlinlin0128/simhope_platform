import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDemandPrompt, normalizeThemes } from "./demandBoard.mjs";

test("buildDemandPrompt：含每筆需求文字", () => {
  const p = buildDemandPrompt(["要 PDF 合併", "要翻譯產線術語"]);
  assert.ok(p.includes("要 PDF 合併"));
  assert.ok(p.includes("要翻譯產線術語"));
});

test("buildDemandPrompt：含「不可編造」與 JSON/themes 指示", () => {
  const p = buildDemandPrompt(["x"]);
  assert.ok(p.includes("不可編造"));
  assert.ok(p.includes("themes"));
});

test("normalizeThemes：正常 → 回 themes（theme/count/examples）", () => {
  const out = normalizeThemes({
    themes: [{ theme: "文件處理", count: 3, examples: ["合併 PDF"] }],
  });
  assert.deepEqual(out, [
    { theme: "文件處理", count: 3, examples: ["合併 PDF"] },
  ]);
});

test("normalizeThemes：examples 截 ≤2", () => {
  const out = normalizeThemes({
    themes: [{ theme: "x", count: 1, examples: ["a", "b", "c"] }],
  });
  assert.deepEqual(out[0].examples, ["a", "b"]);
});

test("normalizeThemes：themes 截 limit", () => {
  const themes = Array.from({ length: 10 }, (_, i) => ({
    theme: "t" + i,
    count: 1,
    examples: [],
  }));
  assert.equal(normalizeThemes({ themes }, 3).length, 3);
});

test("normalizeThemes：丟棄缺 theme / 型別錯的項目", () => {
  const out = normalizeThemes({
    themes: [{ count: 1 }, { theme: "", count: 1 }, { theme: "好的", count: 2, examples: [] }],
  });
  assert.deepEqual(out.map((t) => t.theme), ["好的"]);
});

test("normalizeThemes：count 非數字 → 轉 0；examples 非陣列 → []", () => {
  const out = normalizeThemes({
    themes: [{ theme: "x", count: "abc", examples: "nope" }],
  });
  assert.equal(out[0].count, 0);
  assert.deepEqual(out[0].examples, []);
});

test("normalizeThemes：壞結構（null / 非陣列 / 缺 themes）→ []", () => {
  assert.deepEqual(normalizeThemes(null), []);
  assert.deepEqual(normalizeThemes({}), []);
  assert.deepEqual(normalizeThemes({ themes: "x" }), []);
});
