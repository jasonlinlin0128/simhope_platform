import { test } from "node:test";
import assert from "node:assert/strict";
import { sameTimestamp } from "./sameTimestamp.mjs";

const ts = (ms) => ({
  toMillis: () => ms,
  isEqual(o) {
    return o && typeof o.toMillis === "function" && o.toMillis() === ms;
  },
});

test("both undefined → true（legacy 無 marker）", () => {
  assert.equal(sameTimestamp(undefined, undefined), true);
  assert.equal(sameTimestamp(null, null), true);
});

test("一有一無 → false", () => {
  assert.equal(sameTimestamp(ts(1000), undefined), false);
  assert.equal(sameTimestamp(undefined, ts(1000)), false);
});

test("isEqual 相同 → true", () => {
  assert.equal(sameTimestamp(ts(1700000000000), ts(1700000000000)), true);
});

test("isEqual 不同 → false", () => {
  assert.equal(sameTimestamp(ts(1700000000000), ts(1700000000001)), false);
});

test("toMillis fallback（無 isEqual）→ 比 toMillis", () => {
  const a = { toMillis: () => 5 };
  const b = { toMillis: () => 5 };
  const c = { toMillis: () => 6 };
  assert.equal(sameTimestamp(a, b), true);
  assert.equal(sameTimestamp(a, c), false);
});
