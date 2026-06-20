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

import { buildHealthReport } from "./healthFlags.mjs";

const NOW = Date.parse("2026-06-21T00:00:00Z");
const DAY = 86400000;
const daysAgoTs = (d) => ts(NOW - d * DAY); // ts() 已在檔案上方定義
const T = (id, extra = {}) => ({ id, title: id, status: "live", type: "webapp", ...extra });
const run = (tools, maps = {}) => buildHealthReport(tools, { ...maps, nowMs: NOW });

// ---- 熱門但陳舊 ----
test("staleHot: 公開 + 有人用 + >180 天沒更新 → 命中", () => {
  const r = run([T("a", { updatedAt: daysAgoTs(200) })], { viewsMap: { a: 50 } });
  assert.equal(r.staleHot.length, 1);
  assert.equal(r.staleHot[0].id, "a");
  assert.equal(r.staleHot[0].ageDays, 200);
});

test("staleHot: 剛好 180 天（不 > 門檻）→ 不中；181 天 → 中", () => {
  assert.equal(run([T("a", { updatedAt: daysAgoTs(180) })], { viewsMap: { a: 50 } }).staleHot.length, 0);
  assert.equal(run([T("a", { updatedAt: daysAgoTs(181) })], { viewsMap: { a: 50 } }).staleHot.length, 1);
});

test("staleHot: fresh（近期更新）→ 不中", () => {
  assert.equal(run([T("a", { updatedAt: daysAgoTs(10) })], { viewsMap: { a: 50 } }).staleHot.length, 0);
});

test("staleHot: 沒人用（views<門檻 且 opens=0）→ 不中", () => {
  const r = run([T("a", { updatedAt: daysAgoTs(300) }), T("b", { updatedAt: daysAgoTs(5) })],
    { viewsMap: { a: 0, b: 40 } });
  assert.equal(r.staleHot.length, 0);
});

test("staleHot: opens>=1 也算有人用", () => {
  const r = run([T("a", { updatedAt: daysAgoTs(300) })], { viewsMap: { a: 0 }, opensMap: { a: 2 } });
  assert.equal(r.staleHot.length, 1);
});

test("staleHot: import 工具只有 createdAt 又舊又被用 → 命中", () => {
  const r = run([T("a", { createdAt: daysAgoTs(400) })], { viewsMap: { a: 99 } });
  assert.equal(r.staleHot.length, 1);
});

// ---- 殭屍 ----
test("zombie: live + 近零使用 + >90 天 → 命中", () => {
  const r = run([T("z", { createdAt: daysAgoTs(120) })], { viewsMap: { z: 1 } });
  assert.equal(r.zombies.length, 1);
  assert.equal(r.zombies[0].id, "z");
});

test("zombie: 寬限期內（<90 天）→ 不中", () => {
  assert.equal(run([T("z", { createdAt: daysAgoTs(30) })], {}).zombies.length, 0);
});

test("zombie: 有 opens → 不中（fresh，避免落入 stale）", () => {
  const r = run([T("z", { createdAt: daysAgoTs(200), updatedAt: daysAgoTs(5) })], { opensMap: { z: 1 } });
  assert.equal(r.zombies.length, 0);
});

test("zombie: views >= 上限(3) → 不中（fresh）", () => {
  const r = run([T("z", { createdAt: daysAgoTs(200), updatedAt: daysAgoTs(5) })], { viewsMap: { z: 3 } });
  assert.equal(r.zombies.length, 0);
});

test("互斥: 被用又陳舊的公開工具進 staleHot、不進 zombie", () => {
  const r = run([T("a", { createdAt: daysAgoTs(300), updatedAt: daysAgoTs(300) })], { viewsMap: { a: 80 } });
  assert.equal(r.staleHot.length, 1);
  assert.equal(r.zombies.length, 0);
});

// ---- 卡關過久 ----
test("stuckPending: pending + >14 天 → 命中；<=14 天 → 不中", () => {
  const hit = run([T("p", { status: "pending", createdAt: daysAgoTs(20) })], {});
  assert.equal(hit.stuckPending.length, 1);
  assert.equal(hit.stuckPending[0].ageDays, 20);
  assert.equal(run([T("p", { status: "pending", createdAt: daysAgoTs(10) })], {}).stuckPending.length, 0);
});

test("stuckPending: pending 不參與 stale / zombie", () => {
  const r = run([T("p", { status: "pending", createdAt: daysAgoTs(300), updatedAt: daysAgoTs(300) })],
    { viewsMap: { p: 99 } });
  assert.equal(r.staleHot.length, 0);
  assert.equal(r.zombies.length, 0);
  assert.equal(r.stuckPending.length, 1);
});

// ---- 孤兒 key ----
test("orphanKeys: map 有 key 但無對應工具 → 列出（跨三 map union）", () => {
  const r = run([T("real", { createdAt: daysAgoTs(5) })],
    { viewsMap: { real: 5, ghost1: 9 }, opensMap: { ghost2: 1 }, helpfulMap: { ghost1: 2 } });
  assert.deepEqual(r.orphanKeys.map((o) => o.key).sort(), ["ghost1", "ghost2"]);
  const g1 = r.orphanKeys.find((o) => o.key === "ghost1");
  assert.equal(g1.views, 9);
  assert.equal(g1.helpful, 2);
});

test("orphanKeys: 對得上的工具不算孤兒", () => {
  assert.equal(run([T("real", { createdAt: daysAgoTs(5) })], { viewsMap: { real: 100 } }).orphanKeys.length, 0);
});

// ---- 整體 ----
test("nowMs 缺 / tools 非陣列 → 全空報告", () => {
  assert.deepEqual(buildHealthReport([T("a")], {}).counts, { staleHot: 0, zombies: 0, stuckPending: 0, orphanKeys: 0 });
  assert.deepEqual(buildHealthReport(null, { nowMs: NOW }).staleHot, []);
});

test("counts 與陣列長度一致", () => {
  const r = run([
    T("s", { updatedAt: daysAgoTs(300) }),
    T("p", { status: "pending", createdAt: daysAgoTs(40) }),
  ], { viewsMap: { s: 50 } });
  assert.equal(r.counts.staleHot, r.staleHot.length);
  assert.equal(r.counts.stuckPending, r.stuckPending.length);
});

test("不 mutate 輸入 tools", () => {
  const tools = Object.freeze([Object.freeze(T("a", { updatedAt: daysAgoTs(300) }))]);
  assert.doesNotThrow(() => run(tools, { viewsMap: { a: 9 } }));
});
