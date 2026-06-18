import {
  getServerCatalog,
  getServerPainCards,
  getServerMetrics,
  getServerToolViews,
  getServerToolHelpful,
} from "@/lib/serverCatalog";
import { rankPopularTools } from "@/lib/popularTools.mjs";
import { attachHelpfulCounts } from "@/lib/helpfulBadge.mjs";
import { categoryCounts, CATEGORIES, CATEGORY_ORDER } from "@/lib/taxonomy";
import CategoryEntryCard from "@/components/CategoryEntryCard";
import MetricsBand from "@/components/MetricsBand";
import PainPointsExplorer from "@/components/PainPointsExplorer";
import ToolCard from "@/components/ToolCard";
import Link from "next/link";
import RequestButton from "@/components/RequestButton";

export const revalidate = 300; // ISR 5 分鐘

const TESTIMONIALS = [
  {
    color: "var(--color-clay-purple)",
    stars: 5,
    quote:
      "以前跟泰籍同事講射料頭、鵝頸這些術語，翻譯軟體都翻不準，現在手機開連結直接用，師傅自己就操作，溝通順太多。",
    name: "壓鑄產線領班",
    dept: "生產現場",
    tool: "現場即時翻譯",
  },
  {
    color: "var(--color-clay-blue)",
    stars: 5,
    quote:
      "以前每天填報要 15 分鐘、月底還要人工彙整 Excel，現在 10 分鐘填完、月報自動產，我每天可以準時下班。",
    name: "加工部同仁",
    dept: "日報表",
    tool: "加工部日報表",
  },
  {
    color: "var(--color-clay-orange)",
    stars: 4,
    quote:
      "新進來查檢驗標準不用一直問老師傅了，手機直接看 SOP，主管審核後的版本一定準，照著做就對了。",
    name: "品保部新進",
    dept: "品保 / SOP",
    tool: "SOP-Interface APP",
  },
  {
    color: "var(--color-clay-coral)",
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

export default async function Home() {
  const [tools, painCards, metrics, toolViews, toolHelpful] = await Promise.all(
    [
      getServerCatalog(),
      getServerPainCards(),
      getServerMetrics(),
      getServerToolViews(),
      getServerToolHelpful(),
    ],
  );
  const counts = categoryCounts(tools);
  const activeCount = counts.all;
  const popular = attachHelpfulCounts(
    rankPopularTools(tools, toolViews),
    toolHelpful,
  );

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
            {activeCount} 個資源
          </strong>
          ，持續新增中。
        </p>

        <div className="flex gap-4 flex-wrap justify-center mb-16">
          <Link
            href="#catalog"
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

        <MetricsBand
          stats={[
            { value: activeCount, label: "可用資源" },
            { value: metrics.toolOpen.toLocaleString(), label: "累計工具開啟" },
            { value: painCards.length, label: "痛點解法" },
          ]}
        />
      </section>

      {/* ── 🔥 熱門工具 ── */}
      {popular.length > 0 && (
        <section id="popular" className="scroll-mt-32">
          <div className="mb-8 text-center">
            <h2 className="text-3xl md:text-4xl font-black text-[var(--color-text-dark)] mb-3">
              🔥 熱門工具
            </h2>
            <p className="text-[var(--color-text-mid)] font-semibold">
              同仁最常看的資源
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {popular.map((t) => (
              <ToolCard key={t.id} tool={t} />
            ))}
          </div>
        </section>
      )}

      {/* ── 5 類別入口 ── */}
      <section id="catalog" className="scroll-mt-32">
        <div className="mb-8 text-center">
          <h2 className="text-3xl md:text-4xl font-black text-[var(--color-text-dark)] mb-3">
            探索資源
          </h2>
          <p className="text-[var(--color-text-mid)] font-semibold">
            依類別瀏覽，或到
            <Link
              href="/hub"
              className="text-[var(--color-clay-purple)] font-bold underline mx-1"
            >
              資源中心
            </Link>
            搜尋全部。
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {CATEGORY_ORDER.map((k) => (
            <CategoryEntryCard
              key={k}
              category={CATEGORIES[k]}
              count={counts[k]}
            />
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

        <PainPointsExplorer painCards={painCards} />
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
              href="/hub"
              className="px-8 py-4 rounded-full bg-gradient-to-br from-[var(--color-clay-purple)] to-[var(--color-clay-blue)] text-white font-extrabold text-base shadow-[0_6px_20px_rgba(167,139,250,0.45)] hover:-translate-y-1 hover:shadow-[0_12px_30px_rgba(167,139,250,0.55)] transition-all"
            >
              🔧 找現有工具
            </Link>
            <RequestButton className="px-8 py-4 rounded-full bg-white dark:bg-gray-700 text-[var(--color-text-dark)] dark:text-gray-100 font-extrabold text-base border-2 border-[#1e1b4b]/15 dark:border-white/10 shadow-sm hover:-translate-y-1 hover:shadow-md transition-all cursor-pointer">
              💬 提需求給我
            </RequestButton>
          </div>
          <p className="text-xs text-[var(--color-text-mid)] opacity-70">
            需求會由經企室評估，不保證每項都能實現，但每條都會看!
          </p>
        </div>
      </section>
    </div>
  );
}
