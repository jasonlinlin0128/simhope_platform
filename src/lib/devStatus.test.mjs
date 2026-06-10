import { test } from "node:test";
import assert from "node:assert/strict";
import { devCtaState } from "./devStatus.mjs";

test("developer / admin → none（已有權限，角色卡已表達）", () => {
  assert.equal(devCtaState("developer", undefined), "none");
  assert.equal(devCtaState("developer", "approved"), "none");
  assert.equal(devCtaState("admin", undefined), "none");
});

test("viewer 無 devStatus → apply", () => {
  assert.equal(devCtaState("viewer", undefined), "apply");
  assert.equal(devCtaState("viewer", null), "apply");
  assert.equal(devCtaState("viewer", ""), "apply");
});

test("viewer + pending → pending", () => {
  assert.equal(devCtaState("viewer", "pending"), "pending");
});

test("viewer + rejected → rejected", () => {
  assert.equal(devCtaState("viewer", "rejected"), "rejected");
});

test("viewer + approved（防呆：role 尚未升級）→ none", () => {
  assert.equal(devCtaState("viewer", "approved"), "none");
});
