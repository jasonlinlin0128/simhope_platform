import { test } from "node:test";
import assert from "node:assert/strict";
import { selectRecentTools, buildDigestMessage } from "./weeklyDigest.mjs";

const NOW = 1_000_000_000_000; // 固定基準
const DAY = 24 * 60 * 60 * 1000;
const T = (id, createdAtMs, status = "live") => ({
  id,
  title: id,
  tagline: id + " tagline",
  status,
  createdAtMs,
});

test("selectRecentTools：保留近 7 天 + 公開狀態", () => {
  const out = selectRecentTools(
    [T("a", NOW - 1 * DAY), T("b", NOW - 6 * DAY)],
    NOW,
  );
  assert.deepEqual(out.map((t) => t.id), ["a", "b"]);
});

test("selectRecentTools：排除超過 7 天的", () => {
  const out = selectRecentTools([T("old", NOW - 8 * DAY)], NOW);
  assert.deepEqual(out, []);
});

test("selectRecentTools：排除非公開狀態（dev/terminated/pending）", () => {
  const out = selectRecentTools(
    [T("a", NOW, "dev"), T("b", NOW, "terminated"), T("c", NOW, "pending"), T("d", NOW, "new")],
    NOW,
  );
  assert.deepEqual(out.map((t) => t.id), ["d"]);
});

test("selectRecentTools：排除缺 / 非數字 createdAtMs", () => {
  const out = selectRecentTools(
    [T("a", null), T("b", undefined), T("c", "x"), T("d", NOW)],
    NOW,
  );
  assert.deepEqual(out.map((t) => t.id), ["d"]);
});

test("selectRecentTools：空 / null 安全", () => {
  assert.deepEqual(selectRecentTools(undefined, NOW), []);
  assert.deepEqual(selectRecentTools([], NOW), []);
});

test("buildDigestMessage：多筆 → 含筆數與每筆名稱", () => {
  const msg = buildDigestMessage([T("工具A", NOW), T("工具B", NOW)]);
  assert.ok(msg.includes("2"));
  assert.ok(msg.includes("工具A") && msg.includes("工具B"));
});

test("buildDigestMessage：空 / null → null", () => {
  assert.equal(buildDigestMessage([]), null);
  assert.equal(buildDigestMessage(null), null);
});
