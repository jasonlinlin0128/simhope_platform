import Link from "next/link";

export const metadata = { title: "新手上路 · SimHope Hub" };

const SECTIONS = [
  { id: "web", emoji: "🌐", title: "① 我只想用工具（網頁，免安裝）" },
  { id: "ai", emoji: "🧩", title: "② 把工具裝進我的 AI（Claude / Cursor）" },
  { id: "api", emoji: "🔌", title: "③ 我要用程式串接（API）" },
];

export default function DocsPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 md:px-0 py-10">
      <header className="text-center mb-10">
        <h1 className="text-4xl md:text-5xl font-black text-[var(--color-text-dark)] mb-3">
          新手上路
        </h1>
        <p className="text-[var(--color-text-mid)] font-semibold">
          這頁教你「怎麼開始用這個
          Hub」。想看單一工具怎麼裝，請直接點該工具進詳情頁。
        </p>
      </header>

      {/* 分流器 */}
      <div className="bg-[var(--color-clay-purple)]/5 border border-[var(--color-clay-purple)]/20 rounded-2xl p-5 mb-10">
        <p className="font-extrabold text-[var(--color-text-dark)] mb-3">
          不知道從哪開始？看你是哪種人：
        </p>
        <div className="flex flex-col sm:flex-row gap-3 text-sm font-bold">
          <a
            href="#web"
            className="flex-1 rounded-xl bg-[var(--color-card-bg)] border border-[var(--color-card-border)] p-3 hover:border-[var(--color-clay-purple)] transition"
          >
            只想用做好的工具 →{" "}
            <span className="text-[var(--color-clay-purple)]">① 多數同仁</span>
          </a>
          <a
            href="#ai"
            className="flex-1 rounded-xl bg-[var(--color-card-bg)] border border-[var(--color-card-border)] p-3 hover:border-[var(--color-clay-purple)] transition"
          >
            會用 Claude Code / Cursor →{" "}
            <span className="text-[var(--color-clay-purple)]">②</span>
          </a>
          <a
            href="#api"
            className="flex-1 rounded-xl bg-[var(--color-card-bg)] border border-[var(--color-card-border)] p-3 hover:border-[var(--color-clay-purple)] transition"
          >
            要寫程式串接 →{" "}
            <span className="text-[var(--color-clay-purple)]">③</span>
          </a>
        </div>
      </div>

      {/* 錨點導覽（sticky） */}
      <nav className="sticky top-20 z-10 flex flex-wrap gap-2 justify-center mb-8 py-2 bg-[var(--color-bg)]/80 backdrop-blur-sm">
        {SECTIONS.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className="text-xs font-extrabold px-3 py-1.5 rounded-full bg-[var(--color-card-bg)] border border-[var(--color-card-border)] hover:border-[var(--color-clay-purple)] transition"
          >
            {s.emoji} {s.title.replace(/（.*$/, "")}
          </a>
        ))}
      </nav>

      {/* ① 網頁工具 */}
      <section id="web" className="scroll-mt-32 mb-12">
        <h2 className="text-2xl font-black text-[var(--color-text-dark)] mb-4">
          🌐 ① 我只想用工具（網頁，免安裝）
        </h2>
        <ol className="flex flex-col gap-3 text-[var(--color-text-mid)] font-semibold">
          <li>
            <strong>登入</strong>：用公司 Google 帳號一鍵登入，或用 Face ID /
            指紋（passkey）。
          </li>
          <li>
            到{" "}
            <Link
              href="/hub"
              className="text-[var(--color-clay-purple)] font-bold underline"
            >
              資源中心
            </Link>
            ，用分類 tab 或搜尋找工具。
          </li>
          <li>點工具卡上的「🌐 馬上打開」即可使用，免安裝。</li>
        </ol>
        <p className="text-sm text-[var(--color-text-mid)] mt-3">
          手機 / 內網能不能用、登不進去？ → 看{" "}
          <Link
            href="/faq"
            className="text-[var(--color-clay-purple)] underline"
          >
            常見問題
          </Link>
          。
        </p>
      </section>

      {/* ② MCP / Skill */}
      <section id="ai" className="scroll-mt-32 mb-12">
        <h2 className="text-2xl font-black text-[var(--color-text-dark)] mb-4">
          🧩 ② 把工具裝進我的 AI（Claude Code / Cursor）
        </h2>
        <p className="text-[var(--color-text-mid)] font-semibold mb-3">
          <strong>前置</strong>：先安裝 Claude Desktop 或 Claude Code / Cursor。
        </p>
        <ol className="flex flex-col gap-3 text-[var(--color-text-mid)] font-semibold">
          <li>到該工具的詳情頁（MCP / Skill 類別）。</li>
          <li>
            <strong>MCP</strong>：複製詳情頁「🚀 快速安裝」的設定（config
            snippet）貼進你的 Claude / Cursor 設定。
            <br />
            <strong>Skill</strong>：下載{" "}
            <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">
              .zip
            </code>
            ，解壓到{" "}
            <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">
              ~/.claude/skills/
            </code>
            。
          </li>
          <li>
            <strong>重啟</strong> Claude，輸入相關指令即可確認生效。
          </li>
        </ol>
      </section>

      {/* ③ API（誠實占位） */}
      <section id="api" className="scroll-mt-32 mb-12">
        <h2 className="text-2xl font-black text-[var(--color-text-dark)] mb-4">
          🔌 ③ 我要用程式串接（API）
        </h2>
        <div className="bg-[var(--color-card-bg)] border border-[var(--color-card-border)] rounded-2xl p-5 text-[var(--color-text-mid)] font-semibold">
          <p>
            目前 API 串接採<strong>個案處理</strong>
            （尚無公開金鑰申請流程）。需要程式串接？請從{" "}
            <Link
              href="/access"
              className="text-[var(--color-clay-purple)] underline"
            >
              取用說明
            </Link>{" "}
            的「提需求」聯絡窗口，我們依需求個別開通。
          </p>
          <p className="mt-2 text-sm">
            已上架的 API / 連接器類工具可在{" "}
            <Link
              href="/hub?cat=mcp"
              className="text-[var(--color-clay-purple)] underline"
            >
              資源中心 → MCP
            </Link>{" "}
            找到。
          </p>
        </div>
      </section>

      {/* 共通收尾 */}
      <section className="border-t border-[var(--color-card-border)] pt-8 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm font-bold">
        <Link
          href="/access"
          className="rounded-xl bg-[var(--color-card-bg)] border border-[var(--color-card-border)] p-4 hover:border-[var(--color-clay-purple)] transition"
        >
          🔑 沒有權限 / 想上架？ → 取用說明
        </Link>
        <Link
          href="/dashboard"
          className="rounded-xl bg-[var(--color-card-bg)] border border-[var(--color-card-border)] p-4 hover:border-[var(--color-clay-purple)] transition"
        >
          📤 我要提需求 / 上架工具 → 開發者儀表板
        </Link>
        <Link
          href="/faq"
          className="rounded-xl bg-[var(--color-card-bg)] border border-[var(--color-card-border)] p-4 hover:border-[var(--color-clay-purple)] transition"
        >
          ❓ 其他問題 → 常見問題
        </Link>
        <a
          href="mailto:jasonlin@simhope.com.tw?subject=Hub 使用問題"
          className="rounded-xl bg-[var(--color-card-bg)] border border-[var(--color-card-border)] p-4 hover:border-[var(--color-clay-purple)] transition"
        >
          📩 卡關了 → 聯絡窗口
        </a>
      </section>
    </div>
  );
}
