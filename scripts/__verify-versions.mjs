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
// 草稿列（version === ""）視為未填 → fall through 到 typeData.version（鎖 || 語意）
assert.equal(
  latestVersionLabel({ versions: [{ version: "" }], typeData: { version: "v3" } }),
  "v3",
);
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

// ── getCTA × versions ──
import { getCTA } from "../src/lib/taxonomy.js";

// download：最新版 fileUrl 優先於舊 url
const dl = getCTA({
  type: "download",
  status: "live",
  id: "x",
  url: "https://old/legacy.exe",
  versions: [
    { version: "v1", fileUrl: "https://old/v1.exe" },
    { version: "v2", fileUrl: "https://new/v2.exe" },
  ],
});
assert.equal(dl.href, "https://new/v2.exe");

// download：versions 為空 → fallback 舊 url（不迴歸）
assert.equal(
  getCTA({ type: "download", status: "live", id: "x", url: "https://old/legacy.exe" }).href,
  "https://old/legacy.exe",
);

// skill：最新版 fileUrl 優先於 typeData.skillZipUrl
const sk = getCTA({
  type: "skill",
  status: "live",
  id: "x",
  typeData: { skillZipUrl: "https://z/old.zip" },
  versions: [{ version: "v1", fileUrl: "https://z/new.zip" }],
});
assert.equal(sk.href, "https://z/new.zip");

// skill：versions 空 → fallback skillZipUrl（不迴歸）
assert.equal(
  getCTA({ type: "skill", status: "live", id: "x", typeData: { skillZipUrl: "https://z/old.zip" } }).href,
  "https://z/old.zip",
);

console.log("✅ versions verify passed");
