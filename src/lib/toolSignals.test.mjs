import { test } from "node:test";
import assert from "node:assert/strict";
import { buildToolSignalRows, sortToolSignalRows } from "./toolSignals.mjs";

const T = (id, extra = {}) => ({ id, title: id, status: "live", type: "webapp", ...extra });

// ---- buildToolSignalRows ----

test("build：正常 join 三訊號", () => {
  const tools = [T("a"), T("b")];
  const rows = buildToolSignalRows(tools, {
    viewsMap: { a: 10, b: 3 },
    opensMap: { a: 5 },
    helpfulMap: { b: 7 },
  });
  assert.deepEqual(rows, [
    { id: "a", title: "a", status: "live", type: "webapp", views: 10, opens: 5, helpful: 0 },
    { id: "b", title: "b", status: "live", type: "webapp", views: 3, opens: 0, helpful: 7 },
  ]);
});

test("build：缺訊號 / 非數值 / 負值 → 0", () => {
  const rows = buildToolSignalRows([T("a")], {
    viewsMap: { a: "nope" },
    opensMap: { a: -4 },
    helpfulMap: {},
  });
  assert.deepEqual(rows[0], {
    id: "a", title: "a", status: "live", type: "webapp", views: 0, opens: 0, helpful: 0,
  });
});

test("build：title 缺 → 用 id；status / type 缺 → 空字串", () => {
  const rows = buildToolSignalRows([{ id: "x" }], {});
  assert.deepEqual(rows[0], {
    id: "x", title: "x", status: "", type: "", views: 0, opens: 0, helpful: 0,
  });
});

test("build：tools 非陣列 → []", () => {
  assert.deepEqual(buildToolSignalRows(undefined, {}), []);
  assert.deepEqual(buildToolSignalRows(null), []);
  assert.deepEqual(buildToolSignalRows("nope", {}), []);
});

test("build：maps 全缺 → 三訊號皆 0", () => {
  const rows = buildToolSignalRows([T("a"), T("b")]);
  assert.deepEqual(rows.map((r) => [r.views, r.opens, r.helpful]), [
    [0, 0, 0],
    [0, 0, 0],
  ]);
});

test("build：不 mutate 輸入 tools / maps", () => {
  const tools = Object.freeze([Object.freeze(T("a"))]);
  const maps = Object.freeze({ viewsMap: Object.freeze({ a: 9 }) });
  const rows = buildToolSignalRows(tools, maps); // 不應丟錯
  assert.equal(rows[0].views, 9);
  assert.notEqual(rows[0], tools[0]); // 回新物件
});

// ---- sortToolSignalRows ----

const R = (id, views, opens, helpful) => ({ id, views, opens, helpful });

test("sort：依 views 遞減", () => {
  const out = sortToolSignalRows([R("a", 5, 0, 0), R("b", 20, 0, 0), R("c", 12, 0, 0)], "views");
  assert.deepEqual(out.map((r) => r.id), ["b", "c", "a"]);
});

test("sort：依 opens 遞減", () => {
  const out = sortToolSignalRows([R("a", 0, 1, 0), R("b", 0, 9, 0), R("c", 0, 4, 0)], "opens");
  assert.deepEqual(out.map((r) => r.id), ["b", "c", "a"]);
});

test("sort：依 helpful 遞減", () => {
  const out = sortToolSignalRows([R("a", 0, 0, 2), R("b", 0, 0, 8), R("c", 0, 0, 5)], "helpful");
  assert.deepEqual(out.map((r) => r.id), ["b", "c", "a"]);
});

test("sort：同值穩定保序、0 沉底", () => {
  const out = sortToolSignalRows([R("a", 0, 0, 0), R("b", 7, 0, 0), R("c", 7, 0, 0), R("d", 0, 0, 0)], "views");
  assert.deepEqual(out.map((r) => r.id), ["b", "c", "a", "d"]);
});

test("sort：未知 / 缺 key → 原序淺拷貝（新陣列）", () => {
  const rows = [R("a", 1, 0, 0), R("b", 9, 0, 0)];
  const out = sortToolSignalRows(rows, "title");
  assert.deepEqual(out.map((r) => r.id), ["a", "b"]);
  assert.notEqual(out, rows);
});

test("sort：rows 非陣列 → []", () => {
  assert.deepEqual(sortToolSignalRows(undefined, "views"), []);
  assert.deepEqual(sortToolSignalRows(null, "opens"), []);
});

test("sort：不 mutate 輸入陣列", () => {
  const rows = [R("a", 1, 0, 0), R("b", 9, 0, 0), R("c", 4, 0, 0)];
  const before = rows.map((r) => r.id);
  sortToolSignalRows(rows, "views");
  assert.deepEqual(rows.map((r) => r.id), before);
});
