import { test } from "node:test";
import assert from "node:assert/strict";
import { sortByCreatedAtDesc } from "./requests.mjs";

// 模擬 Firestore Timestamp（有 toMillis()）。
const ts = (ms) => ({ toMillis: () => ms });

test("依 createdAt 由新到舊排序", () => {
  const rows = [
    { id: "a", createdAt: ts(100) },
    { id: "b", createdAt: ts(300) },
    { id: "c", createdAt: ts(200) },
  ];
  assert.deepEqual(
    sortByCreatedAtDesc(rows).map((r) => r.id),
    ["b", "c", "a"],
  );
});

test("缺 createdAt 視為 0（排最後）、不爆", () => {
  const rows = [
    { id: "a", createdAt: ts(100) },
    { id: "b" }, // 無 createdAt
  ];
  assert.deepEqual(
    sortByCreatedAtDesc(rows).map((r) => r.id),
    ["a", "b"],
  );
});

test("不變動原陣列（回新陣列）", () => {
  const rows = [
    { id: "a", createdAt: ts(1) },
    { id: "b", createdAt: ts(2) },
  ];
  const out = sortByCreatedAtDesc(rows);
  assert.notEqual(out, rows);
  assert.equal(rows[0].id, "a"); // 原陣列順序不變
});
