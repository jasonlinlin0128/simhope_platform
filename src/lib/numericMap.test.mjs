import { test } from "node:test";
import assert from "node:assert/strict";
import { pickNumericFields } from "./numericMap.mjs";

test("pickNumericFields：只留 number 欄位，濾掉字串/物件/null", () => {
  assert.deepEqual(
    pickNumericFields({ t1: 3, t2: 0, name: "x", ts: { seconds: 1 }, n: null }),
    { t1: 3, t2: 0 },
  );
});

test("pickNumericFields：負數 / 小數也保留（只看型別）", () => {
  assert.deepEqual(pickNumericFields({ a: -2, b: 1.5 }), { a: -2, b: 1.5 });
});

test("pickNumericFields：NaN 是 number 型別 → 保留（呼叫端自理；與原行為一致）", () => {
  const out = pickNumericFields({ a: NaN, b: 2 });
  assert.ok(Number.isNaN(out.a));
  assert.equal(out.b, 2);
});

test("pickNumericFields：非物件 / null / undefined → {}", () => {
  assert.deepEqual(pickNumericFields(null), {});
  assert.deepEqual(pickNumericFields(undefined), {});
  assert.deepEqual(pickNumericFields("x"), {});
  assert.deepEqual(pickNumericFields(5), {});
});

test("pickNumericFields：回新物件、不 mutate 輸入", () => {
  const input = { a: 1 };
  const out = pickNumericFields(input);
  out.b = 2;
  assert.deepEqual(input, { a: 1 });
});
