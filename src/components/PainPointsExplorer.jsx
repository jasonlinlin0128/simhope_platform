"use client";

import { useState, useMemo } from "react";
import PainCard, { PAIN_CATEGORIES } from "@/components/PainCard";

/**
 * 痛點區互動島：類別 chip 篩選 + 卡片 grid。
 * @param {{painCards: object[]}} props  painCards 由 server 頁抓好傳入。
 */
export default function PainPointsExplorer({ painCards }) {
  const [selectedPainCategory, setSelectedPainCategory] = useState("all");

  const painCategoryCounts = useMemo(() => {
    const counts = { all: painCards.length };
    for (const key of Object.keys(PAIN_CATEGORIES)) {
      counts[key] = painCards.filter((c) => c.category === key).length;
    }
    return counts;
  }, [painCards]);

  const sortedPainCards = useMemo(() => {
    const filtered =
      selectedPainCategory === "all"
        ? painCards
        : painCards.filter((c) => c.category === selectedPainCategory);
    return [...filtered].sort((a, b) => {
      const aHas = !!a.relatedToolId;
      const bHas = !!b.relatedToolId;
      if (aHas && !bHas) return -1;
      if (!aHas && bHas) return 1;
      return 0;
    });
  }, [painCards, selectedPainCategory]);

  return (
    <>
      {painCards.length > 0 && (
        <div className="mb-8 max-w-5xl mx-auto">
          <div className="flex flex-wrap gap-2 justify-center">
            <button
              onClick={() => setSelectedPainCategory("all")}
              className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-extrabold border-2 transition-all ${
                selectedPainCategory === "all"
                  ? "bg-[var(--color-clay-coral)] text-white border-[var(--color-clay-coral)] shadow-md"
                  : "bg-white dark:bg-gray-800 text-[var(--color-text-mid)] border-gray-200 dark:border-gray-700 hover:border-[var(--color-clay-coral)]/40"
              }`}
            >
              全部
              <span className="text-xs opacity-70">
                {painCategoryCounts.all}
              </span>
            </button>
            {Object.entries(PAIN_CATEGORIES).map(([key, cat]) => {
              const active = selectedPainCategory === key;
              const count = painCategoryCounts[key] ?? 0;
              if (count === 0) return null;
              return (
                <button
                  key={key}
                  onClick={() => setSelectedPainCategory(key)}
                  className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-extrabold border-2 transition-all ${
                    active
                      ? "bg-[var(--color-clay-coral)] text-white border-[var(--color-clay-coral)] shadow-md"
                      : "bg-white dark:bg-gray-800 text-[var(--color-text-mid)] border-gray-200 dark:border-gray-700 hover:border-[var(--color-clay-coral)]/40 hover:-translate-y-0.5"
                  }`}
                >
                  <span>{cat.emoji}</span>
                  {cat.label}
                  <span className="text-xs opacity-70">{count}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {sortedPainCards.map((c) => (
          <PainCard key={c.id} card={c} />
        ))}
      </div>
    </>
  );
}
