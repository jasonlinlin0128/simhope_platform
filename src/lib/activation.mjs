/**
 * 首次啟用（員編＋統編 → 設個人密碼）的純決策邏輯。
 * I/O（Firestore transaction / Admin SDK）在 app/api/auth/activate/route.js。
 * 流程規格：docs/portal/authentication-flow.md §2。
 */

import { EMPLOYEE_ID_RE } from "./employeeImport.mjs";

export const ALIAS_EMAIL_DOMAIN = "portal.simhope.internal";
export const MAX_ATTEMPTS = 5;
export const LOCK_MS = 15 * 60 * 1000;
/** activating 標記超過此時限視為前次啟用中斷，允許重試續跑。 */
export const ACTIVATING_STALE_MS = 10 * 60 * 1000;

/** 員編 → Firebase Auth alias email（確定性規則，client 登入時同樣可推導）。 */
export function aliasEmail(employeeId) {
  return `emp${String(employeeId).toLowerCase()}@${ALIAS_EMAIL_DOMAIN}`;
}

/**
 * 密碼政策：長度 ≥10、不得含員編/統編、不得為純數字（生日類格式）。
 * @returns {{ok:true} | {ok:false, error:string}}
 */
export function checkPasswordPolicy(password, { employeeId, taxId } = {}) {
  const p = String(password ?? "");
  if (p.length < 10) return { ok: false, error: "密碼至少 10 個字元" };
  if (/^\d+$/.test(p)) return { ok: false, error: "密碼不得為純數字（生日/證號類格式）" };
  const lower = p.toLowerCase();
  if (employeeId && lower.includes(String(employeeId).toLowerCase())) {
    return { ok: false, error: "密碼不得包含員工編號" };
  }
  if (taxId && lower.includes(String(taxId).toLowerCase())) {
    return { ok: false, error: "密碼不得包含公司統編" };
  }
  return { ok: true };
}

/** 啟用請求的欄位驗證（進 transaction 前擋掉格式錯誤）。 */
export function validateActivateInput({ employee_id, tax_id, new_password } = {}) {
  if (typeof employee_id !== "string" || !EMPLOYEE_ID_RE.test(employee_id)) {
    return { ok: false, error: "啟用資訊不正確" }; // 統一訊息，不洩漏哪個欄位
  }
  if (typeof tax_id !== "string" || tax_id === "") {
    return { ok: false, error: "啟用資訊不正確" };
  }
  if (typeof new_password !== "string") {
    return { ok: false, error: "啟用資訊不正確" };
  }
  return { ok: true };
}

/**
 * 統編正確後、transaction 內的啟用閘門判斷。
 * @param {object|null} emp employees 文件 data（不存在傳 null）
 * @param {number} now epoch ms
 * @returns {{ok:true, resume:boolean} | {code:number, error:string}}
 *   resume=true：前次啟用中斷（activating 標記存在但已 stale 或帳號未完成）→ 續跑。
 */
export function activationGate(emp, now) {
  if (!emp || emp.status !== "active") {
    return { code: 401, error: "啟用資訊不正確" };
  }
  if (emp.locked_until && now < emp.locked_until) {
    return { code: 429, error: "嘗試次數過多，請 15 分鐘後再試" };
  }
  if (emp.activated) {
    return { code: 409, error: "此員工編號已啟用，請直接登入" };
  }
  if (emp.activating_at && now - emp.activating_at < ACTIVATING_STALE_MS) {
    return { code: 409, error: "啟用處理中，請稍後再試" };
  }
  return { ok: true, resume: Boolean(emp.activating_at) };
}

/**
 * 統編錯誤時對該員編文件的懲罰更新（attempts++，達上限鎖 15 分）。
 * 只回傳要 merge 的欄位；文件不存在時呼叫端不寫（不能為不存在的員編建檔）。
 */
export function applyFailedAttempt(emp, now) {
  const attempts = (emp.activation_attempts ?? 0) + 1;
  return {
    activation_attempts: attempts,
    locked_until: attempts >= MAX_ATTEMPTS ? now + LOCK_MS : (emp.locked_until ?? null),
  };
}
