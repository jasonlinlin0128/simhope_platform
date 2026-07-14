/**
 * 稽核記錄（audit_logs）：append-only、server-only（rules 全 deny）。
 * 組裝純函式在這裡；寫入 I/O 由呼叫端注入 adminDb。
 * 資料模型：docs/portal/data-model.md §1。
 *
 * 鐵律：actor 一律來自伺服器已驗證的身分（verifyIdToken / 啟用流程已驗的員編），
 * **絕不**取自 request body——否則稽核紀錄可被偽造，等於沒有。
 */

export const AUDIT_ACTIONS = [
  "AUTH_ACTIVATE",
  "AUTH_LOGIN",
  "AUTH_LOGIN_FAIL",
  "APP_OPEN",
  "APP_REGISTER",
  "APP_UPDATE",
  "APP_STATUS_CHANGE",
  "PERMISSION_CHANGE",
  "EMPLOYEE_IMPORT",
  "EMPLOYEE_DEACTIVATE",
];

export const AUDIT_RESULTS = ["ok", "denied", "error"];

/** 保留 400 天（比照 analytics_daily 的 TTL 慣例；欄位 expireAt）。 */
export const RETENTION_DAYS = 400;

const DETAIL_MAX_CHARS = 2000;
/** 絕不寫進稽核 detail 的 key（密碼/秘密/憑證類）。寧可誤殺（token_count）也不要漏。 */
const REDACT_KEYS =
  /pass|token|secret|tax_id|credential|authorization|cookie|session|api[_-]?key|private[_-]?key/i;

const MAX_DEPTH = 3;

/**
 * detail 淨化：遮蔽敏感 key（**遞迴**——權限變更的 before/after diff 本來就是巢狀物件，
 * 只看第一層等於讓 `{diff:{password}}` 直接落地）、截斷字串、限制整體大小。
 */
export function sanitizeDetail(detail, depth = 0) {
  if (detail === null || typeof detail !== "object" || Array.isArray(detail)) return null;
  const out = {};
  for (const [k, v] of Object.entries(detail)) {
    if (REDACT_KEYS.test(k)) {
      out[k] = "[redacted]";
    } else if (v === null || ["string", "number", "boolean"].includes(typeof v)) {
      out[k] = typeof v === "string" ? v.slice(0, 200) : v;
    } else if (Array.isArray(v)) {
      out[k] = JSON.stringify(v.slice(0, 20))?.slice(0, 200) ?? null;
    } else if (typeof v === "object" && depth < MAX_DEPTH) {
      out[k] = sanitizeDetail(v, depth + 1);
    } else {
      out[k] = "[omitted]"; // 過深或不可序列化 → 不猜、不硬塞
    }
  }
  const json = JSON.stringify(out);
  if (json.length > DETAIL_MAX_CHARS) return { _truncated: true, _keys: Object.keys(out).slice(0, 20) };
  return out;
}

/**
 * 組裝一筆稽核記錄。
 * @param {object} p
 * @param {string} p.action        AUDIT_ACTIONS 之一
 * @param {string|null} [p.actorUid]         來自 verifyIdToken（不信 body）
 * @param {string|null} [p.actorEmployeeId]  來自伺服器已驗證的身分
 * @param {string|null} [p.target]           客體（application_id / employee_id / uid）
 * @param {object|null} [p.detail]           精簡 diff（自動淨化）
 * @param {string} [p.result]                ok | denied | error
 * @param {Request} [p.request]              取 ip / ua
 * @param {number} [p.now]                   epoch ms（注入時鐘，測試用）
 * @returns {object} 可直接寫入 audit_logs 的文件
 */
export function buildAuditEntry({
  action,
  actorUid = null,
  actorEmployeeId = null,
  target = null,
  detail = null,
  result = "ok",
  request = null,
  now = Date.now(),
}) {
  if (!AUDIT_ACTIONS.includes(action)) throw new Error(`未知的 audit action: ${action}`);
  if (!AUDIT_RESULTS.includes(result)) throw new Error(`未知的 audit result: ${result}`);

  const h = request?.headers;
  return {
    ts: now,
    action,
    actor_uid: actorUid,
    actor_employee_id: actorEmployeeId,
    target,
    detail: sanitizeDetail(detail),
    result,
    ip: (h?.get("x-forwarded-for") || "").split(",")[0].trim() || null,
    ua: (h?.get("user-agent") || "").slice(0, 300) || null,
    expireAt: new Date(now + RETENTION_DAYS * 24 * 60 * 60 * 1000),
  };
}

/**
 * 組裝並寫入 audit_logs。**fail-soft**：組裝或寫入失敗都不得讓主要操作失敗
 * （組裝也要包在 try 內——buildAuditEntry 對未知 action 會拋，若在外面拋就會
 * 把「登入成功」變成 500）。
 *
 * 例外：權限變更（PERMISSION_CHANGE）不走這裡——見 /api/admin/set-role，
 * 它把稽核與變更放同一個 batch，稽核失敗＝變更失敗（寧可不授權，也不要無紀錄的提權）。
 *
 * @param {object} adminDb  Firestore Admin instance
 * @param {object} params   buildAuditEntry 的參數
 */
export async function writeAudit(adminDb, params, logger = console) {
  try {
    await adminDb.collection("audit_logs").add(buildAuditEntry(params));
  } catch (e) {
    logger.error("[audit] 寫入失敗", params?.action, params?.target, e);
  }
}
