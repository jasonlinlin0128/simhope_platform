import { test } from "node:test";
import assert from "node:assert/strict";
import { isStaleBackupCollection } from "./backupCollections.mjs";

// 必須命中的 7 個正式 prod 舊備份 collection（2026-06-11 實測）
const SHOULD_MATCH = [
  "tools-backup-2026-05-27",
  "tools-backup-2026-05-28",
  "tools-backup-2026-05-29-approval",
  "tools-backup-2026-05-29-embedded",
  "tools-backup-2026-06-01",
  "painCards-backup-2026-05-28",
  "painCards-backup-2026-05-29",
  "requests-backup-2026-06-08",
];

// 絕對不可命中的真 collection（誤刪 = 災難）
const MUST_NOT_MATCH = [
  "tools",
  "requests",
  "painCards",
  "users",
  "faqs",
  "passkeys",
  "webauthnChallenges",
  "analytics",
  "analytics_daily",
  "site",
  "chatHistory",
  // 邊緣：像備份但沒日期 / 怪命名 → 一律不刪（fail-safe）
  "backup",
  "tools-backup",
  "tools-backupX",
  "my-backup-notes",
  "backup-tools",
];

test("命中全部 7 個正式舊備份 collection", () => {
  for (const n of SHOULD_MATCH)
    assert.equal(isStaleBackupCollection(n), true, `應命中: ${n}`);
});

test("絕不命中任何真 collection / 怪命名", () => {
  for (const n of MUST_NOT_MATCH)
    assert.equal(isStaleBackupCollection(n), false, `不該命中: ${n}`);
});
