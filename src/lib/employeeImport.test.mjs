import { test } from "node:test";
import assert from "node:assert/strict";
import { parseEmployeeCsv, planImport, CREATE_DEFAULTS } from "./employeeImport.mjs";

const CSV = `employee_id,name,department_id,status
10231,王小明,dept-mfg,active
10232,李小華,dept-qa,inactive
10233,陳大文,dept-admin,
`;

test("合法 CSV 解析：status 空值預設 active", () => {
  const r = parseEmployeeCsv(CSV);
  assert.equal(r.ok, true);
  assert.equal(r.rows.length, 3);
  assert.deepEqual(r.rows[0], {
    employee_id: "10231", name: "王小明", department_id: "dept-mfg", status: "active",
  });
  assert.equal(r.rows[2].status, "active");
});

test("status 欄位可整欄省略", () => {
  const r = parseEmployeeCsv("employee_id,name,department_id\n10231,王小明,dept-mfg");
  assert.equal(r.ok, true);
  assert.equal(r.rows[0].status, "active");
});

test("BOM 與 CRLF 正常處理", () => {
  const r = parseEmployeeCsv("﻿employee_id,name,department_id\r\n10231,王小明,dept-mfg\r\n");
  assert.equal(r.ok, true);
  assert.equal(r.rows.length, 1);
});

test("header 缺欄位報錯", () => {
  const r = parseEmployeeCsv("employee_id,name\n10231,王小明");
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes("department_id")));
});

test("空檔案/非法 employee_id/重複/缺 name/壞 status 逐行報錯", () => {
  assert.equal(parseEmployeeCsv("").ok, false);
  const bad = parseEmployeeCsv(
    "employee_id,name,department_id,status\n" +
      "emp 1,王,dept-a,active\n" + // 含空白
      "10231,王,dept-a,active\n" +
      "10231,王,dept-a,active\n" + // 重複
      "10232,,dept-a,active\n" + // 缺 name
      "10233,李,dept-a,fired\n", // 壞 status
  );
  assert.equal(bad.ok, false);
  assert.equal(bad.errors.length, 4);
  assert.ok(bad.errors.some((e) => e.includes("重複")));
});

test("planImport：create/update/unchanged/missing 分類", () => {
  const rows = [
    { employee_id: "10231", name: "王小明", department_id: "dept-mfg", status: "active" },
    { employee_id: "10232", name: "李小華", department_id: "dept-qa", status: "active" },
  ];
  const existing = new Map([
    ["10232", { name: "李小華", department_id: "dept-mfg", status: "active", activated: true }],
    ["10233", { name: "已離職", department_id: "dept-qa", status: "active" }],
    ["10234", { name: "早已停用", department_id: "dept-qa", status: "inactive" }],
  ]);
  const plan = planImport(rows, existing);
  assert.deepEqual(plan.create.map((r) => r.employee_id), ["10231"]);
  assert.deepEqual(plan.update.map((r) => r.employee_id), ["10232"]); // dept 變了
  assert.deepEqual(plan.missing, ["10233"]); // 名冊外且 active；已 inactive 者不重複列
});

test("planImport：完全一致 → unchanged，不產生寫入", () => {
  const rows = [{ employee_id: "10231", name: "王", department_id: "d", status: "active" }];
  const existing = new Map([["10231", { name: "王", department_id: "d", status: "active" }]]);
  const plan = planImport(rows, existing);
  assert.equal(plan.create.length + plan.update.length + plan.missing.length, 0);
  assert.equal(plan.unchanged.length, 1);
});

test("CREATE_DEFAULTS 含啟用狀態初值（重匯不得覆蓋的欄位）", () => {
  assert.deepEqual(CREATE_DEFAULTS, {
    activated: false, uid: null, activation_attempts: 0, locked_until: null,
  });
});
