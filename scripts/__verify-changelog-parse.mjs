// scripts/__verify-changelog-parse.mjs — 純函式 sanity check（無框架，直接 node 跑）
import assert from "node:assert";
import { parseChangelog } from "../src/lib/changelog.js";

const SAMPLE = `# Changelog

## [0.7] — 2026-05-29

登入認證系統大改版。

### 新增

- Google 登入
- passkey

### 安全

- 修提權漏洞

## [0.6] — 2026-05-20

第二版摘要。

### 變動

- 改了 X
`;

const v = parseChangelog(SAMPLE);
assert.equal(v.length, 2, "應解析出 2 個版本");
assert.equal(v[0].version, "0.7");
assert.equal(v[0].date, "2026-05-29");
assert.ok(v[0].summary.includes("登入認證"), "summary 應含摘要");
// 使用者段 = 新增；技術段 = 安全
assert.deepEqual(
  v[0].userSections.map((s) => s.heading),
  ["新增"],
);
assert.deepEqual(
  v[0].techSections.map((s) => s.heading),
  ["安全"],
);
assert.equal(v[0].userSections[0].items.length, 2);
assert.equal(v[1].version, "0.6");
assert.deepEqual(
  v[1].userSections.map((s) => s.heading),
  ["變動"],
);
assert.equal(v[1].techSections.length, 0);

console.log("✅ changelog parse verify passed");
