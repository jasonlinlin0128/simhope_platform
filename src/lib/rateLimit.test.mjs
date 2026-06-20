import { test } from "node:test";
import assert from "node:assert/strict";
import { rateLimit, clientIp, enforceRateLimit } from "./rateLimit.mjs";
import { HttpError } from "./httpError.mjs";

// 每個測試傳自己的 store → 天然隔離（毋需 reset hook）。
function newStore() {
  return { hits: new Map(), lastSweep: 0 };
}
// 可控時鐘：clk.now 傳給 rateLimit，clk.advance 推進時間。
function fakeClock(start = 0) {
  let t = start;
  return { now: () => t, advance: (ms) => (t += ms) };
}
const OPTS = { limit: 3, windowMs: 1000 };

// ── 滑動視窗（characterization：保護 .js→.mjs 搬移行為不變）──

test("未達上限：ok 且 remaining 遞減", () => {
  const store = newStore();
  const clk = fakeClock();
  assert.deepEqual(rateLimit("ip", OPTS, clk.now, store), {
    ok: true,
    remaining: 2,
  });
  assert.deepEqual(rateLimit("ip", OPTS, clk.now, store), {
    ok: true,
    remaining: 1,
  });
  assert.deepEqual(rateLimit("ip", OPTS, clk.now, store), {
    ok: true,
    remaining: 0,
  });
});

test("達上限：第 limit+1 次 ok:false、remaining:0", () => {
  const store = newStore();
  const clk = fakeClock();
  for (let i = 0; i < 3; i++) rateLimit("ip", OPTS, clk.now, store);
  assert.deepEqual(rateLimit("ip", OPTS, clk.now, store), {
    ok: false,
    remaining: 0,
  });
});

test("拒絕的請求不消耗未來額度", () => {
  const store = newStore();
  const clk = fakeClock();
  for (let i = 0; i < 3; i++) rateLimit("ip", OPTS, clk.now, store); // t=0 用滿
  clk.advance(500);
  assert.equal(rateLimit("ip", OPTS, clk.now, store).ok, false); // t=500 被擋、不該 push
  clk.advance(600); // t=1100：原 3 筆(t=0)出窗
  // 若被擋那次誤 push t=500，這裡 remaining 會是 1 而非 2
  assert.deepEqual(rateLimit("ip", OPTS, clk.now, store), {
    ok: true,
    remaining: 2,
  });
});

test("視窗滑動：舊 timestamps 過期、額度回復", () => {
  const store = newStore();
  const clk = fakeClock();
  for (let i = 0; i < 3; i++) rateLimit("ip", OPTS, clk.now, store); // t=0 滿
  assert.equal(rateLimit("ip", OPTS, clk.now, store).ok, false);
  clk.advance(1000); // t=1000：t=0 那批剛好出窗
  assert.deepEqual(rateLimit("ip", OPTS, clk.now, store), {
    ok: true,
    remaining: 2,
  });
});

// ── 漏水修正（sweep）──

test("sweep 清掉只打一次的 stale key → store 不無限成長", () => {
  const store = newStore();
  const clk = fakeClock();
  for (let i = 0; i < 100; i++) rateLimit(`ip${i}`, OPTS, clk.now, store); // 100 個一次性 key
  assert.equal(store.hits.size, 100);
  clk.advance(OPTS.windowMs * 2); // 全部出窗
  rateLimit("trigger", OPTS, clk.now, store); // 後續呼叫應觸發 sweep
  assert.ok(
    store.hits.size <= 1,
    `stale key 應被清掉、只剩 trigger；實得 size=${store.hits.size}`,
  );
});

test("sweep 不誤清視窗內仍活躍的 key", () => {
  const store = newStore();
  const clk = fakeClock();
  rateLimit("active", OPTS, clk.now, store); // t=0
  clk.advance(300);
  rateLimit("active", OPTS, clk.now, store); // t=300：active=[0,300]
  clk.advance(800); // t=1100：跨過 sweep 門檻
  rateLimit("other", OPTS, clk.now, store); // sweep：active 過濾後留 [300]、不應被清
  assert.ok(store.hits.has("active"), "active 仍有窗內 timestamp，不應被清掉");
});

// ── clientIp ──

test("clientIp：取 x-forwarded-for 第一跳", () => {
  const req = {
    headers: { get: (h) => (h === "x-forwarded-for" ? "1.2.3.4, 5.6.7.8" : null) },
  };
  assert.equal(clientIp(req), "1.2.3.4");
});

test("clientIp：無 x-forwarded-for 回 unknown", () => {
  const req = { headers: { get: () => null } };
  assert.equal(clientIp(req), "unknown");
});

// ── enforceRateLimit（route 守門：超限 throw HttpError 429）──

function reqWithIp(ip) {
  return { headers: { get: (h) => (h === "x-forwarded-for" ? ip : null) } };
}

test("enforceRateLimit：未達上限不 throw", () => {
  const store = newStore();
  const clk = fakeClock();
  assert.doesNotThrow(() =>
    enforceRateLimit(reqWithIp("1.1.1.1"), "k", OPTS, clk.now, store),
  );
});

test("enforceRateLimit：達上限 throw HttpError 429", () => {
  const store = newStore();
  const clk = fakeClock();
  const req = reqWithIp("1.1.1.1");
  for (let i = 0; i < OPTS.limit; i++)
    enforceRateLimit(req, "k", OPTS, clk.now, store); // 用滿
  assert.throws(
    () => enforceRateLimit(req, "k", OPTS, clk.now, store),
    (e) => e instanceof HttpError && e.status === 429,
  );
});

test("enforceRateLimit：不同 IP 各自計數（key 含 clientIp）", () => {
  const store = newStore();
  const clk = fakeClock();
  for (let i = 0; i < OPTS.limit; i++)
    enforceRateLimit(reqWithIp("1.1.1.1"), "k", OPTS, clk.now, store);
  // 另一個 IP 仍可通過（不共用同 key）
  assert.doesNotThrow(() =>
    enforceRateLimit(reqWithIp("2.2.2.2"), "k", OPTS, clk.now, store),
  );
});
