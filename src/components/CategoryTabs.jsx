"use client";
import { CATEGORIES, CATEGORY_ORDER } from "@/lib/taxonomy";

/** 類別 tab（全部 + 5 類別），含各類別計數。 */
export default function CategoryTabs({ active, counts, onChange }) {
  const tabs = [
    { key: "all", label: "全部", emoji: "" },
    ...CATEGORY_ORDER.map((k) => CATEGORIES[k]),
  ];
  return (
    <div className="flex flex-wrap gap-2 justify-center mb-6">
      {tabs.map((t) => {
        const isActive = active === t.key;
        const count = counts?.[t.key] ?? 0;
        return (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-extrabold border-2 transition-all ${
              isActive
                ? "bg-[var(--color-clay-purple)] text-white border-[var(--color-clay-purple)] shadow-md"
                : "bg-white dark:bg-gray-800 text-[var(--color-text-mid)] border-gray-200 dark:border-gray-700 hover:border-[var(--color-clay-purple)]/40 hover:-translate-y-0.5"
            }`}
          >
            {t.emoji && <span>{t.emoji}</span>}
            {t.label}
            <span
              className={`text-xs ${isActive ? "opacity-80" : "opacity-60"}`}
            >
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
