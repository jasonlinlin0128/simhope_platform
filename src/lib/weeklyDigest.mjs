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
 * Discord webhook content 上限 2000 字：批次發布的一週可能很多筆，
 * 故限制列數（maxItems）+ 截斷每筆 tagline，超出的以「…還有 N 個」帶過，
 * 避免整則訊息超長被 Discord 回 400 → 整週摘要靜默不發。
 * @param {Array<{title?:string, tagline?:string}>} tools
 * @param {number} [maxItems=15]    最多列出的筆數
 * @param {number} [taglineMax=80]  每筆 tagline 截斷長度
 * @returns {string|null}
 */
export function buildDigestMessage(tools, maxItems = 15, taglineMax = 80) {
  if (!tools || tools.length === 0) return null;
  const shown = tools.slice(0, Math.max(0, maxItems));
  const lines = shown.map((t) => {
    const title = t.title || "(未命名)";
    const tag = t.tagline ? String(t.tagline) : "";
    const tagShown =
      tag.length > taglineMax ? `${tag.slice(0, taglineMax)}…` : tag;
    return `• ${title}${tagShown ? ` — ${tagShown}` : ""}`;
  });
  const overflow = tools.length - shown.length;
  const moreLine = overflow > 0 ? `\n…還有 ${overflow} 個新資源` : "";
  return `📢 SimHope 本週新增資源（${tools.length}）：\n${lines.join("\n")}${moreLine}\n\n看全部：https://simhope-platform.vercel.app/hub`;
}
