import { test } from "node:test";
import assert from "node:assert/strict";
import { eventField, shouldTrack, buildIncrements } from "./trackEvents.mjs";

test("eventField：已知事件回 camelCase 欄位", () => {
  assert.equal(eventField("tool_open"), "toolOpen");
  assert.equal(eventField("tool_view"), "toolView");
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

test("buildIncrements：tool_open + toolId → byToolKey（viewToolKey null）", () => {
  assert.deepEqual(buildIncrements("tool_open", "t1"), {
    field: "toolOpen",
    byToolKey: "t1",
    viewToolKey: null,
  });
});

test("buildIncrements：tool_view + toolId → viewToolKey（byToolKey null）", () => {
  assert.deepEqual(buildIncrements("tool_view", "t1"), {
    field: "toolView",
    byToolKey: null,
    viewToolKey: "t1",
  });
});

test("buildIncrements：search 無 toolId → 兩 key 皆 null", () => {
  assert.deepEqual(buildIncrements("search"), {
    field: "search",
    byToolKey: null,
    viewToolKey: null,
  });
});

test("buildIncrements：tool_view 無 toolId → 兩 key 皆 null", () => {
  assert.deepEqual(buildIncrements("tool_view"), {
    field: "toolView",
    byToolKey: null,
    viewToolKey: null,
  });
});

test("buildIncrements：未知事件回 null", () => {
  assert.equal(buildIncrements("evil", "t1"), null);
});
