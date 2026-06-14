import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAccessRequestUserUpdate } from "./accessRequest.mjs";

test("user 文件不存在 → 補 role:'viewer'（避免 rules 後續讀 role 為 null）", () => {
  assert.deepEqual(buildAccessRequestUserUpdate(null), {
    devStatus: "pending",
    role: "viewer",
  });
});

test("user 文件存在但缺 role → 補 role:'viewer'", () => {
  assert.deepEqual(buildAccessRequestUserUpdate({ email: "a@x.com" }), {
    devStatus: "pending",
    role: "viewer",
  });
});

test("user 已是 admin → 不覆蓋 role（只設 devStatus）", () => {
  assert.deepEqual(buildAccessRequestUserUpdate({ role: "admin" }), {
    devStatus: "pending",
  });
});

test("user 已是 developer → 不覆蓋 role", () => {
  assert.deepEqual(buildAccessRequestUserUpdate({ role: "developer" }), {
    devStatus: "pending",
  });
});

test("user 已是 viewer → 不重複寫 role", () => {
  assert.deepEqual(buildAccessRequestUserUpdate({ role: "viewer" }), {
    devStatus: "pending",
  });
});
