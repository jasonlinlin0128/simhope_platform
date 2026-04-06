'use client';

import { useState, useEffect, useMemo } from 'react';
import { getApprovedTools, getApprovedPainCards } from '@/lib/db';
import ToolCard from '@/components/ToolCard';
import PainCard from '@/components/PainCard';
import Link from 'next/link';

const PAIN_CHIPS = [
  { emoji: '📄', text: '文件找半天' },
  { emoji: '🌏', text: '語言溝通卡關' },
  { emoji: '📊', text: '報表要手動填' },
  { emoji: '🔍', text: 'SOP 翻了找不到' },
  { emoji: '⏰', text: '工時統計耗時' },
];

export default function Home() {
  const [tools, setTools] = useState([]);
  const [painCards, setPainCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedScenarios, setSelectedScenarios] = useState([]);

  useEffect(() => {
    Promise.all([getApprovedTools(), getApprovedPainCards()])
      .then(([toolsData, painsData]) => {
        setTools(toolsData);
        setPainCards(painsData);
      })
      .catch(err => console.error('Failed to load:', err))
      .finally(() => setLoading(false));
  }, []);

  // Aggregate all unique scenario tags from tools
  const allScenarios = useMemo(() => {
    const set = new Set();
    tools.forEach(t => {
      if (Array.isArray(t.scenarios)) t.scenarios.forEach(s => set.add(s));
    });
    return Array.from(set).sort();
  }, [tools]);

  // Filtering: empty selection → show all
  const filteredTools = useMemo(() => {
    if (selectedScenarios.length === 0) return tools;
    return tools.filter(t => t.scenarios?.some(s => selectedScenarios.includes(s)));
  }, [tools, selectedScenarios]);

  const toggleScenario = (scenario) => {
    setSelectedScenarios(prev =>
      prev.includes(scenario) ? prev.filter(s => s !== scenario) : [...prev, scenario]
    );
  };

  // Group pain cards by folder
  const folderGroups = useMemo(() => {
    const groups = {};
    painCards.forEach(c => {
      const folder = c.folder || '未分類專案';
      if (!groups[folder]) groups[folder] = [];
      groups[folder].push(c);
    });
    return groups;
  }, [painCards]);

  return (
    <div className="flex flex-col gap-24 px-4 md:px-0">

      {/* ── HERO ── */}
      <section className="text-center pt-10 pb-4 flex flex-col items-center">
        {/* Eyebrow badge */}
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[var(--color-clay-purple)]/10 text-[var(--color-clay-purple)] font-extrabold text-sm mb-6 border border-[var(--color-clay-purple)]/20 shadow-sm">
          🏭 專為公司同仁設計的 AI 工具中心
        </div>

        {/* H1 */}
        <h1 className="text-5xl md:text-7xl font-black text-[var(--color-text-dark)] leading-tight mb-8">
          日常痛點太多？<br />
          這裡有<span className="bg-gradient-to-br from-[var(--color-clay-coral)] to-[var(--color-clay-orange)] bg-clip-text text-transparent">
            現成的 AI 解法
          </span>
        </h1>

        {/* Pain chips */}
        <div className="flex flex-wrap justify-center gap-2 mb-8 max-w-2xl mx-auto">
          {PAIN_CHIPS.map((chip, idx) => (
            <span key={idx} className="flex items-center gap-1.5 bg-white/85 dark:bg-gray-800/85 border-2 border-black/7 dark:border-white/10 backdrop-blur-sm rounded-full px-4 py-2 text-sm font-bold text-[var(--color-text-dark)] dark:text-gray-200 shadow-sm cursor-default hover:border-[var(--color-clay-purple)]/30 hover:shadow-md transition-all">
              <span>{chip.emoji}</span> {chip.text}
            </span>
          ))}
        </div>

        {/* Hero desc */}
        <p className="text-lg md:text-xl text-[var(--color-text-mid)] font-semibold mb-10 max-w-2xl mx-auto leading-relaxed">
          這些工具都是根據公司實際流程開發的，不需要懂 AI，打開就能用。<br />
          目前收錄 <strong className="text-[var(--color-text-dark)]">
            {loading ? '…' : tools.length} 個工具
          </strong>，持續新增中。
        </p>

        {/* CTAs */}
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

        {/* Stat cards (glass) */}
        <div className="flex flex-wrap gap-5 justify-center">
          {[
            { id: 'tools', value: loading ? '…' : tools.length, label: '可用工具' },
            { id: 'users', value: '30+', label: '同仁每週使用' },
            { id: 'hrs',   value: '10h', label: '估計每週省下' },
          ].map((s, i) => (
            <div
              key={s.id}
              className="bg-white/85 dark:bg-gray-800/85 border-2 border-white/90 dark:border-white/10 backdrop-blur-sm rounded-2xl px-7 py-5 text-center shadow-[var(--shadow-clay)]"
              style={{ animationDelay: `${i * 0.8}s` }}
            >
              <div className="text-3xl font-black text-[var(--color-text-dark)]">{s.value}</div>
              <div className="text-sm font-semibold text-[var(--color-text-mid)] mt-1">{s.label}</div>
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
          <h2 className="text-3xl md:text-4xl font-black text-[var(--color-text-dark)] mb-4">這些問題，你每週遇到幾次？</h2>
          <p className="text-[var(--color-text-mid)] font-semibold">每個工具的出發點都是一個真實的工作痛點，不是為了用 AI 而用 AI。</p>
        </div>

        {loading ? (
          <div className="text-center py-10 text-gray-400">載入中...</div>
        ) : (
          <div className="flex flex-col gap-10">
            {Object.entries(folderGroups).sort().map(([folder, cards]) => (
              <div key={folder}>
                <h3 className="text-lg font-extrabold text-[var(--color-text-dark)] border-b-2 border-gray-200 dark:border-gray-700 pb-2 mb-5 flex items-center">
                  📁 {folder} <span className="text-sm text-gray-500 ml-2">({cards.length})</span>
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {cards.map(c => <PainCard key={c.id} card={c} />)}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── TOOLS ── */}
      <section id="tools" className="scroll-mt-32 mb-20">
        <div className="mb-10 text-center">
          <div className="inline-block px-3 py-1 rounded bg-blue-100/50 dark:bg-blue-900/20 text-[var(--color-clay-blue)] font-bold text-sm mb-4">
            🧰 工具總覽
          </div>
          <h2 className="text-3xl md:text-4xl font-black text-[var(--color-text-dark)] mb-4">所有現成解決方案</h2>
          <p className="text-[var(--color-text-mid)] font-semibold">每個工具都標示了適用場景與使用步驟，三步以內就能上手。</p>
        </div>

        <div className="flex flex-col lg:flex-row gap-8">
          {/* Sidebar — scenarios filter */}
          <aside className="lg:w-56 flex-shrink-0">
            <div className="sticky top-24 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl p-4">
              <h3 className="text-xs font-extrabold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">
                適用場景
              </h3>
              <div className="flex flex-col gap-1 text-sm text-gray-600 dark:text-gray-300">
                <label className="flex items-center gap-2.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 px-2 py-1 -mx-2 rounded transition-colors">
                  <input
                    type="checkbox"
                    checked={selectedScenarios.length === 0}
                    onChange={() => setSelectedScenarios([])}
                    className="accent-violet-500"
                  />
                  <span className="font-semibold">全部</span>
                  <span className="ml-auto text-xs text-gray-400">{tools.length}</span>
                </label>
                {allScenarios.map(scenario => (
                  <label key={scenario} className="flex items-center gap-2.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 px-2 py-1 -mx-2 rounded transition-colors">
                    <input
                      type="checkbox"
                      checked={selectedScenarios.includes(scenario)}
                      onChange={() => toggleScenario(scenario)}
                      className="accent-violet-500"
                    />
                    <span>{scenario}</span>
                    <span className="ml-auto text-xs text-gray-400">
                      {tools.filter(t => t.scenarios?.includes(scenario)).length}
                    </span>
                  </label>
                ))}
              </div>
              {selectedScenarios.length > 0 && (
                <button
                  onClick={() => setSelectedScenarios([])}
                  className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 w-full text-left text-xs text-violet-500 font-bold hover:text-violet-700 dark:hover:text-violet-400 transition-colors"
                >
                  清除篩選
                </button>
              )}
            </div>
          </aside>

          {/* Tool grid */}
          <div className="flex-1">
            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 opacity-60">
                {[1, 2, 3, 4, 5, 6].map(i => (
                  <div key={i} className="bg-white dark:bg-gray-800 rounded-[24px] p-5 h-[200px] border border-gray-200 dark:border-gray-700 animate-pulse">
                    <div className="w-14 h-14 bg-gray-200 dark:bg-gray-600 rounded-2xl mb-4" />
                    <div className="w-3/4 h-5 bg-gray-200 dark:bg-gray-600 rounded-lg mb-2" />
                    <div className="w-1/2 h-5 bg-gray-200 dark:bg-gray-600 rounded-lg" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {filteredTools.map(t => <ToolCard key={t.id} tool={t} />)}
                {filteredTools.length === 0 && (
                  <div className="col-span-full py-20 text-center text-gray-500 dark:text-gray-400 font-bold bg-white dark:bg-gray-800 rounded-[24px] border border-dashed border-gray-300 dark:border-gray-600">
                    這個場景下目前沒有任何工具 🙌
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
