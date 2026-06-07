import { test } from "node:test";
import assert from "node:assert/strict";
import { callGemini } from "./gemini.mjs";
import { HttpError } from "./httpError.mjs";

const KEY = "AIzaTESTKEY0000000000000000000000000000"; // 形狀用，僅需 truthy

// 攔截 init 並回傳可控 Response 形狀
function makeFetch({ ok = true, status = 200, text = "", json = {} } = {}) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init });
    return { ok, status, text: async () => text, json: async () => json };
  };
  fn.calls = calls;
  return fn;
}

// 包裝成 Gemini 回應形狀
function geminiJson(payloadText) {
  return { candidates: [{ content: { parts: [{ text: payloadText }] } }] };
}

test("送出 x-goog-api-key header、model 在 URL、prompt 在 body、signal 有接上", async () => {
  const fetchImpl = makeFetch({ json: geminiJson('{"a":1}') });
  await callGemini({ prompt: "hello", json: true, fetchImpl, apiKey: KEY });
  const { url, init } = fetchImpl.calls[0];
  assert.equal(init.headers["x-goog-api-key"], KEY);
  assert.ok(url.includes("gemini-2.5-flash"));
  const body = JSON.parse(init.body);
  assert.equal(body.contents[0].parts[0].text, "hello");
  assert.ok(init.signal instanceof AbortSignal);
});

test("json 模式解析 ```json 包裹輸出", async () => {
  const fetchImpl = makeFetch({ json: geminiJson('```json\n{"x":2}\n```') });
  const out = await callGemini({
    prompt: "p",
    json: true,
    fetchImpl,
    apiKey: KEY,
  });
  assert.deepEqual(out, { x: 2 });
});

test("json 模式：空 text → {}", async () => {
  const fetchImpl = makeFetch({ json: geminiJson("") });
  const out = await callGemini({
    prompt: "p",
    json: true,
    fetchImpl,
    apiKey: KEY,
  });
  assert.deepEqual(out, {});
});

test("json 模式：壞 JSON → HttpError 502", async () => {
  const fetchImpl = makeFetch({ json: geminiJson("not json {{{") });
  await assert.rejects(
    () => callGemini({ prompt: "p", json: true, fetchImpl, apiKey: KEY }),
    (e) => e instanceof HttpError && e.status === 502,
  );
});

test("text 模式回 trimmed 字串", async () => {
  const fetchImpl = makeFetch({ json: geminiJson("  hi there \n") });
  const out = await callGemini({
    prompt: "p",
    json: false,
    fetchImpl,
    apiKey: KEY,
  });
  assert.equal(out, "hi there");
});

test("非 ok 回應 → HttpError 502（訊息含 status）", async () => {
  const fetchImpl = makeFetch({
    ok: false,
    status: 503,
    text: "upstream boom",
  });
  await assert.rejects(
    () => callGemini({ prompt: "p", json: true, fetchImpl, apiKey: KEY }),
    (e) =>
      e instanceof HttpError && e.status === 502 && e.message.includes("503"),
  );
});

test("generationConfig：json 帶 responseMimeType；maxOutputTokens 給了才帶", async () => {
  const f1 = makeFetch({ json: geminiJson("{}") });
  await callGemini({ prompt: "p", json: true, fetchImpl: f1, apiKey: KEY });
  const c1 = JSON.parse(f1.calls[0].init.body).generationConfig;
  assert.equal(c1.responseMimeType, "application/json");
  assert.equal(c1.maxOutputTokens, undefined);

  const f2 = makeFetch({ json: geminiJson("text") });
  await callGemini({
    prompt: "p",
    json: false,
    maxOutputTokens: 500,
    fetchImpl: f2,
    apiKey: KEY,
  });
  const c2 = JSON.parse(f2.calls[0].init.body).generationConfig;
  assert.equal(c2.responseMimeType, undefined);
  assert.equal(c2.maxOutputTokens, 500);
});

test("缺 apiKey → HttpError 500", async () => {
  await assert.rejects(
    () => callGemini({ prompt: "p", fetchImpl: makeFetch(), apiKey: "" }),
    (e) => e instanceof HttpError && e.status === 500,
  );
});

test("fetch 同步丟 AbortError → HttpError 504", async () => {
  const fetchImpl = async () => {
    const err = new Error("aborted");
    err.name = "AbortError";
    throw err;
  };
  await assert.rejects(
    () => callGemini({ prompt: "p", fetchImpl, apiKey: KEY }),
    (e) => e instanceof HttpError && e.status === 504,
  );
});

test("真實 timeout：setTimeout abort signal → HttpError 504", async () => {
  // fetchImpl 永不主動 resolve，只在 signal abort 時 reject AbortError
  const fetchImpl = (url, init) =>
    new Promise((_resolve, reject) => {
      init.signal.addEventListener("abort", () => {
        const err = new Error("aborted");
        err.name = "AbortError";
        reject(err);
      });
    });
  await assert.rejects(
    () => callGemini({ prompt: "p", timeoutMs: 5, fetchImpl, apiKey: KEY }),
    (e) => e instanceof HttpError && e.status === 504,
  );
});

test("非 ok：上游細節進 log 但遮罩 key，且不洩漏給 client", async () => {
  const rawKey = "AIza" + "x".repeat(35); // 39 字、符合遮罩 regex
  const fetchImpl = makeFetch({ ok: false, status: 500, text: `boom key=${rawKey}` });
  const logs = [];
  const orig = console.error;
  console.error = (...args) => logs.push(args.join(" "));
  let thrown;
  try {
    await callGemini({ prompt: "p", json: true, fetchImpl, apiKey: KEY });
  } catch (e) {
    thrown = e;
  } finally {
    console.error = orig;
  }
  // 對外：generic 502，不含上游 body 或 key
  assert.ok(thrown instanceof HttpError && thrown.status === 502);
  assert.ok(!thrown.message.includes(rawKey));
  assert.ok(!thrown.message.includes("boom"));
  // server log：有記上游細節，但 key 已遮罩
  const logged = logs.join("\n");
  assert.ok(logged.includes("AIza***"));
  assert.ok(!logged.includes(rawKey));
});
