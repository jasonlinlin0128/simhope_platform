import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchWithTimeout } from "./fetchWithTimeout.mjs";

test("正常回應 → 回傳 response 並注入 AbortSignal", async () => {
  let seen;
  const fake = async (url, opts) => {
    seen = { url, opts };
    return { ok: true, status: 200 };
  };
  const res = await fetchWithTimeout(
    "https://x/y",
    { headers: { A: "1" } },
    { fetchImpl: fake },
  );
  assert.equal(res.status, 200);
  assert.equal(seen.url, "https://x/y");
  assert.equal(seen.opts.headers.A, "1");
  assert.ok(seen.opts.signal instanceof AbortSignal);
});

test("保留呼叫端 options（method / redirect 不被吃掉）", async () => {
  let seen;
  const fake = async (url, opts) => {
    seen = opts;
    return { ok: true };
  };
  await fetchWithTimeout("u", { method: "POST", redirect: "manual" }, { fetchImpl: fake });
  assert.equal(seen.method, "POST");
  assert.equal(seen.redirect, "manual");
});

test("逾時 → 觸發 abort → reject（AbortError）", async () => {
  // fetchImpl 永不自行 resolve，只在收到 abort 時 reject（模擬掛住的上游）
  const hang = (url, opts) =>
    new Promise((_, reject) => {
      opts.signal.addEventListener("abort", () => {
        const e = new Error("aborted");
        e.name = "AbortError";
        reject(e);
      });
    });
  await assert.rejects(
    () => fetchWithTimeout("u", {}, { timeoutMs: 10, fetchImpl: hang }),
    (e) => e.name === "AbortError",
  );
});
