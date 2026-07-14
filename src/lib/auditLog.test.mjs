import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildAuditEntry,
  sanitizeDetail,
  writeAudit,
  RETENTION_DAYS,
} from "./auditLog.mjs";

const NOW = 1_800_000_000_000;
const req = (headers = {}) => ({ headers: { get: (k) => headers[k] ?? null } });

test("buildAuditEntry：基本欄位 + TTL expireAt 400 天", () => {
  const e = buildAuditEntry({ action: "AUTH_ACTIVATE", actorEmployeeId: "10231", now: NOW });
  assert.equal(e.action, "AUTH_ACTIVATE");
  assert.equal(e.actor_employee_id, "10231");
  assert.equal(e.actor_uid, null);
  assert.equal(e.result, "ok");
  assert.equal(e.ts, NOW);
  assert.equal(e.expireAt.getTime(), NOW + RETENTION_DAYS * 86400000);
});

test("buildAuditEntry：從 request 取 ip / ua（截斷）", () => {
  const e = buildAuditEntry({
    action: "AUTH_LOGIN",
    now: NOW,
    request: req({ "x-forwarded-for": "1.2.3.4, 5.6.7.8", "user-agent": "x".repeat(500) }),
  });
  assert.equal(e.ip, "1.2.3.4"); // 取第一個
  assert.equal(e.ua.length, 300);
});

test("buildAuditEntry：無 request → ip/ua 為 null，不炸", () => {
  const e = buildAuditEntry({ action: "AUTH_LOGIN", now: NOW });
  assert.equal(e.ip, null);
  assert.equal(e.ua, null);
});

test("buildAuditEntry：未知 action / result 直接拋（防打錯字寫進髒資料）", () => {
  assert.throws(() => buildAuditEntry({ action: "HACK", now: NOW }));
  assert.throws(() => buildAuditEntry({ action: "AUTH_LOGIN", result: "maybe", now: NOW }));
});

test("sanitizeDetail：遮蔽密碼/token/統編類 key", () => {
  const d = sanitizeDetail({
    new_password: "hunter2",
    idToken: "abc",
    tax_id: "12345678",
    client_secret: "s",
    employee_id: "10231",
  });
  assert.equal(d.new_password, "[redacted]");
  assert.equal(d.idToken, "[redacted]");
  assert.equal(d.tax_id, "[redacted]");
  assert.equal(d.client_secret, "[redacted]");
  assert.equal(d.employee_id, "10231"); // 非敏感，保留
});

test("sanitizeDetail：巢狀物件遞迴保留、字串截斷；超大 detail → _truncated", () => {
  const d = sanitizeDetail({ before: { a: 1 }, note: "x".repeat(500) });
  assert.deepEqual(d.before, { a: 1 }); // 遞迴保留結構（權限 diff 要看得懂）
  assert.equal(d.note.length, 200);

  const huge = Object.fromEntries(
    Array.from({ length: 50 }, (_, i) => [`k${i}`, "y".repeat(200)]),
  );
  const t = sanitizeDetail(huge);
  assert.equal(t._truncated, true);
  assert.ok(t._keys.length > 0); // 至少留下有哪些欄位，不是整包蒸發
});

test("sanitizeDetail：非物件 → null", () => {
  assert.equal(sanitizeDetail(null), null);
  assert.equal(sanitizeDetail("str"), null);
  assert.equal(sanitizeDetail([1]), null);
});

test("sanitizeDetail：遞迴遮蔽巢狀敏感 key（權限 diff 本來就是巢狀）", () => {
  const d = sanitizeDetail({ diff: { before: { password: "p" }, after: { role: "admin" } } });
  assert.equal(d.diff.before.password, "[redacted]");
  assert.equal(d.diff.after.role, "admin");
});

test("writeAudit：組裝＋寫入 audit_logs collection", async () => {
  const added = [];
  const db = { collection: (c) => ({ add: async (e) => added.push([c, e]) }) };
  await writeAudit(db, { action: "APP_OPEN", target: "quote", now: NOW });
  assert.equal(added.length, 1);
  assert.equal(added[0][0], "audit_logs");
  assert.equal(added[0][1].target, "quote");
});

test("writeAudit：fail-soft — 寫入失敗不拋，只記 error log", async () => {
  const errs = [];
  const db = { collection: () => ({ add: async () => { throw new Error("firestore down"); } }) };
  await writeAudit(db, { action: "AUTH_LOGIN", now: NOW }, { error: (...a) => errs.push(a) });
  assert.equal(errs.length, 1);
});

test("writeAudit：fail-soft 也涵蓋組裝錯誤（未知 action 不得炸掉主要操作）", async () => {
  const errs = [];
  const db = { collection: () => ({ add: async () => {} }) };
  await writeAudit(db, { action: "TYPO_ACTION", now: NOW }, { error: (...a) => errs.push(a) });
  assert.equal(errs.length, 1); // 不應 reject
});
