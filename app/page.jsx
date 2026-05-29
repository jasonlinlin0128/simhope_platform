"use client";

import { useState, useEffect, useMemo } from "react";
import Fuse from "fuse.js";
import { getApprovedTools, getApprovedPainCards } from "@/lib/db";
import ToolCard from "@/components/ToolCard";
import PainCard, { PAIN_CATEGORIES } from "@/components/PainCard";
import Link from "next/link";

// 5 種類型 chip 的顯示資料
const TYPE_CHIPS = [
  { key: "all", label: "全部", emoji: "" },
  { key: "webapp", label: "網頁應用", emoji: "🌐" },
  { key: "download", label: "軟體下載", emoji: "⬇️" },
  { key: "doc", label: "文件 / 表單", emoji: "📄" },
  { key: "mcp", label: "AI 連接器", emoji: "🔌" },
  { key: "api", label: "API / SDK", emoji: "🧩" },
];

const TESTIMONIALS = [
  {
    color: "#A78BFA",
    stars: 5,
    quote:
      "以前跟泰籍同事講射料頭、鵝頸這些術語，翻譯軟體都翻不準，現在手機開連結直接用，師傅自己就操作，溝通順太多。",
    name: "壓鑄產線領班",
    dept: "生產現場",
    tool: "現場即時翻譯",
  },
  {
    color: "#34D399",
    stars: 5,
    quote:
      "以前每天填報要 15 分鐘、月底還要人工彙整 Excel，現在 10 分鐘填完、月報自動產，我每天可以準時下班。",
    name: "加工部同仁",
    dept: "日報表",
    tool: "加工部日報表",
  },
  {
    color: "#FFD166",
    stars: 4,
    quote:
      "新進來查檢驗標準不用一直問老師傅了，手機直接看 SOP，主管審核後的版本一定準，照著做就對了。",
    name: "品保部新進",
    dept: "品保 / SOP",
    tool: "SOP-Interface APP",
  },
  {
    color: "#FF6B6B",
    stars: 5,
    quote:
      "PDF 合併拆分、Excel 清洗、QR Code 產生、檔案重命名⋯⋯以前要裝七八個工具，現在一個 app 全搞定，桌面乾淨多了。",
    name: "軍品業務部同仁",
    dept: "桌面工具",
    tool: "SimHope 工具箱",
  },
];

const PAIN_CHIPS = [
  { emoji: "📄", text: "文件找半天" },
  { emoji: "🌏", text: "語言溝通卡關" },
  { emoji: "📊", text: "報表要手動填" },
  { emoji: "🔍", text: "SOP 翻了找不到" },
  { emoji: "⏰", text: "工時統計耗時" },
];

export default function Home() {
  const [tools, setTools] = useState([]);
  const [painCards, setPainCards] = useState([]);
  const [loading, setLoading] = useState(true);

  // 新版篩選狀態
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedType, setSelectedType] = useState("all");
  const [selectedScenarios, setSelectedScenarios] = useState([]);

  // 讀資料
  useEffect(() => {
    Promise.all([getApprovedTools(), getApprovedPainCards()])
      .then(([toolsData, painsData]) => {
        setTools(toolsData);
        setPainCards(painsData);
      })
      .catch((err) => console.error("Failed to load:", err))
      .finally(() => setLoading(false));
  }, []);

  // debounce 搜尋字串 (300ms)
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchQuery.trim()), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // 把工具分成「在用中」與「已終止」兩組 — 主列表只顯示在用中，底部摺疊區顯示已終止
  const activeTools = useMemo(
    () => tools.filter((t) => t.status !== "terminated"),
    [tools],
  );
  const terminatedTools = useMemo(
    () => tools.filter((t) => t.status === "terminated"),
    [tools],
  );

  // 場景 chip 候選 — 只從在用中工具聚合（已終止的場景不該污染篩選列）
  const allScenarios = useMemo(() => {
    const set = new Set();
    activeTools.forEach((t) => {
      if (Array.isArray(t.scenarios)) t.scenarios.forEach((s) => set.add(s));
    });
    return Array.from(set).sort();
  }, [activeTools]);

  // 各類型工具數（顯示在 chip 旁邊）— 只算在用中
  const typeCounts = useMemo(() => {
    const counts = { all: activeTools.length };
    for (const chip of TYPE_CHIPS) {
      if (chip.key === "all") continue;
      counts[chip.key] = activeTools.filter(
        (t) => (t.type || "webapp") === chip.key,
      ).length;
    }
    return counts;
  }, [activeTools]);

  // Fuse.js — 模糊比對 title / tagline / tags（只搜尋在用中）
  const fuse = useMemo(
    () =>
      new Fuse(activeTools, {
        keys: ["title", "tagline", "tags", "desc"],
        threshold: 0.4,
        ignoreLocation: true,
      }),
    [activeTools],
  );

  // 三段式篩選：搜尋 → 類型 → 場景
  const filteredTools = useMemo(() => {
    let result = activeTools;

    if (debouncedQuery) {
      result = fuse.search(debouncedQuery).map((r) => r.item);
    }

    if (selectedType !== "all") {
      result = result.filter((t) => (t.type || "webapp") === selectedType);
    }

    if (selectedScenarios.length > 0) {
      result = result.filter((t) =>
        t.scenarios?.some((s) => selectedScenarios.includes(s)),
      );
    }

    return result;
  }, [activeTools, debouncedQuery, fuse, selectedType, selectedScenarios]);

  const toggleScenario = (scenario) => {
    setSelectedScenarios((prev) =>
      prev.includes(scenario)
        ? prev.filter((s) => s !== scenario)
        : [...prev, scenario],
    );
  };

  const clearAllFilters = () => {
    setSearchQuery("");
    setSelectedType("all");
    setSelectedScenarios([]);
  };

  const hasActiveFilters =
    debouncedQuery || selectedType !== "all" || selectedScenarios.length > 0;

  // 痛點類別篩選
  const [selectedPainCategory, setSelectedPainCategory] = useState("all");

  // 痛點各類別張數
  const painCategoryCounts = useMemo(() => {
    const counts = { all: painCards.length };
    for (const key of Object.keys(PAIN_CATEGORIES)) {
      counts[key] = painCards.filter((c) => c.category === key).length;
    }
    return counts;
  }, [painCards]);

  // 痛點卡片：依類別篩選 → 「有對應工具優先 → 孤兒在後」排序
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
    <div className="flex flex-col gap-24 px-4 md:px-0">
      {/* ── HERO ── */}
      <section className="text-center pt-10 pb-4 flex flex-col items-center">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[var(--color-clay-purple)]/10 text-[var(--color-clay-purple)] font-extrabold text-sm mb-6 border border-[var(--color-clay-purple)]/20 shadow-sm">
          🏭 專為公司同仁設計的 AI 工具中心
        </div>

        <h1 className="text-5xl md:text-7xl font-black text-[var(--color-text-dark)] leading-tight mb-8">
          日常痛點太多？
          <br />
          這裡有
          <span className="bg-gradient-to-br from-[var(--color-clay-coral)] to-[var(--color-clay-orange)] bg-clip-text text-transparent">
            現成的 AI 解法
          </span>
        </h1>

        <div className="flex flex-wrap justify-center gap-2 mb-8 max-w-2xl mx-auto">
          {PAIN_CHIPS.map((chip, idx) => (
            <span
              key={idx}
              className="flex items-center gap-1.5 bg-white/85 dark:bg-gray-800/85 border-2 border-black/7 dark:border-white/10 backdrop-blur-sm rounded-full px-4 py-2 text-sm font-bold text-[var(--color-text-dark)] dark:text-gray-200 shadow-sm cursor-default hover:border-[var(--color-clay-purple)]/30 hover:shadow-md transition-all"
            >
              <span>{chip.emoji}</span> {chip.text}
            </span>
          ))}
        </div>

        <p className="text-lg md:text-xl text-[var(--color-text-mid)] font-semibold mb-10 max-w-2xl mx-auto leading-relaxed">
          這些工具都是根據公司實際流程開發的，不需要懂 AI，打開就能用。
          <br />
          目前收錄{" "}
          <strong className="text-[var(--color-text-dark)]">
            {loading ? "…" : activeTools.length} 個工具
          </strong>
          ，持續新增中。
        </p>

        <div className="flex gap-4 flex-wrap justify-center mb-16">
          <Link
            href="#tools"
            className="px-8 py-4 rounded-full bg-gradient-to-br from-[var(--color-clay-coral)] to-[var(--color-clay-orange)] text-white font-extrabold text-lg shadow-[0_6px_20px_rgba(255,107,107,0.45)] hover:-translate-y-1 hover:shadow-[0_12px_30px_rgba(255,107,107,0.55)] transition-all"
          >
            🔧 馬上找工具
          </Link>
          <Link
            href="#painpoints"
            className="px-8 py-4 rounded-full bg-white dark:bg-gray-800 text-[var(--color-text-dark)] dark:text-gray-200 font-extrabold text-lg border-2 border-[#1e1b4b]/15 dark:border-white/10 shadow-sm hover:-translate-y-1 hover:shadow-md transition-all"
          >
            👀 看看解決什麼問題
          </Link>
        </div>

        <div className="flex flex-wrap gap-5 justify-center">
          {[
            {
              id: "tools",
              value: loading ? "…" : activeTools.length,
              label: "可用工具",
            },
            { id: "users", value: "30+", label: "同仁每週使用" },
            { id: "hrs", value: "10h", label: "估計每週省下" },
          ].map((s, i) => (
            <div
              key={s.id}
              className="bg-white/85 dark:bg-gray-800/85 border-2 border-white/90 dark:border-white/10 backdrop-blur-sm rounded-2xl px-7 py-5 text-center shadow-[var(--shadow-clay)]"
              style={{ animationDelay: `${i * 0.8}s` }}
            >
              <div className="text-3xl font-black text-[var(--color-text-dark)]">
                {s.value}
              </div>
              <div className="text-sm font-semibold text-[var(--color-text-mid)] mt-1">
                {s.label}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── PAIN POINTS ── */}
      <section id="painpoints" className="scroll-mt-32">
        <div className="mb-10 text-center">
          <div className="inline-block px-3 py-1 rounded bg-red-100/50 dark:bg-red-900/20 text-[var(--color-clay-coral)] font-bold text-sm mb-4">
            😤 → 😌 解決真實痛點
          </div>
          <h2 className="text-3xl md:text-4xl font-black text-[var(--color-text-dark)] mb-4">
            這些問題，你每週遇到幾次？
          </h2>
          <p className="text-[var(--color-text-mid)] font-semibold">
            每個工具的出發點都是一個真實的工作痛點，不是為了用 AI 而用 AI。
          </p>
        </div>

        {/* 痛點類別 chip 列 */}
        {!loading && painCards.length > 0 && (
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

        {loading ? (
          <div className="text-center py-10 text-gray-400">載入中，請稍候…</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {sortedPainCards.map((c) => (
              <PainCard key={c.id} card={c} />
            ))}
          </div>
        )}
      </section>

      {/* ── TOOLS（Vercel Marketplace 風） ── */}
      <section id="tools" className="scroll-mt-32 mb-20">
        <div className="mb-10 text-center">
          <div className="inline-block px-3 py-1 rounded bg-blue-100/50 dark:bg-blue-900/20 text-[var(--color-clay-blue)] font-bold text-sm mb-4">
            🧰 工具總覽
          </div>
          <h2 className="text-3xl md:text-4xl font-black text-[var(--color-text-dark)] mb-4">
            所有現成解決方案
          </h2>
          <p className="text-[var(--color-text-mid)] font-semibold">
            每個工具都標示了適用場景，可依類型 / 場景或搜尋找到合適的。
          </p>
        </div>

        {/* === 篩選列 === */}
        <div className="mb-8 max-w-5xl mx-auto">
          {/* 搜尋框 */}
          <div className="relative mb-5">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="🔍 搜尋工具名稱、描述、關鍵字..."
              className="w-full pl-5 pr-12 py-3.5 rounded-2xl bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 text-base font-medium focus:border-[var(--color-clay-purple)] focus:outline-none focus:ring-4 focus:ring-[var(--color-clay-purple)]/10 transition-all shadow-sm"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition"
                aria-label="清除搜尋"
              >
                ✕
              </button>
            )}
          </div>

          {/* 類型 chip 列 (單選) */}
          <div className="mb-4">
            <div className="text-xs font-extrabold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">
              類型
            </div>
            <div className="flex flex-wrap gap-2">
              {TYPE_CHIPS.map((chip) => {
                const active = selectedType === chip.key;
                const count = typeCounts[chip.key] ?? 0;
                return (
                  <button
                    key={chip.key}
                    onClick={() => setSelectedType(chip.key)}
                    className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-extrabold border-2 transition-all ${
                      active
                        ? "bg-[var(--color-clay-purple)] text-white border-[var(--color-clay-purple)] shadow-md"
                        : "bg-white dark:bg-gray-800 text-[var(--color-text-mid)] border-gray-200 dark:border-gray-700 hover:border-[var(--color-clay-purple)]/40 hover:-translate-y-0.5"
                    }`}
                  >
                    {chip.emoji && <span>{chip.emoji}</span>}
                    {chip.label}
                    <span
                      className={`text-xs ${active ? "opacity-80" : "opacity-60"}`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 場景 chip 列 (多選) */}
          {allScenarios.length > 0 && (
            <div className="mb-3">
              <div className="text-xs font-extrabold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">
                適用場景（可複選）
              </div>
              <div className="flex flex-wrap gap-2">
                {allScenarios.map((scenario) => {
                  const active = selectedScenarios.includes(scenario);
                  const count = tools.filter((t) =>
                    t.scenarios?.includes(scenario),
                  ).length;
                  return (
                    <button
                      key={scenario}
                      onClick={() => toggleScenario(scenario)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border-2 transition-all ${
                        active
                          ? "bg-[var(--color-clay-blue)] text-white border-[var(--color-clay-blue)] shadow-md"
                          : "bg-white dark:bg-gray-800 text-[var(--color-text-mid)] border-gray-200 dark:border-gray-700 hover:border-[var(--color-clay-blue)]/40"
                      }`}
                    >
                      {scenario}
                      <span
                        className={`${active ? "opacity-80" : "opacity-60"}`}
                      >
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 清除全部 + 結果摘要 */}
          {hasActiveFilters && (
            <div className="flex items-center justify-between gap-3 mt-3 text-sm">
              <span className="text-[var(--color-text-mid)] font-semibold">
                找到{" "}
                <strong className="text-[var(--color-text-dark)]">
                  {filteredTools.length}
                </strong>{" "}
                個工具
              </span>
              <button
                onClick={clearAllFilters}
                className="text-[var(--color-clay-purple)] font-bold hover:underline"
              >
                清除全部篩選 ✕
              </button>
            </div>
          )}
        </div>

        {/* === 工具網格 === */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 opacity-60">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div
                key={i}
                className="bg-white dark:bg-gray-800 rounded-[24px] p-5 h-[260px] border border-gray-200 dark:border-gray-700 animate-pulse"
              >
                <div className="w-14 h-14 bg-gray-200 dark:bg-gray-600 rounded-2xl mb-4" />
                <div className="w-3/4 h-5 bg-gray-200 dark:bg-gray-600 rounded-lg mb-2" />
                <div className="w-1/2 h-5 bg-gray-200 dark:bg-gray-600 rounded-lg" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {filteredTools.map((t) => (
              <ToolCard key={t.id} tool={t} />
            ))}
            {filteredTools.length === 0 && (
              <div className="col-span-full py-20 text-center text-gray-500 dark:text-gray-400 font-bold bg-white dark:bg-gray-800 rounded-[24px] border border-dashed border-gray-300 dark:border-gray-600">
                {hasActiveFilters
                  ? "沒有符合篩選條件的工具"
                  : "目前沒有上架工具"}
                {hasActiveFilters && (
                  <div className="mt-3">
                    <button
                      onClick={clearAllFilters}
                      className="text-[var(--color-clay-purple)] font-bold hover:underline text-sm"
                    >
                      清除篩選看全部
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── 已終止工具 (摺疊區) ── */}
        {!loading && terminatedTools.length > 0 && (
          <details className="mt-12 max-w-5xl mx-auto group">
            <summary className="cursor-pointer flex items-center justify-center gap-2 py-3 px-5 rounded-2xl bg-white/60 dark:bg-gray-800/60 border border-dashed border-gray-300 dark:border-gray-600 text-sm font-bold text-[var(--color-text-mid)] hover:bg-white dark:hover:bg-gray-800 transition list-none">
              <span className="text-base">🗄️</span>
              <span>已終止的工具</span>
              <span className="text-xs opacity-70">
                ({terminatedTools.length})
              </span>
              <span className="text-xs opacity-50 group-open:rotate-180 transition-transform">
                ▾
              </span>
            </summary>
            <div className="mt-5 pl-4 border-l-2 border-gray-200 dark:border-gray-700">
              <p className="text-xs text-[var(--color-text-mid)] mb-4 italic">
                這些工具已停止維護或已整合到別的工具裡，保留作為歷史紀錄。
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 opacity-75">
                {terminatedTools.map((t) => (
                  <ToolCard key={t.id} tool={t} />
                ))}
              </div>
            </div>
          </details>
        )}
      </section>

      {/* ── TESTIMONIALS ── */}
      <section id="feedback" className="scroll-mt-32 mb-4">
        <div className="mb-10 text-center">
          <div className="inline-block px-3 py-1 rounded bg-purple-100/50 dark:bg-purple-900/20 text-[var(--color-clay-purple)] font-bold text-sm mb-4">
            💬 同仁回饋
          </div>
          <h2 className="text-3xl md:text-4xl font-black text-[var(--color-text-dark)] mb-4">
            用過的人說……
          </h2>
          <p className="text-[var(--color-text-mid)] font-semibold">
            這些是真實同仁的使用心得，不是業配。
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {TESTIMONIALS.map((t, i) => (
            <div
              key={i}
              className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-2xl p-6 shadow-[var(--shadow-clay)] border border-white/80 dark:border-white/5"
              style={{ borderTop: `4px solid ${t.color}` }}
            >
              <div className="flex gap-0.5 mb-3">
                {Array.from({ length: 5 }).map((_, si) => (
                  <span
                    key={si}
                    className="text-lg"
                    style={{ color: si < t.stars ? "#FFD166" : "#D1D5DB" }}
                  >
                    ★
                  </span>
                ))}
              </div>
              <p className="text-[var(--color-text-dark)] dark:text-gray-100 font-semibold leading-relaxed mb-4">
                「{t.quote}」
              </p>
              <div className="flex items-center gap-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-white font-black text-sm flex-shrink-0"
                  style={{ background: t.color }}
                >
                  {t.name.charAt(0)}
                </div>
                <div>
                  <div className="font-extrabold text-sm text-[var(--color-text-dark)]">
                    {t.name}
                  </div>
                  <div className="text-xs text-[var(--color-text-mid)]">
                    {t.dept}・使用{t.tool}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA HELP ── */}
      <section id="about" className="scroll-mt-32 mb-20">
        <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-3xl p-10 md:p-14 text-center shadow-[var(--shadow-clay-lg)] border border-white/80 dark:border-white/5">
          <div className="text-6xl mb-6">🤝</div>
          <h2 className="text-3xl md:text-4xl font-black text-[var(--color-text-dark)] mb-4">
            有工作上的困擾？
            <br />
            說出來，我來想辦法
          </h2>
          <p className="text-[var(--color-text-mid)] font-semibold mb-8 max-w-xl mx-auto leading-relaxed">
            不知道有沒有工具可以用？有個想法但不知道怎麼實現？
            <br />
            直接說，我會幫你找或幫你做。
          </p>
          <div className="flex gap-4 flex-wrap justify-center mb-6">
            <Link
              href="#tools"
              className="px-8 py-4 rounded-full bg-gradient-to-br from-[var(--color-clay-purple)] to-[var(--color-clay-blue)] text-white font-extrabold text-base shadow-[0_6px_20px_rgba(167,139,250,0.45)] hover:-translate-y-1 hover:shadow-[0_12px_30px_rgba(167,139,250,0.55)] transition-all"
            >
              🔧 找現有工具
            </Link>
            <a
              href="mailto:jasonlin@simhope.com.tw?subject=AI工具需求"
              className="px-8 py-4 rounded-full bg-white dark:bg-gray-700 text-[var(--color-text-dark)] dark:text-gray-100 font-extrabold text-base border-2 border-[#1e1b4b]/15 dark:border-white/10 shadow-sm hover:-translate-y-1 hover:shadow-md transition-all"
            >
              💬 提需求給我
            </a>
          </div>
          <p className="text-xs text-[var(--color-text-mid)] opacity-70">
            需求會由經企室評估，不保證每項都能實現，但每條都會看!
          </p>
        </div>
      </section>
    </div>
  );
}
