import { test } from "node:test";
import assert from "node:assert/strict";
import { apiErrorPayload } from "./apiErrorPayload.mjs";
import { HttpError } from "./httpError.mjs";

// 假 logger：記錄呼叫，驗證「預期錯誤不 log、非預期錯誤才 log」。
function fakeLogger() {
  const calls = [];
  return { error: (...args) => calls.push(args), calls };
}

test("HttpError → 用它的 status + message，不 log", () => {
  const log = fakeLogger();
  const out = apiErrorPayload(new HttpError(400, "格式錯誤"), "/api/x", log);
  assert.deepEqual(out, { status: 400, body: { error: "格式錯誤" } });
  assert.equal(log.calls.length, 0);
});

test("HttpError 各種 status 都正確映射", () => {
  const log = fakeLogger();
  for (const s of [403, 429, 502, 504]) {
    assert.equal(apiErrorPayload(new HttpError(s, "m"), "/api/x", log).status, s);
  }
  assert.equal(log.calls.length, 0);
});

test("一般 Error（非預期）→ 500 通用訊息 + log 帶 label", () => {
  const log = fakeLogger();
  const err = new Error("boom");
  const out = apiErrorPayload(err, "/api/y", log);
  assert.deepEqual(out, { status: 500, body: { error: "伺服器錯誤" } });
  assert.equal(log.calls.length, 1);
  assert.equal(log.calls[0][0], "[/api/y]");
  assert.equal(log.calls[0][1], err);
});

test("非 Error 物件（如字串）throw → 仍走 500 + log", () => {
  const log = fakeLogger();
  const out = apiErrorPayload("just a string", "/api/z", log);
  assert.deepEqual(out, { status: 500, body: { error: "伺服器錯誤" } });
  assert.equal(log.calls.length, 1);
});
