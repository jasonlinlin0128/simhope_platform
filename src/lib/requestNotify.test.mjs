import { test } from "node:test";
import assert from "node:assert/strict";
import { notifyUidForHandled, hasUnreadHandled } from "./requestNotify.mjs";

test("notifyUidForHandled：有 uid → 回 uid", () => {
  assert.equal(notifyUidForHandled({ uid: "u1" }), "u1");
});

test("notifyUidForHandled：匿名（無 uid / 空字串）→ null", () => {
  assert.equal(notifyUidForHandled({ message: "x" }), null);
  assert.equal(notifyUidForHandled({ uid: "" }), null);
});

test("notifyUidForHandled：null / 非物件 → null（安全）", () => {
  assert.equal(notifyUidForHandled(null), null);
  assert.equal(notifyUidForHandled(undefined), null);
  assert.equal(notifyUidForHandled("x"), null);
});

test("hasUnreadHandled：unreadHandledRequest=true → true", () => {
  assert.equal(hasUnreadHandled({ unreadHandledRequest: true }), true);
});

test("hasUnreadHandled：false / 缺欄位 / null → false", () => {
  assert.equal(hasUnreadHandled({ unreadHandledRequest: false }), false);
  assert.equal(hasUnreadHandled({}), false);
  assert.equal(hasUnreadHandled(null), false);
});
