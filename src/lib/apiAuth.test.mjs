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
  assert.deepEqual(out, { uid: "u9", role: "developer" });
});
