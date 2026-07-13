/**
 * HR 名冊 CSV → employees 母檔文件（純函式；I/O 在 scripts/import-employees.mjs）。
 *
 * CSV 格式（UTF-8，首列 header）：employee_id,name,department_id[,status]
 * - status 省略時預設 active；只接受 active|inactive。
 * - ponytail: 極簡 CSV 解析（無引號跳脫）——HR 名冊欄位不含逗號；欄位值含逗號時匯入前先清洗。
 *
 * 冪等匯入契約：
 * - UPDATE_FIELDS 每次匯入都覆蓋（名冊為權威）。
 * - CREATE_DEFAULTS 只在新建時寫入——重匯**不得**重置啟用狀態（activated/uid/attempts）。
 */

export const EMPLOYEE_ID_RE = /^[A-Za-z0-9-]{1,32}$/;
export const STATUSES = ["active", "inactive"];

/** 新建 employees 文件時的啟用狀態預設（重匯不覆蓋）。 */
export const CREATE_DEFAULTS = {
  activated: false,
  uid: null,
  activation_attempts: 0,
  locked_until: null,
};

const HEADER = ["employee_id", "name", "department_id"];

export function parseEmployeeCsv(text) {
  const errors = [];
  const lines = String(text ?? "")
    .replace(/^﻿/, "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== "");

  if (lines.length === 0) return { ok: false, errors: ["CSV 為空"] };

  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  for (const col of HEADER) {
    if (!header.includes(col)) errors.push(`header 缺少欄位 ${col}`);
  }
  if (errors.length) return { ok: false, errors };

  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  const rows = [];
  const seen = new Set();

  for (let n = 1; n < lines.length; n++) {
    const cells = lines[n].split(",").map((c) => c.trim());
    const line = n + 1;
    const employee_id = cells[idx.employee_id] ?? "";
    const name = cells[idx.name] ?? "";
    const department_id = cells[idx.department_id] ?? "";
    const status = idx.status !== undefined && cells[idx.status] ? cells[idx.status] : "active";

    if (!EMPLOYEE_ID_RE.test(employee_id)) {
      errors.push(`第 ${line} 行：employee_id「${employee_id}」不合法（英數與連字號，1–32 字）`);
      continue;
    }
    if (seen.has(employee_id)) {
      errors.push(`第 ${line} 行：employee_id「${employee_id}」重複`);
      continue;
    }
    if (!name) {
      errors.push(`第 ${line} 行：name 必填`);
      continue;
    }
    if (!department_id) {
      errors.push(`第 ${line} 行：department_id 必填`);
      continue;
    }
    if (!STATUSES.includes(status)) {
      errors.push(`第 ${line} 行：status「${status}」必須是 ${STATUSES.join("/")}`);
      continue;
    }
    seen.add(employee_id);
    rows.push({ employee_id, name, department_id, status });
  }

  if (errors.length) return { ok: false, errors };
  return { ok: true, rows };
}

/**
 * 比對名冊與現有文件 → 匯入計畫（create / update / unchanged / missing）。
 * @param {Array<{employee_id,name,department_id,status}>} rows 名冊（已驗證）
 * @param {Map<string, object>} existing employee_id → 現有文件 data
 */
export function planImport(rows, existing) {
  const plan = { create: [], update: [], unchanged: [], missing: [] };
  const inRoster = new Set(rows.map((r) => r.employee_id));

  for (const row of rows) {
    const cur = existing.get(row.employee_id);
    if (!cur) {
      plan.create.push(row);
    } else if (
      cur.name !== row.name ||
      cur.department_id !== row.department_id ||
      cur.status !== row.status
    ) {
      plan.update.push(row);
    } else {
      plan.unchanged.push(row);
    }
  }
  for (const [id, cur] of existing) {
    if (!inRoster.has(id) && cur.status === "active") plan.missing.push(id);
  }
  return plan;
}
