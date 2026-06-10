import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeMetrics } from "./metrics.mjs";

test("normalizeMetrics：完整資料原樣帶出", () => {
  assert.deepEqual(
    normalizeMetrics({ toolOpen: 5, toolView: 9, search: 2, requestSubmit: 1 }),
    { toolOpen: 5, toolView: 9, search: 2, requestSubmit: 1 },
  );
});

test("normalizeMetrics：缺欄 / 空 / undefined 補 0", () => {
  assert.deepEqual(normalizeMetrics({ toolOpen: 3 }), {
    toolOpen: 3,
    toolView: 0,
    search: 0,
    requestSubmit: 0,
  });
  assert.deepEqual(normalizeMetrics({}), {
    toolOpen: 0,
    toolView: 0,
    search: 0,
    requestSubmit: 0,
  });
  assert.deepEqual(normalizeMetrics(), {
    toolOpen: 0,
    toolView: 0,
    search: 0,
    requestSubmit: 0,
  });
});
