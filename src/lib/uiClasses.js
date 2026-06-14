// src/lib/uiClasses.js
// 跨檔共用的 UI class 原子（含 dark: 變體）。只含色彩/邊框，版面各站點自接。
// 加新原子請維持「淺色逐字沿用現狀 + 補 dark:」原則，避免視覺迴歸。

// 痛點卡 Before/After（色彩部分；PainCard 與 admin 預覽共用）
export const BEFORE_BOX =
  "bg-red-50 dark:bg-red-950/40 text-red-900 dark:text-red-200 border border-red-100/60 dark:border-red-900/50";
export const AFTER_BOX =
  "bg-green-50 dark:bg-green-950/40 text-green-900 dark:text-green-200 border border-green-200/50 dark:border-green-900/50";
// PainCard 中段 ↓ 圓圈
export const STEP_ARROW =
  "bg-white dark:bg-gray-800 text-gray-400 dark:text-gray-500 border-2 border-green-100 dark:border-green-900/50";

// 紅色 danger 鈕（有框；對齊 admin:492 既有 dark 寫法）
export const DANGER_BTN =
  "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-900/40";
// 紅色 icon 鈕（無框、text-red-400）
export const DANGER_ICON_BTN =
  "bg-red-50 dark:bg-red-900/20 text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40";

// 灰 ghost / 次要鈕
export const MUTED_BTN =
  "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600";
// 灰 icon 鈕（text-gray-500）
export const MUTED_ICON_BTN =
  "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600";

// ── 表單輸入框原子 ──
// 淺灰底 + 灰框 + 圓角（含 dark:）。寬度（w-full / flex-1）、內距、字級由呼叫端組合，
// 例：`w-full ${INPUT_BOX} p-2 text-sm`。用於 admin 審核 wizard / FAQ 後台 / 提需求表單。
export const INPUT_BOX =
  "bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600";

// 詳情頁 block 編輯器的輸入框核心（卡片底色 + 卡片框 + 紫色 focus）。
// 不含寬度 / 文字色 / 圓角大小（xl vs lg）→ 由呼叫端組合，例：
// `flex-1 ${CARD_FIELD} text-[var(--color-text-dark)] rounded-xl`。
export const CARD_FIELD =
  "bg-[var(--color-card-bg)] border border-[var(--color-card-border)] px-3 py-2 text-sm outline-none focus:border-[var(--color-clay-purple)]";
