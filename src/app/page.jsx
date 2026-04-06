'use client';

import { useState, useEffect, useMemo } from 'react';
import { getApprovedTools } from '@/lib/db';
import ToolCard from '@/components/ToolCard';
import Link from 'next/link';

export default function Home() {
  const [tools, setTools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedScenarios, setSelectedScenarios] = useState([]);

  useEffect(() => {
    getApprovedTools()
      .then(data => setTools(data))
      .catch(err => console.error('Failed to load tools:', err))
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

  // Filtering: empty selection or '全部' selected → show all
  const filteredTools = useMemo(() => {
    if (selectedScenarios.length === 0 || selectedScenarios.includes('全部')) return tools;
    return tools.filter(t => t.scenarios?.some(s => selectedScenarios.includes(s)));
  }, [tools, selectedScenarios]);

  const toggleScenario = (scenario) => {
    if (scenario === '全部') {
      setSelectedScenarios([]);
      return;
    }
    setSelectedScenarios(prev =>
      prev.includes(scenario) ? prev.filter(s => s !== scenario) : [...prev, scenario]
    );
  };

  const isAllSelected = selectedScenarios.length === 0;

  return (
    <div className="flex flex-col gap-16 px-4 md:px-0">

      {/* ── HERO ── */}
      <section className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-purple-50 via-blue-50 to-orange-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 px-8 py-14 md:px-16 md:py-20">
        <div className="relative z-10 max-w-2xl">
          <div className="inline-block bg-gradient-to-r from-violet-400 to-blue-400 text-white text-xs font-bold px-4 py-1.5 rounded-full mb-5 shadow-sm">
            ✨ SimHope AI 工具中心
          </div>
          <h1 className="text-4xl md:text-5xl font-black text-[#1e1b4b] dark:text-gray-100 leading-tight mb-4">
            讓每一位同仁<br />
            都有{' '}
            <span className="bg-gradient-to-r from-violet-400 to-blue-400 bg-clip-text text-transparent">
              AI 助力
            </span>
          </h1>
          <p className="text-gray-500 dark:text-gray-400 text-base md:text-lg leading-relaxed mb-8 font-medium">
            精選實用 AI 工具，幫助 SimHope 同仁在日常工作中提升效率、節省時間。
          </p>
          <div className="flex gap-3 flex-wrap">
            <Link
              href="#tools"
              className="px-7 py-3 rounded-full bg-[#1e1b4b] dark:bg-gray-100 text-white dark:text-[#1e1b4b] font-extrabold text-sm hover:-translate-y-0.5 hover:shadow-lg transition-all"
            >
              🔍 探索工具
            </Link>
            <Link
              href="#about"
              className="px-7 py-3 rounded-full border-2 border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-extrabold text-sm hover:-translate-y-0.5 hover:shadow-md transition-all"
            >
              了解更多
            </Link>
          </div>
        </div>
      </section>

      {/* ── STATS ── */}
      <section className="grid grid-cols-3 gap-4 md:gap-6">
        <div className="rounded-2xl bg-gradient-to-br from-violet-400 to-indigo-500 p-6 text-white text-center shadow-md">
          <div className="text-3xl md:text-4xl font-black mb-1">
            {loading ? '…' : tools.length}
          </div>
          <div className="text-xs md:text-sm font-semibold opacity-90">🛠️ 精選 AI 工具</div>
        </div>
        <div className="rounded-2xl bg-gradient-to-br from-blue-400 to-emerald-400 p-6 text-white text-center shadow-md">
          <div className="text-3xl md:text-4xl font-black mb-1">30+</div>
          <div className="text-xs md:text-sm font-semibold opacity-90">👥 使用中同仁</div>
        </div>
        <div className="rounded-2xl bg-gradient-to-br from-orange-400 to-pink-400 p-6 text-white text-center shadow-md">
          <div className="text-3xl md:text-4xl font-black mb-1">10h</div>
          <div className="text-xs md:text-sm font-semibold opacity-90">⏱️ 每週平均節省</div>
        </div>
      </section>

      {/* ── TOOLS SECTION ── */}
      <section id="tools" className="scroll-mt-24 mb-20">
        <div className="mb-8">
          <div className="inline-block px-3 py-1 rounded bg-blue-100/60 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 font-bold text-sm mb-3">
            🧰 工具總覽
          </div>
          <h2 className="text-3xl md:text-4xl font-black text-[#1e1b4b] dark:text-gray-100 mb-2">
            所有現成解決方案
          </h2>
          <p className="text-gray-500 dark:text-gray-400 font-medium">
            每個工具都標示了適用場景與使用步驟，三步以內就能上手。
          </p>
        </div>

        <div className="flex flex-col lg:flex-row gap-8">
          {/* Sidebar */}
          <aside className="lg:w-56 flex-shrink-0">
            <div className="sticky top-24 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl p-4">
              <h3 className="text-xs font-extrabold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">
                適用場景
              </h3>
              <div className="flex flex-col gap-2 text-sm text-gray-600 dark:text-gray-300">
                {/* All */}
                <label className="flex items-center gap-2.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 px-2 py-1 -mx-2 rounded transition-colors">
                  <input
                    type="checkbox"
                    checked={isAllSelected}
                    onChange={() => toggleScenario('全部')}
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
                  className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 w-full text-left text-xs text-violet-500 font-bold hover:text-violet-700 transition-colors"
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
                  <div key={i} className="bg-white dark:bg-gray-800 rounded-3xl p-5 h-[200px] border border-gray-200 dark:border-gray-700 animate-pulse">
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
                  <div className="col-span-full py-20 text-center text-gray-500 dark:text-gray-400 font-bold bg-white dark:bg-gray-800 rounded-3xl border border-dashed border-gray-300 dark:border-gray-600">
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
