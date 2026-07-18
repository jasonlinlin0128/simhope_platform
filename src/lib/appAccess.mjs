/**
 * 入口網授權判斷（純函式；規格 docs/portal/authorization-model.md）。
 *
 * 刻意拆成兩個問題，而不是規格原本的單一 canAccessApp：
 *   canSeeApp(subject, app)   — 這個 app 能不能出現在他的清單裡？
 *   canOpenApp(subject, app)  — 他能不能真的開啟/跳轉過去？
 *
 * 理由：本站現況「規劃中(dev)」與「已下架(terminated)」的卡片是**刻意顯示**的
 * （前者收集需求、後者留存續轉移說明），規格的「停用系統不顯示」若直譯成
 * status ∈ {live,beta,new} 才可見，會讓既有工具從清單消失（＝重演 2026-05-29
 * 那次 13→8 事故）。所以：可見沿用現況集合；「不可開啟」才是停用的真正語意。
 *
 * ABAC 預留：兩個函式都收第三個 context 參數（時間/地點/裝置…），目前未使用。
 */

/** 清單可見的狀態（沿用本站現況；pending 只有作者/admin 在後台看得到，不走這裡）。 */
export const LISTABLE_STATUSES = ["live", "beta", "new", "dev", "terminated"];
/** 可實際開啟的狀態（dev＝還沒東西可開；terminated＝已停用，規格要求擋下）。 */
export const OPENABLE_STATUSES = ["live", "beta", "new"];

export const VISIBILITIES = ["PUBLIC_ALL", "BY_RULE", "HIDDEN"];

/**
 * 新建工具時**必須**寫入的入口網欄位。
 * 少了 visibility，收斂後的 rules 讀不到、等值查詢也命中不了 → 工具過審後不會出現在
 * 首頁（而且是靜默的）。firestore.rules 的 allow create 會強制 visibility=PUBLIC_ALL；
 * 要設成受限（BY_RULE/HIDDEN）由 admin 事後在後台改。
 */
export const PORTAL_DEFAULTS = Object.freeze({
  visibility: "PUBLIC_ALL",
  supports_sso: false,
  data_classification: "internal",
  allowed_users: [],
  allowed_departments: [],
  allowed_roles: [],
});

/**
 * @typedef {object} Subject   伺服器端組出來的身分（絕不取自 client）
 * @property {string|null} uid
 * @property {string|null} employee_id
 * @property {string} status              員工母檔狀態：active | inactive（無員編者視為 active）
 * @property {string} role                viewer | developer | admin
 * @property {string[]} acl_roles         自訂 ACL 角色 slug
 * @property {string|null} department_id
 */

/** 匿名訪客（未登入）：只看得到 PUBLIC_ALL。 */
export const ANONYMOUS = {
  uid: null,
  employee_id: null,
  status: "active",
  role: "viewer",
  acl_roles: [],
  department_id: null,
};

function matchesRule(subject, app) {
  // BY_RULE 一律要求登入身分。否則 allowed_roles:["viewer"]（admin 表達「全體員工」
  // 最自然的寫法）會連**登出的訪客**都放行——ANONYMOUS.role 就是 "viewer"。
  if (!subject.uid) return false;

  const users = app.allowed_users ?? [];
  const depts = app.allowed_departments ?? [];
  const roles = app.allowed_roles ?? [];
  if (subject.employee_id && users.includes(subject.employee_id)) return true;
  if (subject.department_id && depts.includes(subject.department_id)) return true;
  const mine = [subject.role, ...(subject.acl_roles ?? [])].filter(Boolean);
  return mine.some((r) => roles.includes(r));
}

/** ACL 判斷（不含 status）：visibility × allowed_* × owner/admin。 */
function passesAcl(subject, app) {
  if (subject.role === "admin") return true;
  if (
    subject.employee_id &&
    app.owner_employee_id &&
    app.owner_employee_id === subject.employee_id
  ) {
    return true;
  }
  // visibility 缺席＝舊資料（migration 前）→ 視為 PUBLIC_ALL，維持現狀不消失。
  const visibility = app.visibility ?? "PUBLIC_ALL";
  if (visibility === "PUBLIC_ALL") return true;
  if (visibility === "HIDDEN") return false;
  if (visibility === "BY_RULE") return matchesRule(subject, app);
  return false; // 未知 visibility → fail-closed
}

/** 這個 app 能不能出現在 subject 的清單／詳情頁？ */
export function canSeeApp(subject, app, _context = {}) {
  if (!subject || !app) return false;
  if (subject.status !== "active") return false; // 停用員工：什麼都看不到
  if (!LISTABLE_STATUSES.includes(app.status)) return false; // pending 等不進清單
  return passesAcl(subject, app);
}

/** subject 能不能實際開啟這個 app（跳轉／取得連結）？ */
export function canOpenApp(subject, app, _context = {}) {
  if (!canSeeApp(subject, app, _context)) return false;
  return OPENABLE_STATUSES.includes(app.status); // dev/terminated 看得到但開不了
}

/** 把 app 清單過濾成 subject 看得到的（server 專用；BY_RULE/HIDDEN 不得落入 client payload）。 */
export function filterVisibleApps(subject, apps, context = {}) {
  return (apps ?? []).filter((a) => canSeeApp(subject, a, context));
}
