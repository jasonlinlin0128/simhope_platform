// src/lib/healthFlags.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { toMs, toolFreshnessMs } from "./healthFlags.mjs";

const ts = (ms) => ({ toMillis: () => ms }); // 模擬 Firestore Timestamp

test("toMs: number 原樣；非有限 → null", () => {
  assert.equal(toMs(1000), 1000);
  assert.equal(toMs(0), 0);
  assert.equal(toMs(NaN), null);
  assert.equal(toMs(Infinity), null);
});

test("toMs: ISO / YYYY-MM-DD 字串 → 解析；壞字串 → null", () => {
  assert.equal(toMs("2026-01-01T00:00:00Z"), Date.parse("2026-01-01T00:00:00Z"));
  assert.equal(toMs("2026-06-01"), Date.parse("2026-06-01"));
  assert.equal(toMs("not-a-date"), null);
});

test("toMs: Firestore Timestamp(.toMillis) / {seconds}", () => {
  assert.equal(toMs(ts(12345)), 12345);
  assert.equal(toMs({ seconds: 10 }), 10000);
});

test("toMs: null / undefined / 無法判定物件 → null", () => {
  assert.equal(toMs(null), null);
  assert.equal(toMs(undefined), null);
  assert.equal(toMs({}), null);
});

test("toolFreshnessMs: versions 末筆 date 優先", () => {
  const t = { versions: [{ date: "2026-01-01" }, { date: "2026-05-01" }], updatedAt: ts(0) };
  assert.equal(toolFreshnessMs(t), Date.parse("2026-05-01"));
});

test("toolFreshnessMs: 無 versions → updatedAt", () => {
  assert.equal(toolFreshnessMs({ updatedAt: ts(777), createdAt: ts(1) }), 777);
});

test("toolFreshnessMs: 無 versions、無 updatedAt → createdAt", () => {
  assert.equal(toolFreshnessMs({ createdAt: ts(55) }), 55);
});

test("toolFreshnessMs: 草稿版本 date='' → 跳過 → updatedAt", () => {
  assert.equal(toolFreshnessMs({ versions: [{ date: "" }], updatedAt: ts(900) }), 900);
});

test("toolFreshnessMs: 全無 → null", () => {
  assert.equal(toolFreshnessMs({}), null);
  assert.equal(toolFreshnessMs(null), null);
});

import { usageThreshold } from "./healthFlags.mjs";

const P = (id, status = "live") => ({ id, status });

test("usageThreshold: 奇數筆 → 中位數", () => {
  assert.equal(usageThreshold([P("a"), P("b"), P("c")], { a: 10, b: 30, c: 20 }), 20);
});

test("usageThreshold: 偶數筆 → 中間兩值平均", () => {
  assert.equal(usageThreshold([P("a"), P("b"), P("c"), P("d")], { a: 10, b: 20, c: 30, d: 40 }), 25);
});

test("usageThreshold: 排除零瀏覽工具（median 只看 views>0）", () => {
  assert.equal(usageThreshold([P("a"), P("b"), P("c")], { a: 0, b: 20, c: 40 }), 30);
});

test("usageThreshold: 排除非公開工具", () => {
  assert.equal(usageThreshold([P("a"), P("x", "dev"), P("y", "pending")], { a: 8, x: 100, y: 100 }), 8);
});

test("usageThreshold: 全零瀏覽 → 地板 1", () => {
  assert.equal(usageThreshold([P("a"), P("b")], { a: 0, b: 0 }), 1);
  assert.equal(usageThreshold([P("a")], {}), 1);
});

test("usageThreshold: 非陣列 → 1", () => {
  assert.equal(usageThreshold(null, {}), 1);
});
