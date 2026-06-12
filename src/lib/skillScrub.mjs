// src/lib/skillScrub.mjs
// 打包本地 skill 前的「該不該收進 zip」判定。純函式、無 I/O，node:test 可測。
// 被 scripts/import-local-resources.mjs 使用。
//
// ⚠️ 重點：content-scan 只能擋「密鑰格式」，擋不了「散文機密」（如內部報告點名主管、
// 真實客戶文件）。因此採「保守排除」：examples/ 目錄與二進位/憑證副檔名一律不收，
// 且哪些 skill 適合公開要在「分類」層判斷（self-authored ≠ 可公開）。

const EXCLUDE_DIRS = [
  "node_modules",
  ".git",
  "__pycache__",
  ".venv",
  "dist",
  "examples", // 範例常含真實內部資料
];
// 二進位 / 憑證副檔名：content-scan 掃不到，直接排除（避免未掃描的真資料/密鑰）。
const EXCLUDE_EXT = /\.(xlsx?|xlsm|docx?|pdf|pem|p12|pfx|key|keystore|sqlite|pyc)$/i;

/**
 * 路徑（相對 skill 根）命中即排除。.env.example 例外保留。
 * @param {string} relPath
 * @returns {boolean}
 */
export function shouldExcludePath(relPath) {
  const p = relPath.replace(/\\/g, "/");
  const base = p.split("/").pop();
  if (EXCLUDE_DIRS.some((d) => p.split("/").includes(d))) return true;
  if (/\.log$/i.test(base)) return true;
  if (base === ".env.example") return false; // 範例保留
  if (/^\.env(\.|$)/.test(base)) return true; // .env / .env.local / .env.*
  if (EXCLUDE_EXT.test(base)) return true;
  if (/^serviceAccount.*\.json$/i.test(base)) return true;
  if (base === "id_rsa" || base === "credentials.json") return true;
  return false;
}

// 明確的 secret 樣式（要求帶值，排掉佔位字串如 your-key-here）。
const SECRET_PATTERNS = [
  /sk-[A-Za-z0-9_-]{16,}/, // OpenAI / Anthropic（含 sk-ant-）
  /AIza[0-9A-Za-z_-]{35}/, // Google API key
  /AKIA[0-9A-Z]{16}/, // AWS access key
  /ghp_[0-9A-Za-z]{36}/, // GitHub PAT (classic)
  /gh[oprs]_[0-9A-Za-z]{36}/, // GitHub oauth/user/server/refresh token
  /github_pat_[0-9A-Za-z_]{60,}/, // GitHub fine-grained PAT
  /glpat-[0-9A-Za-z_-]{20,}/, // GitLab PAT
  /npm_[0-9A-Za-z]{36}/, // npm token
  /xox[baprs]-[0-9A-Za-z-]{10,}/, // Slack token
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/, // PEM 私鑰
  /"?FIREBASE_SERVICE_ACCOUNT"?\s*[:=]\s*["{]/, // SA JSON
  /(?:password|passwd|secret|api[_-]?key|token)\s*[:=]\s*["'][^"'\s]{8,}["']/i, // 通用 key=帶引號值
];

/**
 * 內容是否含 secret 樣式。
 * @param {string} content
 * @returns {boolean}
 */
export function containsSecret(content) {
  if (!content) return false;
  return SECRET_PATTERNS.some((re) => re.test(content));
}
