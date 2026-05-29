import Link from "next/link";

/**
 * 7 個痛點類別 — emoji + 標籤 + 對應顏色
 * key 跟 painCard.category 對齊；app/page.jsx 篩選 chip 也用同一份
 */
export const PAIN_CATEGORIES = {
  communication: {
    label: "跨國溝通",
    emoji: "🌏",
    cls: "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-700",
  },
  reports: {
    label: "日報表 / 工時",
    emoji: "📊",
    cls: "bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-700",
  },
  documents: {
    label: "文書處理",
    emoji: "📄",
    cls: "bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-700",
  },
  security: {
    label: "資安管控",
    emoji: "🛡️",
    cls: "bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-700",
  },
  manufacturing: {
    label: "生產製造",
    emoji: "🏭",
    cls: "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-700",
  },
  quality: {
    label: "品保 / SOP",
    emoji: "🔧",
    cls: "bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 border-teal-200 dark:border-teal-700",
  },
  admin: {
    label: "行政協作",
    emoji: "📋",
    cls: "bg-pink-50 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300 border-pink-200 dark:border-pink-700",
  },
};

/**
 * 痛點卡 — Before / After 對比。
 * 若 card.relatedToolId 存在，整張卡可點，導向 /tool/{relatedToolId}。
 * 沒有 relatedToolId（孤兒）就維持靜態 div 顯示。
 * 左上角顯示痛點類別 chip（依 card.category）。
 */
export default function PainCard({ card }) {
  const { before, after, category, relatedToolId } = card;
  const clickable = !!relatedToolId;
  const cat = PAIN_CATEGORIES[category];

  const inner = (
    <>
      <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-[var(--color-clay-purple)]/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-bl-full pointer-events-none"></div>

      <div className="flex gap-2 items-center mb-4 relative z-10">
        {cat && (
          <span
            className={`inline-flex items-center gap-1 text-[0.7rem] px-2.5 py-1 rounded-full font-extrabold border ${cat.cls}`}
          >
            <span>{cat.emoji}</span> {cat.label}
          </span>
        )}
        {clickable && (
          <span className="ml-auto text-[0.7rem] text-[var(--color-clay-purple)] font-extrabold opacity-0 group-hover:opacity-100 transition-opacity">
            看工具 →
          </span>
        )}
      </div>

      <div className="flex flex-col gap-3 flex-1 relative z-10">
        <div className="bg-red-50 text-red-900 border border-red-100/60 rounded-2xl p-3.5 pr-4 text-[0.95rem] font-bold shadow-sm leading-snug">
          <span className="mr-1">😓</span> {before}
        </div>

        <div className="flex justify-center -my-3 z-20 relative">
          <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center text-gray-400 font-black shadow-md border-2 border-green-100">
            ↓
          </div>
        </div>

        <div className="bg-green-50 text-green-900 border border-green-200/50 rounded-2xl p-3.5 pr-4 text-[0.95rem] font-bold shadow-sm leading-snug flex-1">
          <span className="mr-1">✅</span> {after}
        </div>
      </div>
    </>
  );

  const baseClass = `bg-[var(--color-card-bg)] rounded-[24px] p-5 shadow-sm border border-[var(--color-card-border)] transition-all relative overflow-hidden group h-full flex flex-col`;

  if (clickable) {
    return (
      <Link
        href={`/tool/${relatedToolId}`}
        className={`${baseClass} hover:shadow-lg hover:-translate-y-1 cursor-pointer block`}
      >
        {inner}
      </Link>
    );
  }

  return (
    <div className={`${baseClass} hover:shadow-md cursor-default`}>{inner}</div>
  );
}
