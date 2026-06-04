// scripts/__verify-versions.mjs — 純函式 sanity check（無框架，直接 node 跑）
import assert from "node:assert";
import {
  latestVersion,
  latestVersionLabel,
  lastUpdatedDate,
  blankVersionRow,
} from "../src/lib/versions.js";

// ── versions.js ──
assert.equal(latestVersion({}), null);
assert.equal(latestVersion({ versions: [] }), null);
assert.deepEqual(
  latestVersion({ versions: [{ version: "v1" }, { version: "v2" }] }),
  { version: "v2" },
);
assert.equal(
  latestVersionLabel({ versions: [{ version: "v1" }, { version: "v2" }] }),
  "v2",
);
// 空 versions → fallback typeData.version
assert.equal(latestVersionLabel({ typeData: { version: "v9" } }), "v9");
assert.equal(latestVersionLabel({}), "");
assert.equal(
  lastUpdatedDate({ versions: [{ date: "2026-01-01" }, { date: "2026-06-05" }] }),
  "2026-06-05",
);
assert.equal(lastUpdatedDate({}), null);
assert.deepEqual(blankVersionRow("2026-06-05"), {
  version: "",
  date: "2026-06-05",
  notes: "",
  fileUrl: "",
});

console.log("✅ versions verify passed");
