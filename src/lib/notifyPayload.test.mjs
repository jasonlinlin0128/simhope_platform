import { test } from "node:test";
import assert from "node:assert/strict";
import { buildNotifyPayload } from "./notifyPayload.mjs";

test("buildNotifyPayload：永遠帶 allowed_mentions.parse=[]（防 @everyone 注入）", () => {
  const p = buildNotifyPayload("hello @everyone");
  assert.deepEqual(p.allowed_mentions, { parse: [] });
  // 內文原樣保留（只是不會被當成提及解析）
  assert.equal(p.content, "hello @everyone");
});

test("buildNotifyPayload：含 @here / role mention 仍只回空 parse", () => {
  const p = buildNotifyPayload("ping @here <@&123456789>");
  assert.deepEqual(p.allowed_mentions.parse, []);
});

test("buildNotifyPayload：非字串輸入安全轉字串", () => {
  assert.equal(buildNotifyPayload(123).content, "123");
  assert.equal(buildNotifyPayload(null).content, "");
  assert.equal(buildNotifyPayload(undefined).content, "");
});
