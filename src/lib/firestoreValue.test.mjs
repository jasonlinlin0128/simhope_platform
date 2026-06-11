import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fromFirestoreValue,
  fromFirestoreFields,
  docToObject,
} from "./firestoreValue.mjs";

test("純量型別轉換", () => {
  assert.equal(fromFirestoreValue({ stringValue: "hi" }), "hi");
  assert.equal(fromFirestoreValue({ integerValue: "42" }), 42); // REST 給字串 → Number
  assert.equal(fromFirestoreValue({ doubleValue: 1.5 }), 1.5);
  assert.equal(fromFirestoreValue({ booleanValue: true }), true);
  assert.equal(fromFirestoreValue({ nullValue: null }), null);
  assert.equal(
    fromFirestoreValue({ timestampValue: "2026-06-11T00:00:00Z" }),
    "2026-06-11T00:00:00Z",
  );
});

test("array 遞迴轉換（含空）", () => {
  assert.deepEqual(
    fromFirestoreValue({
      arrayValue: { values: [{ stringValue: "a" }, { stringValue: "b" }] },
    }),
    ["a", "b"],
  );
  assert.deepEqual(fromFirestoreValue({ arrayValue: {} }), []);
});

test("map 遞迴轉換", () => {
  assert.deepEqual(
    fromFirestoreValue({
      mapValue: { fields: { x: { integerValue: "1" }, y: { stringValue: "z" } } },
    }),
    { x: 1, y: "z" },
  );
});

test("docToObject：id 取 name 末段 + fields 展開", () => {
  const doc = {
    name: "projects/p/databases/(default)/documents/tools/abc123",
    fields: {
      title: { stringValue: "翻譯" },
      status: { stringValue: "live" },
      tags: { arrayValue: { values: [{ stringValue: "t1" }] } },
    },
  };
  assert.deepEqual(docToObject(doc), {
    id: "abc123",
    title: "翻譯",
    status: "live",
    tags: ["t1"],
  });
});

test("缺欄位安全", () => {
  assert.deepEqual(docToObject({ name: "x/y/tools/i" }), { id: "i" });
  assert.deepEqual(fromFirestoreFields(), {});
});
