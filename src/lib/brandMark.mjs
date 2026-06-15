// 品牌 hub mark（白色版，置於漸層底，給 PWA icon / apple-icon 用）。
// 形狀同 src/components/HubMark.jsx / app/opengraph-image.js 的 MARK_SVG。
const WHITE_MARK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><g fill="none" stroke="#ffffff" stroke-width="4.4" stroke-linecap="round"><path d="M50 50 Q41.9 34.3 24 26"/><path d="M50 50 Q66.6 45.4 78 30"/><path d="M50 50 Q60 66.4 80 74"/><path d="M50 50 Q33.9 59.1 26 78"/></g><g fill="#ffffff"><circle cx="50" cy="50" r="11.5"/><circle cx="24" cy="26" r="6.5"/><circle cx="78" cy="30" r="6"/><circle cx="80" cy="74" r="7"/><circle cx="26" cy="78" r="5.5"/></g></svg>`;

export const WHITE_MARK_DATA_URI = `data:image/svg+xml;base64,${Buffer.from(WHITE_MARK_SVG).toString("base64")}`;
export const BRAND_GRADIENT = "linear-gradient(135deg, #a78bfa, #6366f1)";
