import { test } from "node:test";
import assert from "node:assert/strict";
import { buildVoteDocId } from "./helpfulVote.mjs";

test("buildVoteDocId：正常 → toolId__uid", () => {
  assert.equal(buildVoteDocId("t1", "uidABC"), "t1__uidABC");
});

test("buildVoteDocId：含斜線的 toolId 被中和（doc id 不可含 /）", () => {
  assert.equal(buildVoteDocId("a/b/c", "u1"), "a_b_c__u1");
});

test("buildVoteDocId：缺 toolId 或 uid → null", () => {
  assert.equal(buildVoteDocId("", "u1"), null);
  assert.equal(buildVoteDocId("t1", ""), null);
  assert.equal(buildVoteDocId(null, "u1"), null);
  assert.equal(buildVoteDocId("t1", undefined), null);
});

test("buildVoteDocId：非字串安全 → null（不丟例外）", () => {
  assert.equal(buildVoteDocId(123, "u1"), null);
  assert.equal(buildVoteDocId("t1", {}), null);
});

test("buildVoteDocId：過長輸入被截斷（避免超過 doc id 上限）", () => {
  const longId = "x".repeat(500);
  const out = buildVoteDocId(longId, "u1");
  assert.ok(out.length <= 200 + 2 + 2, "toolId 段截斷在 200 內");
  assert.ok(out.endsWith("__u1"));
});
