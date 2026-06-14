"use client";

import { useState, useEffect, useMemo } from "react";
import Fuse from "fuse.js";
import { categoryCounts, CATEGORIES, CATEGORY_ORDER } from "@/lib/taxonomy";
import ToolCard from "@/components/ToolCard";
import CategoryTabs from "@/components/CategoryTabs";
import { track } from "@/lib/track";

/**
 * 資源中心互動島：搜尋 + Fuse + 分類 tabs + grid。
 * @param {{tools: object[], initialCat?: string}} props  tools 由 server 抓好傳入。
 */
export default function HubExplorer({ tools, initialCat = "all" }) {
  const [activeCat, setActiveCat] = useState(initialCat);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchQuery.trim()), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // 重用 300ms debouncedQuery 記 search（非空才送；不帶 query text）
  useEffect(() => {
    if (debouncedQuery) track("search");
  }, [debouncedQuery]);

  const activeTools = useMemo(
    () => tools.filter((t) => t.status !== "terminated"),
    [tools],
  );
  const counts = useMemo(() => categoryCounts(tools), [tools]);

  const fuse = useMemo(
    () =>
      new Fuse(activeTools, {
        keys: ["title", "tagline", "tags", "desc"],
        threshold: 0.4,
        ignoreLocation: true,
      }),
    [activeTools],
  );

  const filtered = useMemo(() => {
    let result = activeTools;
    if (debouncedQuery) result = fuse.search(debouncedQuery).map((r) => r.item);
    if (activeCat !== "all")
      result = result.filter(
        (t) =>
          (CATEGORY_ORDER.includes(t.category) ? t.category : "tool") ===
          activeCat,
      );
    return result;
  }, [activeTools, debouncedQuery, fuse, activeCat]);

  return (
    <div className="px-4 md:px-0 max-w-6xl mx-auto py-10">
      <div className="text-center mb-8">
        <h1 className="text-4xl md:text-5xl font-black text-[var(--color-text-dark)] mb-3">
          資源中心
        </h1>
        <p className="text-[var(--color-text-mid)] font-semibold">
          {activeCat === "all"
            ? "公司所有 AI 資源 — 工具、平臺、專案、MCP、Skill"
            : CATEGORIES[activeCat]?.desc}
        </p>
      </div>

      <div className="relative mb-5 max-w-2xl mx-auto">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          aria-label="搜尋資源"
          placeholder="🔍 搜尋名稱、描述、關鍵字..."
          className="w-full pl-5 pr-12 py-3.5 rounded-2xl bg-white dark:bg-gray-800 border-2 border-[var(--color-card-border)] text-base font-medium focus:border-[var(--color-clay-purple)] focus:outline-none focus:ring-4 focus:ring-[var(--color-clay-purple)]/10 transition-all shadow-sm"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            aria-label="清除搜尋"
          >
            ✕
          </button>
        )}
      </div>

      <CategoryTabs
        active={activeCat}
        counts={counts}
        onChange={setActiveCat}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {filtered.map((t) => (
          <ToolCard key={t.id} tool={t} />
        ))}
        {filtered.length === 0 && (
          <div className="col-span-full py-20 text-center text-[var(--color-text-mid)] font-bold bg-white dark:bg-gray-800 rounded-[24px] border border-dashed border-gray-300 dark:border-gray-600">
            這個分類目前沒有項目
          </div>
        )}
      </div>
    </div>
  );
}
