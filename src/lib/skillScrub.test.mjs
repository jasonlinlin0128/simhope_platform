import { test } from "node:test";
import assert from "node:assert/strict";
import { shouldExcludePath, containsSecret } from "./skillScrub.mjs";

test("路徑排除：.env / .git / node_modules / log / __pycache__", () => {
  assert.equal(shouldExcludePath(".env"), true);
  assert.equal(shouldExcludePath("sub/.env.local"), true);
  assert.equal(shouldExcludePath(".env.example"), false); // 範例保留
  assert.equal(shouldExcludePath(".git/config"), true);
  assert.equal(shouldExcludePath("node_modules/x/index.js"), true);
  assert.equal(shouldExcludePath("scripts/__pycache__/a.pyc"), true);
  assert.equal(shouldExcludePath("debug.log"), true);
  assert.equal(shouldExcludePath("SKILL.md"), false);
  assert.equal(shouldExcludePath("references/design.md"), false);
});

test("secret 樣式偵測", () => {
  assert.equal(containsSecret("api_key = sk-ant-abcdefghij1234567890"), true);
  assert.equal(
    containsSecret("AIzaSyAbc123_def456-ghi789jkl012mno345pqr"),
    true,
  );
  assert.equal(
    containsSecret("token: ghp_0123456789abcdefghijabcdef0123456789"),
    true,
  );
  assert.equal(containsSecret("xoxb-123-456-abcDEF"), true);
  assert.equal(containsSecret("-----BEGIN PRIVATE KEY-----"), true);
  assert.equal(containsSecret('"FIREBASE_SERVICE_ACCOUNT": "{...}"'), true);
  assert.equal(containsSecret("這是一段普通說明，沒有任何密鑰。"), false);
  assert.equal(containsSecret("GEMINI_API_KEY=your-key-here"), false); // 範例佔位不算
});
