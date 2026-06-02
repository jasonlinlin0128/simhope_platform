// src/lib/faq.js
// FAQ 分類（給 /faq 頁分組 + admin CRUD 選單用）。FAQ 專屬，與 hub 的 5 大 category 無關。
export const FAQ_CATEGORIES = [
  { key: "login", emoji: "🔐", label: "登入 / 帳號" },
  { key: "usage", emoji: "🧭", label: "使用工具" },
  { key: "submit", emoji: "📤", label: "提需求 / 上架" },
  { key: "security", emoji: "🛡️", label: "資料安全" },
  { key: "install", emoji: "🧠", label: "MCP / Skill 怎麼裝" },
];
export const FAQ_CATEGORY_KEYS = FAQ_CATEGORIES.map((c) => c.key);
