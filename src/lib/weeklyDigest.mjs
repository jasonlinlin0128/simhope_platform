// src/lib/weeklyDigest.mjs
// 每週新增資源摘要的純邏輯。無 firebase/browser 依賴，可 node:test。

const PUBLIC_STATUSES = new Set(["live", "beta", "new"]);

/**
 * 篩出「近 windowDays 天內新增的公開工具」。
 * @param {Array<{status?:string, createdAtMs?:unknown}>} tools
 * @param {number} nowMs
 * @param {number} [windowDays=7]
 * @returns {object[]}
 */
export function selectRecentTools(tools, nowMs, windowDays = 7) {
  const cutoff = nowMs - windowDays * 24 * 60 * 60 * 1000;
  return (tools || []).filter(
    (t) =>
      t &&
      PUBLIC_STATUSES.has(t.status) &&
      typeof t.createdAtMs === "number" &&
      t.createdAtMs >= cutoff,
  );
}

/**
 * 組 Discord 摘要訊息。無工具 → null（空週不發）。
 * @param {Array<{title?:string, tagline?:string}>} tools
 * @returns {string|null}
 */
export function buildDigestMessage(tools) {
  if (!tools || tools.length === 0) return null;
  const lines = tools.map(
    (t) => `• ${t.title || "(未命名)"}${t.tagline ? ` — ${t.tagline}` : ""}`,
  );
  return `📢 SimHope 本週新增資源（${tools.length}）：\n${lines.join("\n")}\n\n看全部：https://simhope-platform.vercel.app/hub`;
}
