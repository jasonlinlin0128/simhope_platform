import Link from "next/link";
import RequestButton from "@/components/RequestButton";

/** 全站 footer — 品牌 + 三欄 + 版權。內部站，無外部社群連結。 */
export default function Footer() {
  return (
    <footer className="mt-24 border-t border-[var(--color-nav-border)] bg-[var(--color-nav-bg)]">
      <div className="max-w-7xl mx-auto px-6 py-12 grid grid-cols-1 md:grid-cols-4 gap-8">
        <div className="md:col-span-1">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-400 to-blue-400 flex items-center justify-center text-lg">
              🏭
            </div>
            <span className="font-black text-[var(--color-text-dark)]">
              SimHope Hub
            </span>
          </div>
          <p className="text-sm text-[var(--color-text-mid)] font-semibold leading-relaxed">
            公司內部 AI 資源中心 · 工具 / 平臺 / 專案 / MCP / Skill
          </p>
          <p className="text-xs text-[var(--color-text-mid)] font-semibold mt-1">
            經企室建置維運
          </p>
        </div>
        <div>
          <div className="text-xs font-extrabold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">
            資源
          </div>
          <ul className="flex flex-col gap-2 text-sm font-bold text-[var(--color-text-mid)]">
            <li>
              <Link
                href="/hub"
                className="hover:text-[var(--color-clay-purple)]"
              >
                資源中心
              </Link>
            </li>
            <li>
              <Link
                href="/#painpoints"
                className="hover:text-[var(--color-clay-purple)]"
              >
                痛點解法
              </Link>
            </li>
            <li>
              <Link
                href="/#feedback"
                className="hover:text-[var(--color-clay-purple)]"
              >
                同仁回饋
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <div className="text-xs font-extrabold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">
            開發者
          </div>
          <ul className="flex flex-col gap-2 text-sm font-bold text-[var(--color-text-mid)]">
            <li>
              <Link
                href="/dashboard"
                className="hover:text-[var(--color-clay-purple)]"
              >
                上架工具
              </Link>
            </li>
            <li>
              <RequestButton className="hover:text-[var(--color-clay-purple)] cursor-pointer">
                提需求
              </RequestButton>
            </li>
          </ul>
        </div>
        <div>
          <div className="text-xs font-extrabold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">
            說明
          </div>
          <ul className="flex flex-col gap-2 text-sm font-bold text-[var(--color-text-mid)]">
            <li>
              <Link
                href="/docs"
                className="hover:text-[var(--color-clay-purple)]"
              >
                新手上路
              </Link>
            </li>
            <li>
              <Link
                href="/faq"
                className="hover:text-[var(--color-clay-purple)]"
              >
                常見問題
              </Link>
            </li>
            <li>
              <Link
                href="/changelog"
                className="hover:text-[var(--color-clay-purple)]"
              >
                更新日誌
              </Link>
            </li>
            <li>
              <Link
                href="/access"
                className="hover:text-[var(--color-clay-purple)]"
              >
                取用說明
              </Link>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-[var(--color-nav-border)] py-5 text-center text-xs text-[var(--color-text-mid)] font-semibold">
        © 2026 SimHope · 內部使用，未經授權禁止外部散佈 · v0.8
      </div>
    </footer>
  );
}
