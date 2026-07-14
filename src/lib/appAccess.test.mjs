import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canSeeApp,
  canOpenApp,
  filterVisibleApps,
  ANONYMOUS,
  LISTABLE_STATUSES,
} from "./appAccess.mjs";

const sub = (over = {}) => ({
  uid: "u1",
  employee_id: "10231",
  status: "active",
  role: "viewer",
  acl_roles: [],
  department_id: "dept-mfg",
  ...over,
});
const app = (over = {}) => ({
  id: "quote",
  status: "live",
  visibility: "PUBLIC_ALL",
  owner_employee_id: "10999",
  allowed_users: [],
  allowed_departments: [],
  allowed_roles: [],
  ...over,
});

test("PUBLIC_ALL + live → 看得到也開得了", () => {
  assert.equal(canSeeApp(sub(), app()), true);
  assert.equal(canOpenApp(sub(), app()), true);
});

test("visibility 缺席（migration 前的舊資料）→ 視為 PUBLIC_ALL，不從清單消失", () => {
  const legacy = { id: "old", status: "live" }; // 沒有任何入口網欄位
  assert.equal(canSeeApp(sub(), legacy), true);
  assert.equal(canSeeApp(ANONYMOUS, legacy), true);
});

test("HIDDEN → 一般人看不到；owner 與 admin 看得到", () => {
  const a = app({ visibility: "HIDDEN" });
  assert.equal(canSeeApp(sub(), a), false);
  assert.equal(canSeeApp(sub({ employee_id: "10999" }), a), true); // owner
  assert.equal(canSeeApp(sub({ role: "admin" }), a), true);
});

test("BY_RULE：員編 / 部門 / 角色 任一命中即可（聯集）", () => {
  const byUser = app({ visibility: "BY_RULE", allowed_users: ["10231"] });
  const byDept = app({ visibility: "BY_RULE", allowed_departments: ["dept-mfg"] });
  const byRole = app({ visibility: "BY_RULE", allowed_roles: ["developer"] });
  const byAcl = app({ visibility: "BY_RULE", allowed_roles: ["finance-lead"] });

  assert.equal(canSeeApp(sub(), byUser), true);
  assert.equal(canSeeApp(sub(), byDept), true);
  assert.equal(canSeeApp(sub({ role: "developer" }), byRole), true);
  assert.equal(canSeeApp(sub({ acl_roles: ["finance-lead"] }), byAcl), true);
});

test("BY_RULE：全部不命中 → 看不到", () => {
  const a = app({
    visibility: "BY_RULE",
    allowed_users: ["99999"],
    allowed_departments: ["dept-qa"],
    allowed_roles: ["admin"],
  });
  assert.equal(canSeeApp(sub(), a), false);
});

test("停用員工：什麼都看不到（母檔 inactive）", () => {
  assert.equal(canSeeApp(sub({ status: "inactive" }), app()), false);
  assert.equal(canSeeApp(sub({ status: "inactive", role: "admin" }), app()), false);
});

test("pending 不進任何人的清單（含 admin；後台走別的路徑）", () => {
  const a = app({ status: "pending" });
  assert.equal(canSeeApp(sub({ role: "admin" }), a), false);
  assert.equal(canSeeApp(sub({ employee_id: "10999" }), a), false); // owner 也不行
});

test("dev / terminated：看得到（現況刻意顯示）但開不了", () => {
  for (const status of ["dev", "terminated"]) {
    const a = app({ status });
    assert.equal(canSeeApp(sub(), a), true, `see ${status}`);
    assert.equal(canOpenApp(sub(), a), false, `open ${status}`);
  }
});

test("未知 visibility → fail-closed", () => {
  assert.equal(canSeeApp(sub(), app({ visibility: "WEIRD" })), false);
});

test("匿名訪客：PUBLIC_ALL 可見；BY_RULE / HIDDEN 不可見", () => {
  assert.equal(canSeeApp(ANONYMOUS, app()), true);
  assert.equal(canSeeApp(ANONYMOUS, app({ visibility: "BY_RULE", allowed_users: ["10231"] })), false);
  assert.equal(canSeeApp(ANONYMOUS, app({ visibility: "HIDDEN" })), false);
});

test("filterVisibleApps：受限 app 不落入回傳（不得進 client payload）", () => {
  const apps = [
    app({ id: "a", visibility: "PUBLIC_ALL" }),
    app({ id: "b", visibility: "HIDDEN" }),
    app({ id: "c", visibility: "BY_RULE", allowed_departments: ["dept-mfg"] }),
    app({ id: "d", status: "pending" }),
  ];
  const ids = filterVisibleApps(sub(), apps).map((a) => a.id);
  assert.deepEqual(ids, ["a", "c"]);
});

test("防禦性：null subject / app → false，不炸", () => {
  assert.equal(canSeeApp(null, app()), false);
  assert.equal(canSeeApp(sub(), null), false);
  assert.deepEqual(filterVisibleApps(sub(), null), []);
});

test("LISTABLE_STATUSES 涵蓋本站現況（回歸鎖：少一個就是工具從首頁消失）", () => {
  assert.deepEqual(LISTABLE_STATUSES, ["live", "beta", "new", "dev", "terminated"]);
});
