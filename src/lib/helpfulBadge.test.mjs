import { test } from "node:test";
import assert from "node:assert/strict";
import {
  HELPFUL_BADGE_MIN,
  shouldShowHelpfulBadge,
  attachHelpfulCounts,
} from "./helpfulBadge.mjs";

test("HELPFUL_BADGE_MIN 為 3", () => {
  assert.equal(HELPFUL_BADGE_MIN, 3);
});

test("shouldShowHelpfulBadge：>=3 才 true", () => {
  assert.equal(shouldShowHelpfulBadge(2), false);
  assert.equal(shouldShowHelpfulBadge(3), true);
  assert.equal(shouldShowHelpfulBadge(7), true);
  assert.equal(shouldShowHelpfulBadge(0), false);
  assert.equal(shouldShowHelpfulBadge(-1), false);
  assert.equal(shouldShowHelpfulBadge(undefined), false);
  assert.equal(shouldShowHelpfulBadge(NaN), false);
  assert.equal(shouldShowHelpfulBadge("5"), true); // 數值字串可轉
});

test("attachHelpfulCounts：正常 map 附 count、保留其餘欄位", () => {
  const tools = [
    { id: "a", title: "A", status: "live" },
    { id: "b", title: "B", status: "live" },
  ];
  const out = attachHelpfulCounts(tools, { a: 7, b: 2 });
  assert.deepEqual(out, [
    { id: "a", title: "A", status: "live", helpfulCount: 7 },
    { id: "b", title: "B", status: "live", helpfulCount: 2 },
  ]);
});

test("attachHelpfulCounts：缺 key / 空 map / undefined map → 0", () => {
  const tools = [{ id: "a" }];
  assert.equal(attachHelpfulCounts(tools, { x: 5 })[0].helpfulCount, 0);
  assert.equal(attachHelpfulCounts(tools, {})[0].helpfulCount, 0);
  assert.equal(attachHelpfulCounts(tools)[0].helpfulCount, 0);
});

test("attachHelpfulCounts：map 值非數值 → 0", () => {
  const out = attachHelpfulCounts([{ id: "a" }, { id: "b" }], {
    a: "abc",
    b: null,
  });
  assert.equal(out[0].helpfulCount, 0);
  assert.equal(out[1].helpfulCount, 0);
});

test("attachHelpfulCounts：tools 非陣列 / undefined → []", () => {
  assert.deepEqual(attachHelpfulCounts(undefined, {}), []);
  assert.deepEqual(attachHelpfulCounts(null, {}), []);
  assert.deepEqual(attachHelpfulCounts("nope", {}), []);
});

test("attachHelpfulCounts：不 mutate 原 tools", () => {
  const tools = [{ id: "a", title: "A" }];
  const out = attachHelpfulCounts(tools, { a: 5 });
  assert.equal(tools[0].helpfulCount, undefined); // 原物件不變
  assert.notEqual(out[0], tools[0]); // 回傳新物件
});
