// src/lib/safeUrl.js
// 判斷一個 URL 是否可安全讓「伺服器」去 fetch（擋 SSRF）。純函式、可 node 斷言。
// 只允許 http/https，且擋掉 localhost / 內網 / link-local / 純主機名。

const PRIVATE_HOST_RE = [
  /^localhost$/, // host 已轉小寫
  /^127\./,
  /^0\.0\.0\.0$/,
  /^10\./,
  /^192\.168\./,
  /^169\.254\./, // IPv4 link-local（含雲端 metadata 169.254.169.254）
  /^172\.(1[6-9]|2\d|3[01])\./, // 172.16–172.31
  // IPv6（括號已去除）
  /^::1$/, // loopback
  /^::ffff:/, // IPv4-mapped（一律擋，YAGNI 不細分公私）
  /^f[cd][0-9a-f]{2}:/, // ULA fc00::/7
  /^fe80:/, // link-local
  /\.local$/, // mDNS
];

/**
 * @param {string} raw
 * @returns {boolean} 只有 http/https 且非內網/私有 host 才回 true
 */
export function isSafeHttpUrl(raw) {
  let u;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  // 正規化：轉小寫、去尾點（擋 `localhost.` 之類繞過）、去 IPv6 括號
  let host = u.hostname.toLowerCase().replace(/\.$/, "");
  if (host.startsWith("[") && host.endsWith("]")) host = host.slice(1, -1);
  if (!host) return false;
  // 純主機名（無點、無冒號）多半是內網，拒掉
  if (!host.includes(".") && !host.includes(":")) return false;
  return !PRIVATE_HOST_RE.some((re) => re.test(host));
}
