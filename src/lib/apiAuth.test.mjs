import { test } from "node:test";
import assert from "node:assert/strict";
import { requireRole } from "./apiAuth.mjs";
import { HttpError } from "./httpError.mjs";

// 最小 Request：只實作 headers.get
function req(authHeader) {
  return {
    headers: { get: (k) => (k === "authorization" ? authHeader : null) },
  };
}

// 假 Admin SDK：exists 是 boolean property、data() 是 method（Admin SDK 語意，非 Web SDK 的 .exists()）
function fakeAdmin({
  uid = "u1",
  role,
  exists = true,
  verifyThrows = false,
} = {}) {
  return {
    adminAuth: {
      verifyIdToken: async () => {
        if (verifyThrows) throw new Error("bad token");
        return { uid };
      },
    },
    adminDb: {
      collection: () => ({
        doc: () => ({
          get: async () => ({
            exists,
            data: () => (exists ? { role } : undefined),
          }),
        }),
      }),
    },
  };
}

test("無 Authorization header → 401", async () => {
  await assert.rejects(
    () =>
      requireRole(req(null), ["admin"], {
        admin: fakeAdmin({ role: "admin" }),
      }),
    (e) => e instanceof HttpError && e.status === 401,
  );
});

test("header 非 Bearer 開頭 → 401", async () => {
  await assert.rejects(
    () =>
      requireRole(req("Token abc"), ["admin"], {
        admin: fakeAdmin({ role: "admin" }),
      }),
    (e) => e instanceof HttpError && e.status === 401,
  );
});

test("verifyIdToken reject → 401", async () => {
  await assert.rejects(
    () =>
      requireRole(req("Bearer x"), ["admin"], {
        admin: fakeAdmin({ verifyThrows: true }),
      }),
    (e) => e instanceof HttpError && e.status === 401,
  );
});

test("role 不在允許清單 → 403 + 自訂訊息", async () => {
  await assert.rejects(
    () =>
      requireRole(req("Bearer x"), ["admin"], {
        admin: fakeAdmin({ role: "developer" }),
        forbiddenMessage: "需要管理員權限",
      }),
    (e) =>
      e instanceof HttpError &&
      e.status === 403 &&
      e.message === "需要管理員權限",
  );
});

test("user doc 不存在 → 403", async () => {
  await assert.rejects(
    () =>
      requireRole(req("Bearer x"), ["admin"], {
        admin: fakeAdmin({ exists: false }),
      }),
    (e) => e instanceof HttpError && e.status === 403,
  );
});

test("role 命中 → 回 {uid, role}", async () => {
  const out = await requireRole(req("Bearer x"), ["developer", "admin"], {
    admin: fakeAdmin({ uid: "u9", role: "developer" }),
  });
  assert.deepEqual(out, { uid: "u9", role: "developer", employeeId: undefined });
});

// 入口網身分：users.employee_id → 每次回 employees 母檔確認在職
function fakePortalAdmin({ role = "viewer", employee, employeeId = "10231" } = {}) {
  const docs = {
    users: { exists: true, data: () => ({ role, employee_id: employeeId }) },
    employees: employee
      ? { exists: true, data: () => employee }
      : { exists: false, data: () => undefined },
  };
  return {
    adminAuth: { verifyIdToken: async () => ({ uid: "u1" }) },
    adminDb: { collection: (name) => ({ doc: () => ({ get: async () => docs[name] }) }) },
  };
}

test("員編帳號：母檔 active → 放行並回 employeeId", async () => {
  const out = await requireRole(req("Bearer x"), ["viewer"], {
    admin: fakePortalAdmin({ employee: { status: "active" } }),
  });
  assert.deepEqual(out, { uid: "u1", role: "viewer", employeeId: "10231" });
});

test("員編帳號：母檔 inactive → 403（停用即時封鎖，不等 token 過期）", async () => {
  await assert.rejects(
    () =>
      requireRole(req("Bearer x"), ["viewer"], {
        admin: fakePortalAdmin({ employee: { status: "inactive" } }),
      }),
    (e) => e instanceof HttpError && e.status === 403,
  );
});

test("員編帳號：母檔文件不存在 → 403（fail-closed）", async () => {
  await assert.rejects(
    () =>
      requireRole(req("Bearer x"), ["viewer"], { admin: fakePortalAdmin({ employee: null }) }),
    (e) => e instanceof HttpError && e.status === 403,
  );
});
