/**
 * app-manifest 驗證（權威實作；schema 文件見 docs/portal/app-manifest.schema.json）。
 * 純函式、零依賴 → node --test 可測。註冊 API（/api/registry/apps）收 JSON 等價物後先過這裡。
 * fail-closed：未知欄位、型別不符、危險 URL 一律拒絕。
 */

export const AUTHENTICATION_MODES = [
  "LOCAL_ACCOUNT",
  "EXTERNAL_AUTH",
  "PUBLIC_LINK",
  "SSO_OIDC",
  "SSO_SAML",
];
export const VISIBILITIES = ["PUBLIC_ALL", "BY_RULE", "HIDDEN"];
export const DATA_CLASSIFICATIONS = ["public", "internal", "confidential", "restricted"];

const REQUIRED = [
  "application_id",
  "name",
  "description",
  "production_url",
  "owner_department",
  "owner_employee_id",
  "authentication_mode",
];

const STRING_MAX = {
  name: 80,
  description: 2000,
  icon: 16,
  owner_department: 64,
  owner_employee_id: 32,
};

const URL_FIELDS = ["production_url", "staging_url", "health_check_url", "repository_url"];

const ARRAY_FIELDS = {
  allowed_users: { maxItems: 500, itemMax: 32 },
  allowed_departments: { maxItems: 100, itemMax: 64 },
  allowed_roles: { maxItems: 100, itemMax: 64 },
};

const KNOWN_FIELDS = new Set([
  ...REQUIRED,
  ...Object.keys(STRING_MAX),
  ...URL_FIELDS,
  ...Object.keys(ARRAY_FIELDS),
  "supports_sso",
  "visibility",
  "data_classification",
]);

const APPLICATION_ID_RE = /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/;

/** server 會去 fetch health_check_url → 擋 SSRF 目標（localhost / RFC1918 / link-local）。 */
export function isForbiddenHost(hostname) {
  const h = String(hostname || "").toLowerCase();
  if (!h || h === "localhost" || h === "0.0.0.0" || h === "::1" || h === "[::1]") return true;
  if (h.endsWith(".local") || h.endsWith(".internal")) return true;
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  if (a === 127 || a === 10 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

function checkUrl(field, value, errors) {
  let url;
  try {
    url = new URL(value);
  } catch {
    errors.push(`${field}: 不是合法 URL`);
    return;
  }
  if (url.protocol !== "https:") errors.push(`${field}: 僅接受 https`);
  if (field === "health_check_url" && isForbiddenHost(url.hostname)) {
    errors.push(`${field}: 不接受內網/本機位址`);
  }
}

/**
 * @param {unknown} input  已解析為物件的 manifest（YAML/JSON 由呼叫端解析）
 * @returns {{ok:true, value:object} | {ok:false, errors:string[]}}
 *   ok 時 value 為「已套預設值、僅含白名單欄位」的乾淨物件（防原型污染 key 帶入）。
 */
export function validateAppManifest(input) {
  const errors = [];
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, errors: ["manifest 必須是物件"] };
  }

  for (const key of Object.keys(input)) {
    if (!KNOWN_FIELDS.has(key)) errors.push(`${key}: 未知欄位`);
  }
  for (const key of REQUIRED) {
    if (input[key] === undefined || input[key] === null || input[key] === "") {
      errors.push(`${key}: 必填`);
    }
  }

  const isStr = (v) => typeof v === "string";

  if (isStr(input.application_id) && !APPLICATION_ID_RE.test(input.application_id)) {
    errors.push("application_id: 僅接受小寫英數與連字號（3–64 字）");
  }
  for (const [field, max] of Object.entries(STRING_MAX)) {
    const v = input[field];
    if (v === undefined) continue;
    if (!isStr(v)) errors.push(`${field}: 必須是字串`);
    else if (v.length > max) errors.push(`${field}: 超過 ${max} 字上限`);
  }
  for (const field of URL_FIELDS) {
    const v = input[field];
    if (v === undefined) continue;
    if (!isStr(v)) errors.push(`${field}: 必須是字串`);
    else checkUrl(field, v, errors);
  }
  for (const [field, { maxItems, itemMax }] of Object.entries(ARRAY_FIELDS)) {
    const v = input[field];
    if (v === undefined) continue;
    if (!Array.isArray(v)) errors.push(`${field}: 必須是陣列`);
    else if (v.length > maxItems) errors.push(`${field}: 超過 ${maxItems} 筆上限`);
    else if (!v.every((x) => isStr(x) && x.length > 0 && x.length <= itemMax)) {
      errors.push(`${field}: 每筆須為 1–${itemMax} 字的字串`);
    }
  }

  if (input.authentication_mode !== undefined && !AUTHENTICATION_MODES.includes(input.authentication_mode)) {
    errors.push(`authentication_mode: 必須是 ${AUTHENTICATION_MODES.join("/")}`);
  }
  if (input.visibility !== undefined && !VISIBILITIES.includes(input.visibility)) {
    errors.push(`visibility: 必須是 ${VISIBILITIES.join("/")}`);
  }
  if (input.data_classification !== undefined && !DATA_CLASSIFICATIONS.includes(input.data_classification)) {
    errors.push(`data_classification: 必須是 ${DATA_CLASSIFICATIONS.join("/")}`);
  }
  if (input.supports_sso !== undefined && typeof input.supports_sso !== "boolean") {
    errors.push("supports_sso: 必須是 boolean");
  }

  if (errors.length) return { ok: false, errors };

  const value = {};
  for (const key of KNOWN_FIELDS) {
    if (input[key] !== undefined) value[key] = input[key];
  }
  value.supports_sso = value.supports_sso ?? false;
  value.visibility = value.visibility ?? "HIDDEN";
  value.data_classification = value.data_classification ?? "internal";
  for (const field of Object.keys(ARRAY_FIELDS)) value[field] = value[field] ?? [];
  return { ok: true, value };
}
