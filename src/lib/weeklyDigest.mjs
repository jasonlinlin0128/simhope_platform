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
 * Discord webhook content 上限 2000 字：批次發布的一週可能很多筆、且 title/tagline
 * 皆為 admin 自由輸入無 maxLength。故：①截斷每筆 title/tagline ②限列數（maxItems）
 * ③**最後再用總長度上限硬性把尾端項目擠掉**（per-field 截斷無法保證組裝後總長），
 * 超出的以「…還有 N 個」帶過。確保整則 < maxChars，避免被 Discord 回 400 → 整週靜默不發。
 * @param {Array<{title?:string, tagline?:string}>} tools
 * @param {number} [maxItems=15]    最多列出的筆數
 * @param {number} [taglineMax=80]  每筆 tagline 截斷長度
 * @param {number} [titleMax=60]    每筆 title 截斷長度
 * @param {number} [maxChars=1900]  整則訊息字數上限（< Discord 2000 留緩衝）
 * @returns {string|null}
 */
export function buildDigestMessage(
  tools,
  maxItems = 15,
  taglineMax = 80,
  titleMax = 60,
  maxChars = 1900,
) {
  if (!tools || tools.length === 0) return null;
  const total = tools.length;
  const trunc = (s, n) => (s.length > n ? `${s.slice(0, n)}…` : s);
  const line = (t) => {
    const title = trunc(String(t.title || "(未命名)"), titleMax);
    const tag = t.tagline ? trunc(String(t.tagline), taglineMax) : "";
    return `• ${title}${tag ? ` — ${tag}` : ""}`;
  };
  const assemble = (items) => {
    const overflow = total - items.length;
    const moreLine = overflow > 0 ? `\n…還有 ${overflow} 個新資源` : "";
    const body = items.map(line).join("\n");
    return `📢 SimHope 本週新增資源（${total}）：\n${body}${moreLine}\n\n看全部：https://simhope-platform.vercel.app/hub`;
  };
  // 先取 maxItems，再依總長度上限把尾端項目擠掉（至少留 1 筆；單筆已截斷，必能容下）。
  let shown = tools.slice(0, Math.max(1, maxItems));
  let msg = assemble(shown);
  while (shown.length > 1 && msg.length > maxChars) {
    shown = shown.slice(0, -1);
    msg = assemble(shown);
  }
  return msg;
}
