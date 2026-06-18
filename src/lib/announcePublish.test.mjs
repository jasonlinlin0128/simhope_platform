import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ANNOUNCE_STATUSES,
  shouldAnnounce,
  buildAnnounceMessage,
} from "./announcePublish.mjs";

test("ANNOUNCE_STATUSES = live/beta/new", () => {
  assert.deepEqual(ANNOUNCE_STATUSES, ["live", "beta", "new"]);
});

test("shouldAnnounce：非公開 → 公開（未公告）→ true", () => {
  assert.equal(shouldAnnounce("pending", "live", undefined), true);
  assert.equal(shouldAnnounce("dev", "live", undefined), true);
  assert.equal(shouldAnnounce("pending", "beta", undefined), true);
  assert.equal(shouldAnnounce("pending", "new", undefined), true);
  assert.equal(shouldAnnounce("terminated", "live", undefined), true);
});

test("shouldAnnounce：新狀態非公開 → false", () => {
  assert.equal(shouldAnnounce("pending", "dev", undefined), false);
  assert.equal(shouldAnnounce("pending", "terminated", undefined), false);
  assert.equal(shouldAnnounce("pending", "pending", undefined), false);
});

test("shouldAnnounce：舊狀態已公開 → false（不重發）", () => {
  assert.equal(shouldAnnounce("live", "beta", undefined), false);
  assert.equal(shouldAnnounce("new", "live", undefined), false);
  assert.equal(shouldAnnounce("beta", "new", undefined), false);
});

test("shouldAnnounce：已有 announcedAt → false", () => {
  assert.equal(shouldAnnounce("pending", "live", "2026-06-18T00:00:00Z"), false);
  assert.equal(shouldAnnounce("pending", "live", 123), false);
  assert.equal(shouldAnnounce("dev", "live", { seconds: 1 }), false);
});

test("buildAnnounceMessage：含 title/tagline/連結", () => {
  const msg = buildAnnounceMessage({
    id: "t1",
    title: "翻譯工具",
    tagline: "即時翻譯",
  });
  assert.match(msg, /🎉 新工具上線：翻譯工具 — 即時翻譯/);
  assert.match(msg, /https:\/\/simhope-platform\.vercel\.app\/tool\/t1/);
});

test("buildAnnounceMessage：缺 tagline → 無 dash", () => {
  const msg = buildAnnounceMessage({ id: "t2", title: "工具A" });
  assert.match(msg, /🎉 新工具上線：工具A\n/);
  assert.ok(!msg.includes(" — "));
});

test("buildAnnounceMessage：缺 title → 後備名稱", () => {
  const msg = buildAnnounceMessage({ id: "t3" });
  assert.match(msg, /🎉 新工具上線：\(未命名工具\)/);
  assert.match(msg, /\/tool\/t3/);
});
