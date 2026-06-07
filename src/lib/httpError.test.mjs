import { test } from "node:test";
import assert from "node:assert/strict";
import { HttpError } from "./httpError.mjs";

test("HttpError 帶 status/message、是 Error、name 正確", () => {
  const e = new HttpError(403, "權限不足");
  assert.equal(e.status, 403);
  assert.equal(e.message, "權限不足");
  assert.equal(e.name, "HttpError");
  assert.ok(e instanceof Error);
});
