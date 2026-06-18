import { test } from "node:test";
import assert from "node:assert/strict";
import { sortTools } from "./sortTools.mjs";

const T = (id, extra = {}) => ({ id, title: id, ...extra });

test("popular：依 viewsMap 由大到小", () => {
  const out = sortTools([T("a"), T("b"), T("c")], "popular", {
    a: 5,
    b: 20,
    c: 12,
  });
  assert.deepEqual(
    out.map((t) => t.id),
    ["b", "c", "a"],
  );
});

test("popular：缺 key / 0 view 視為 0 沉底，且穩定保持原序", () => {
  const out = sortTools([T("a"), T("b"), T("c"), T("d")], "popular", { c: 7 });
  assert.deepEqual(
    out.map((t) => t.id),
    ["c", "a", "b", "d"],
  );
});

test("popular：viewsMap undefined 安全（全 0、原序）", () => {
  const out = sortTools([T("a"), T("b")], "popular");
  assert.deepEqual(
    out.map((t) => t.id),
    ["a", "b"],
  );
});

test("recent：依 createdAt(ISO) 新到舊", () => {
  const tools = [
    T("old", { createdAt: "2026-01-01T00:00:00Z" }),
    T("new", { createdAt: "2026-06-01T00:00:00Z" }),
    T("mid", { createdAt: "2026-03-01T00:00:00Z" }),
  ];
  const out = sortTools(tools, "recent");
  assert.deepEqual(
    out.map((t) => t.id),
    ["new", "mid", "old"],
  );
});

test("recent：缺 / 無法解析 createdAt → 排最後（維持原相對順序）", () => {
  const tools = [
    T("none"),
    T("dated", { createdAt: "2026-05-01T00:00:00Z" }),
    T("bad", { createdAt: "not-a-date" }),
  ];
  const out = sortTools(tools, "recent");
  assert.equal(out[0].id, "dated");
  assert.deepEqual(
    out.slice(1).map((t) => t.id),
    ["none", "bad"],
  );
});

test("未知 mode → 回原序（淺拷貝、新陣列）", () => {
  const tools = [T("a"), T("b"), T("c")];
  const out = sortTools(tools, "xxx", { a: 1, b: 99 });
  assert.deepEqual(
    out.map((t) => t.id),
    ["a", "b", "c"],
  );
  assert.notEqual(out, tools);
});

test("tools 非陣列 / undefined → []", () => {
  assert.deepEqual(sortTools(undefined, "popular"), []);
  assert.deepEqual(sortTools(null, "recent"), []);
  assert.deepEqual(sortTools("nope", "popular"), []);
});

test("不 mutate 原 tools 陣列", () => {
  const tools = [T("a"), T("b"), T("c")];
  const before = tools.map((t) => t.id);
  sortTools(tools, "popular", { c: 9 });
  assert.deepEqual(
    tools.map((t) => t.id),
    before,
  );
});
