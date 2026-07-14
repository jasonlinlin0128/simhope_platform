import { test } from "node:test";
import assert from "node:assert/strict";
import {
  aliasEmail,
  checkPasswordPolicy,
  validateActivateInput,
  activationGate,
  applyFailedAttempt,
  MAX_ATTEMPTS,
  LOCK_MS,
  ACTIVATING_STALE_MS,
} from "./activation.mjs";

const NOW = 1_800_000_000_000;
const emp = (over = {}) => ({
  name: "王小明", department_id: "dept-mfg", status: "active",
  activated: false, uid: null, activation_attempts: 0, locked_until: null,
  ...over,
});

test("aliasEmail：確定性、小寫", () => {
  assert.equal(aliasEmail("10231"), "emp10231@portal.simhope.internal");
  assert.equal(aliasEmail("A-01"), "empa-01@portal.simhope.internal");
});

test("密碼政策：長度/純數字/含員編/含統編", () => {
  const ctx = { employeeId: "10231", taxId: "12345678" };
  assert.equal(checkPasswordPolicy("short", ctx).ok, false);
  assert.equal(checkPasswordPolicy("1990010119", ctx).ok, false); // 純數字（生日類）
  assert.equal(checkPasswordPolicy("x10231abcdef", ctx).ok, false); // 含員編
  assert.equal(checkPasswordPolicy("x12345678abc", ctx).ok, false); // 含統編
  assert.equal(checkPasswordPolicy("correct-horse-battery", ctx).ok, true);
  assert.equal(checkPasswordPolicy(null, ctx).ok, false);
});

test("validateActivateInput：型別與員編格式，統一錯誤訊息", () => {
  assert.equal(validateActivateInput({ employee_id: "10231", tax_id: "1", new_password: "x" }).ok, true);
  for (const bad of [
    {},
    { employee_id: 123, tax_id: "1", new_password: "x" },
    { employee_id: "emp 1", tax_id: "1", new_password: "x" },
    { employee_id: "10231", tax_id: "", new_password: "x" },
    { employee_id: "10231", tax_id: "1", new_password: 42 },
  ]) {
    const r = validateActivateInput(bad);
    assert.equal(r.ok, false);
    assert.equal(r.error, "啟用資訊不正確");
  }
});

test("activationGate：不存在/inactive → 401 統一訊息", () => {
  assert.equal(activationGate(null, NOW).code, 401);
  assert.equal(activationGate(emp({ status: "inactive" }), NOW).code, 401);
  assert.equal(activationGate(null, NOW).error, "啟用資訊不正確");
});

test("activationGate：鎖定中 → 429；鎖過期放行", () => {
  assert.equal(activationGate(emp({ locked_until: NOW + 1000 }), NOW).code, 429);
  assert.equal(activationGate(emp({ locked_until: NOW - 1000 }), NOW).ok, true);
});

test("activationGate：已啟用 → 409（防搶註）", () => {
  assert.equal(activationGate(emp({ activated: true }), NOW).code, 409);
});

test("activationGate：activating 未過時限 → 409；stale → 續跑 resume=true", () => {
  const fresh = activationGate(emp({ activating_at: NOW - 1000 }), NOW);
  assert.equal(fresh.code, 409);
  const stale = activationGate(emp({ activating_at: NOW - ACTIVATING_STALE_MS - 1 }), NOW);
  assert.equal(stale.ok, true);
  assert.equal(stale.resume, true);
});

test("activationGate：正常未啟用 → ok, resume=false", () => {
  const r = activationGate(emp(), NOW);
  assert.equal(r.ok, true);
  assert.equal(r.resume, false);
});

test("applyFailedAttempt：遞增；達上限鎖 15 分", () => {
  assert.deepEqual(applyFailedAttempt(emp(), NOW), {
    activation_attempts: 1, locked_until: null,
  });
  const r = applyFailedAttempt(emp({ activation_attempts: MAX_ATTEMPTS - 1 }), NOW);
  assert.deepEqual(r, { activation_attempts: MAX_ATTEMPTS, locked_until: NOW + LOCK_MS });
});
