import { test } from "node:test";
import assert from "node:assert/strict";
import { psQuote } from "./psEscape.mjs";

test("一般字串 → 包單引號", () => {
  assert.equal(psQuote("abc"), "'abc'");
});

test("路徑含反斜線 → 原樣（單引號內反斜線是字面）", () => {
  assert.equal(psQuote("C:\\tmp\\skill-x"), "'C:\\tmp\\skill-x'");
});

test("內含單引號 → 加倍（PowerShell 單引號跳脫）", () => {
  assert.equal(psQuote("a'b"), "'a''b'");
});

test("注入字串被中和：每個單引號都加倍 → 無法提前關閉字串", () => {
  // 惡意資料夾名想跳出單引號字串後接指令
  const evil = "x'); Remove-Item C:\\ -Recurse; ('";
  const out = psQuote(evil);
  assert.equal(out, "'x''); Remove-Item C:\\ -Recurse; ('''");
});

test("數字/其它型別 → 轉字串再包", () => {
  assert.equal(psQuote(123), "'123'");
});
