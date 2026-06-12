// src/lib/skillScrub.mjs
// 打包本地 skill 前的「該不該收進 zip」判定。純函式、無 I/O，node:test 可測。
// 被 scripts/import-local-resources.mjs 使用（避免把密鑰/個資打包公開）。

const EXCLUDE_DIRS = ["node_modules", ".git", "__pycache__", ".venv", "dist"];

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
  return false;
}

// 明確的 secret 樣式（排掉佔位字串如 your-key-here）。
const SECRET_PATTERNS = [
  /sk-[A-Za-z0-9_-]{16,}/, // OpenAI / Anthropic key
  /AIza[0-9A-Za-z_-]{35}/, // Google API key
  /ghp_[0-9A-Za-z]{36}/, // GitHub PAT
  /xox[baprs]-[0-9A-Za-z-]{10,}/, // Slack token
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/, // PEM 私鑰
  /"?FIREBASE_SERVICE_ACCOUNT"?\s*[:=]\s*["{]/, // SA JSON
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
