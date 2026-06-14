import { test } from "node:test";
import assert from "node:assert/strict";
import { rankPopularTools } from "./popularTools.mjs";

const T = (id, status = "live") => ({ id, status, title: id });

test("依瀏覽數由大到小、截斷 top N", () => {
  const out = rankPopularTools([T("a"), T("b"), T("c")], { a: 5, b: 20, c: 12 }, {
    limit: 2,
    minWithViews: 1,
  });
  assert.deepEqual(out.map((t) => t.id), ["b", "c"]);
});

test("未達 minWithViews → 回 []", () => {
  const out = rankPopularTools([T("a"), T("b")], { a: 3 }, { minWithViews: 3 });
  assert.deepEqual(out, []);
});

test("排除非 live/beta/new（terminated/dev/pending）", () => {
  const tools = [T("a", "terminated"), T("b", "dev"), T("c", "pending"), T("d", "live")];
  const out = rankPopularTools(tools, { a: 99, b: 99, c: 99, d: 5 }, { minWithViews: 1 });
  assert.deepEqual(out.map((t) => t.id), ["d"]);
});

test("瀏覽數為 0 / 缺鍵的工具不列入", () => {
  const out = rankPopularTools([T("a"), T("b"), T("c")], { a: 4 }, { minWithViews: 1 });
  assert.deepEqual(out.map((t) => t.id), ["a"]);
});

test("同分維持原始順序（穩定排序）", () => {
  const out = rankPopularTools([T("a"), T("b"), T("c")], { a: 7, b: 7, c: 7 }, {
    minWithViews: 1,
    limit: 3,
  });
  assert.deepEqual(out.map((t) => t.id), ["a", "b", "c"]);
});

test("空 / 缺參數安全", () => {
  assert.deepEqual(rankPopularTools(), []);
  assert.deepEqual(rankPopularTools([], {}), []);
});
