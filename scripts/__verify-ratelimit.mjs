// scripts/__verify-ratelimit.mjs — 純函式 sanity check（無框架）
import assert from "node:assert";
import { rateLimit } from "../src/lib/rateLimit.js";

// 同 key 第 1~3 次允許，第 4 次擋（limit=3, window 大）
const opts = { limit: 3, windowMs: 60000 };
let now = 1000;
const clock = () => now;
assert.equal(rateLimit("ip-a", opts, clock).ok, true);
assert.equal(rateLimit("ip-a", opts, clock).ok, true);
assert.equal(rateLimit("ip-a", opts, clock).ok, true);
assert.equal(rateLimit("ip-a", opts, clock).ok, false, "第4次應被擋");
// 不同 key 互不影響
assert.equal(rateLimit("ip-b", opts, clock).ok, true);
// 視窗滑過後重置
now = 1000 + 60001;
assert.equal(rateLimit("ip-a", opts, clock).ok, true, "視窗過後應放行");

console.log("✅ rateLimit verify passed");
