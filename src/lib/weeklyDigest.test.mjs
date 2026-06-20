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

test("buildDigestMessage：超過 maxItems → 只列上限 + 帶『…還有 N 個』且總數誠實", () => {
  const many = Array.from({ length: 40 }, (_, i) => T(`工具${i}`, NOW));
  const msg = buildDigestMessage(many, 15);
  assert.ok(msg.includes("（40）"), "標題仍顯示真實總數 40");
  assert.ok(msg.includes("…還有 25 個新資源"), "超出 15 筆以摘要帶過");
  assert.ok(msg.includes("工具0") && msg.includes("工具14"), "前 15 筆有列出");
  assert.ok(!msg.includes("工具15"), "第 16 筆不應逐筆列出");
});

test("buildDigestMessage：無 overflow 時不出現『…還有』", () => {
  const msg = buildDigestMessage([T("a", NOW), T("b", NOW)], 15);
  assert.ok(!msg.includes("…還有"));
});

test("buildDigestMessage：過長 tagline 被截斷", () => {
  const longTag = "x".repeat(500);
  const msg = buildDigestMessage([{ title: "T", tagline: longTag }], 15, 80);
  assert.ok(!msg.includes(longTag), "原始超長 tagline 不應整段出現");
  assert.ok(msg.includes("…"), "截斷處應有省略號");
});

test("buildDigestMessage：大量工具下總長度仍遠低於 Discord 2000 上限", () => {
  const many = Array.from({ length: 200 }, (_, i) => ({
    title: `工具${i}`,
    tagline: "說明".repeat(60),
  }));
  const msg = buildDigestMessage(many);
  assert.ok(msg.length < 2000, `訊息長度應 < 2000，實得 ${msg.length}`);
});

test("buildDigestMessage：超長 title（admin 自由輸入）也被擠進 2000 內", () => {
  // 15 筆、每筆 title/tagline 各 300 字（admin input 無 maxLength）→ per-field 截斷
  // 不足以保證總長，需總長度硬上限把尾端項目擠掉。
  const many = Array.from({ length: 15 }, () => ({
    title: "標".repeat(300),
    tagline: "x".repeat(300),
  }));
  const msg = buildDigestMessage(many);
  assert.ok(msg.length < 2000, `應 < 2000，實得 ${msg.length}`);
  assert.ok(msg.includes("（15）"), "標題仍顯示真實總數 15");
  assert.ok(msg.includes("…還有"), "尾端被擠掉時帶 overflow 提示");
  assert.ok(!msg.includes("標".repeat(300)), "原始超長 title 不應整段出現");
});
