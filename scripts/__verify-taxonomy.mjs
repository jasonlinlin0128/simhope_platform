// scripts/__verify-taxonomy.mjs — 純函式 sanity check（無框架，直接 node 跑）
import assert from "node:assert";
import {
  getCTA,
  getTabsForType,
  categoryCounts,
  CATEGORY_ORDER,
} from "../src/lib/taxonomy.js";

// terminated → disabled
assert.equal(
  getCTA({ type: "webapp", status: "terminated", id: "x" }).disabled,
  true,
);
// dev → 引導詳情頁
assert.equal(
  getCTA({ type: "webapp", status: "dev", id: "x" }).href,
  "/tool/x",
);
// skill 有 zip → 下載外連
const s = getCTA({
  type: "skill",
  status: "live",
  id: "x",
  typeData: { skillZipUrl: "https://z/a.zip" },
});
assert.equal(s.href, "https://z/a.zip");
assert.equal(s.external, true);
// skill 無 zip → 退回看詳情
assert.equal(
  getCTA({ type: "skill", status: "live", id: "x", typeData: {} }).href,
  "/tool/x",
);
// webapp 有 url → 外連
assert.equal(
  getCTA({ type: "webapp", status: "live", id: "x", url: "https://a" })
    .external,
  true,
);
// skill tabs = quick + detail
assert.deepEqual(
  getTabsForType("skill").map((t) => t.key),
  ["quick", "detail"],
);
// mcp tabs = quick + advanced + detail
assert.deepEqual(
  getTabsForType("mcp").map((t) => t.key),
  ["quick", "advanced", "detail"],
);
// 計數：terminated 不算；未知 category 歸 tool
const counts = categoryCounts([
  { category: "skill", status: "live" },
  { category: "mcp", status: "live" },
  { category: "tool", status: "terminated" },
  { status: "live" }, // 無 category → tool
]);
assert.equal(counts.all, 3);
assert.equal(counts.skill, 1);
assert.equal(counts.tool, 1);
assert.deepEqual(CATEGORY_ORDER, [
  "platform",
  "tool",
  "project",
  "mcp",
  "skill",
]);

console.log("✅ taxonomy verify passed");
