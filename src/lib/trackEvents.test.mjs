import { test } from "node:test";
import assert from "node:assert/strict";
import {
  eventField,
  shouldTrack,
  buildIncrements,
  ANON_TRACK_EVENTS,
} from "./trackEvents.mjs";

test("eventField：已知事件回 camelCase 欄位", () => {
  assert.equal(eventField("tool_open"), "toolOpen");
  assert.equal(eventField("tool_view"), "toolView");
  assert.equal(eventField("tool_helpful"), "toolHelpful");
  assert.equal(eventField("search"), "search");
  assert.equal(eventField("request_submit"), "requestSubmit");
});

test("eventField：未知 / 空事件回 null", () => {
  assert.equal(eventField("evil"), null);
  assert.equal(eventField(""), null);
  assert.equal(eventField(undefined), null);
});

function fakeSeen() {
  const s = new Set();
  return { has: (k) => s.has(k), add: (k) => s.add(k) };
}

test("shouldTrack：未知事件不送", () => {
  assert.equal(shouldTrack("evil", "evil:1", fakeSeen()), false);
});

test("shouldTrack：不去重事件（key=null）每次都送", () => {
  const seen = fakeSeen();
  assert.equal(shouldTrack("search", null, seen), true);
  assert.equal(shouldTrack("search", null, seen), true);
});

test("shouldTrack：同 key 第二次不送、不同 key 仍送", () => {
  const seen = fakeSeen();
  assert.equal(shouldTrack("tool_open", "tool_open:t1", seen), true);
  assert.equal(shouldTrack("tool_open", "tool_open:t1", seen), false);
  assert.equal(shouldTrack("tool_open", "tool_open:t2", seen), true);
});

test("buildIncrements：tool_open + toolId", () => {
  assert.deepEqual(buildIncrements("tool_open", "t1"), {
    field: "toolOpen",
    byToolKey: "t1",
    viewToolKey: null,
    helpfulToolKey: null,
  });
});

test("buildIncrements：tool_view + toolId", () => {
  assert.deepEqual(buildIncrements("tool_view", "t1"), {
    field: "toolView",
    byToolKey: null,
    viewToolKey: "t1",
    helpfulToolKey: null,
  });
});

test("buildIncrements：tool_helpful + toolId", () => {
  assert.deepEqual(buildIncrements("tool_helpful", "t1"), {
    field: "toolHelpful",
    byToolKey: null,
    viewToolKey: null,
    helpfulToolKey: "t1",
  });
});

test("buildIncrements：search 無 toolId → 三 key 皆 null", () => {
  assert.deepEqual(buildIncrements("search"), {
    field: "search",
    byToolKey: null,
    viewToolKey: null,
    helpfulToolKey: null,
  });
});

test("buildIncrements：未知事件回 null", () => {
  assert.equal(buildIncrements("evil", "t1"), null);
});

// ── C3：knownToolIds 過濾（防 aggregate doc 長孤兒 key）──

test("buildIncrements：給 knownToolIds，id 在集合內 → 保留 per-tool key", () => {
  const known = new Set(["t1", "t2"]);
  assert.deepEqual(buildIncrements("tool_view", "t1", known), {
    field: "toolView",
    byToolKey: null,
    viewToolKey: "t1",
    helpfulToolKey: null,
  });
});

test("buildIncrements：給 knownToolIds，id 不在集合內 → per-tool key 設 null，但 field 仍累計", () => {
  const known = new Set(["t1", "t2"]);
  assert.deepEqual(buildIncrements("tool_view", "evil-fake-id", known), {
    field: "toolView", // 全域總數仍 +1
    byToolKey: null,
    viewToolKey: null, // 孤兒 key 不寫
    helpfulToolKey: null,
  });
  // tool_open 同理
  assert.deepEqual(buildIncrements("tool_open", "evil-fake-id", known), {
    field: "toolOpen",
    byToolKey: null,
    viewToolKey: null,
    helpfulToolKey: null,
  });
});

test("buildIncrements：未給 knownToolIds → 不過濾（fail-open，向後相容）", () => {
  assert.equal(buildIncrements("tool_view", "anything").viewToolKey, "anything");
  // 傳非 Set（如空目錄被誤傳 [])也不過濾
  assert.equal(
    buildIncrements("tool_view", "anything", []).viewToolKey,
    "anything",
  );
});

test("ANON_TRACK_EVENTS：含匿名事件、排除 tool_helpful", () => {
  assert.ok(ANON_TRACK_EVENTS.has("tool_open"));
  assert.ok(ANON_TRACK_EVENTS.has("tool_view"));
  assert.ok(ANON_TRACK_EVENTS.has("search"));
  assert.ok(ANON_TRACK_EVENTS.has("request_submit"));
  assert.ok(!ANON_TRACK_EVENTS.has("tool_helpful")); // 改走 /api/tool-helpful
});
