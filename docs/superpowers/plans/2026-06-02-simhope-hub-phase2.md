# SimHope Hub Phase 2 (支援頁) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Phase 1 多頁式資源中心之上，新增四個支援頁 —— `/docs`（新手上路）、`/faq`（常見問題，兩層 + 可後台編）、`/changelog`（平台更新日誌時間軸）、`/access`（權限分級 + 申請/提需求表單，Discord 通知）。

**Architecture:** 沿用 Next.js 16 App Router + Firebase + Tailwind 4。新增共用 `Accordion` 元件（`/faq` 與工具 `faq` block 共用）；`/docs` 靜態 in-repo；`/changelog` 由 server component 讀 `CHANGELOG.md` → 純函式 parser → client 時間軸；`/faq` 用新 `faqs` collection（admin 後台 CRUD）；`/access` 顯示角色分級 + `RequestModal` 表單 → `/api/request`（Admin SDK 驗 token + 寫 `requests` + Discord `notify()`）。

**Tech Stack:** Next.js 16.2 / React 19 / Firebase 12（Firestore + Admin SDK）/ Tailwind 4 / react-markdown + remark-gfm / Discord webhook。

**Spec:** `docs/superpowers/specs/2026-06-02-simhope-hub-phase2-design.md`（commit `f938158`）。

---

## 驗證取向（重要 — 同 Phase 1）

本專案**無測試框架**（package.json 只有 dev/build/lint/start）。沿用 Phase 1 慣例的 gate：

1. `npm run build` 通過（type/import/語法/Next 16 build 規則會在此擋下）；
2. `npm run dev` 後在瀏覽器**實測指定畫面**（每個 task 有檢查點）；
3. 純邏輯（changelog parser）附獨立 `node` 斷言檔（`scripts/__verify-*.mjs`），可直接 `node` 跑、無需框架。

**不引入 Jest/RTL**（屬另一範圍）。**RWD（守則 2）**：每個有 UI 的 task 都要在 dev 用瀏覽器縮到手機寬度檢查一次。

**Branch：** 已在 `feature-hub-phase2`（從合併後 main 開）。**不在 main 直接 commit 實作。**

**全域守則（spec §0.5）：** 新手+專業用詞；RWD/UIUX；不為佔位硬做（`/docs` ③ 誠實占位、LINE 後補）；最大化複用既有；改 firestore.rules 須 **Console 手動發布**。

**Commit trailer（每個 commit 都要）：**

```
Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>
```

---

## 檔案結構（Phase 2 動到的檔案）

**新增：**

- `src/components/Accordion.jsx` — 共用 accordion（Q&A，markdown 答案）
- `app/docs/page.jsx` — 新手上路（靜態 + anchor nav）
- `src/lib/changelog.js` — `CHANGELOG.md` parser（純函式）
- `scripts/__verify-changelog-parse.mjs` — parser 斷言（暫時，可留可刪）
- `src/components/ChangelogTimeline.jsx` — client 時間軸（收合技術段）
- `app/changelog/page.jsx` — server component，讀檔 + parse + 渲染
- `src/lib/faq.js` — `FAQ_CATEGORIES` 常數
- `app/faq/page.jsx` — FAQ 頁（分類分組 + chip 跳轉 + Accordion）
- `src/components/FaqManager.jsx` — admin FAQ CRUD
- `src/lib/notify.js` — `notify()`（Discord webhook，server-only，可抽換）
- `app/api/request/route.js` — 驗 token + 寫 `requests` + 通知
- `src/components/RequestModal.jsx` — 共用申請/提需求表單（client）
- `src/components/RequestButton.jsx` — client 觸發鈕（讓 server 元件可嵌）
- `app/access/page.jsx` — 權限分級 + 申請 CTA

**修改：**

- `src/lib/db.js` — 加 `getFaqs()`
- `firestore.rules` — 加 `faqs` / `requests` 規則
- `app/tool/[id]/page.jsx` — 加 `faq` block（`BLOCK_DEFS` + `BlockEditor` + `BlockView` + `addBlock`）
- `src/components/Navbar.jsx` — 加 文件/FAQ/更新日誌 連結
- `src/components/Footer.jsx` — 補支援頁連結 + 「提需求」改 `RequestButton`

**依賴順序：** 1 Accordion → 2 /docs → 3 parser → 4 /changelog → 5 rules → 6 faq.js+db → 7 /faq → 8 admin FAQ → 9 faq block → 10 notify+api → 11 RequestModal → 12 /access → 13 chrome → 14 整合。

---

## Task 1: Accordion 共用元件

**Files:**

- Create: `src/components/Accordion.jsx`

`/faq` 頁與工具 `faq` block 共用同一顆。輸入 `items: [{ q, a }]`（`q`=純文字、`a`=markdown）。

- [ ] **Step 1: 建立 `src/components/Accordion.jsx`**

```jsx
"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * 共用 accordion — /faq 頁與工具詳情頁的 faq block 都用這顆。
 * @param {{ items: {q: string, a: string}[] }} props  a 支援 markdown
 */
export default function Accordion({ items = [] }) {
  const [openIdx, setOpenIdx] = useState(null);
  if (!items.length) return null;
  return (
    <div className="flex flex-col gap-2">
      {items.map((item, i) => {
        const open = openIdx === i;
        return (
          <div
            key={i}
            className="border border-[var(--color-card-border)] rounded-2xl bg-[var(--color-card-bg)] overflow-hidden"
          >
            <button
              onClick={() => setOpenIdx(open ? null : i)}
              className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left font-extrabold text-[var(--color-text-dark)] hover:bg-[var(--color-clay-purple)]/5 transition-colors"
              aria-expanded={open}
            >
              <span>{item.q}</span>
              <span
                className={`flex-shrink-0 text-[var(--color-clay-purple)] transition-transform ${open ? "rotate-90" : ""}`}
              >
                ▸
              </span>
            </button>
            {open && (
              <div className="px-5 pb-5 pt-1 text-sm text-[var(--color-text-mid)] leading-relaxed border-t border-[var(--color-card-border)] [&_a]:text-[var(--color-clay-blue)] [&_a]:underline [&_ul]:list-disc [&_ul]:ml-5 [&_ol]:list-decimal [&_ol]:ml-5 [&_code]:bg-gray-100 dark:[&_code]:bg-gray-700 [&_code]:px-1 [&_code]:rounded">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {item.a || ""}
                </ReactMarkdown>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: build**

Run: `npm run build`
Expected: 成功（Accordion 尚未被 import，僅驗證語法）。

- [ ] **Step 3: Commit**

```bash
git add src/components/Accordion.jsx
git commit -m "feat(faq): 加共用 Accordion 元件（/faq 與工具 faq block 共用）

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

## Task 2: `/docs` 新手上路頁（靜態 + 錨點）

**Files:**

- Create: `app/docs/page.jsx`

版型 B（垂直分段 + 頂部錨點）。內容靜態 in-repo。3 路徑 + 分流器 + 共通收尾。**用詞守則**：白話 + 括號專業詞。

- [ ] **Step 1: 建立 `app/docs/page.jsx`**

```jsx
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
```

- [ ] **Step 2: build**

Run: `npm run build`
Expected: 成功。

- [ ] **Step 3: 視覺實測（含 RWD）**

`npm run dev` → `http://localhost:3000/docs`：分流器三鈕、錨點 sticky 可跳、三段內容正常、收尾四連結；**縮到手機寬度**確認分流器/收尾改直排不爆版。

- [ ] **Step 4: Commit**

```bash
git add app/docs/page.jsx
git commit -m "feat(docs): 新手上路頁（3 路徑 + 分流器 + 錨點，靜態）

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

## Task 3: CHANGELOG.md parser（純函式 + node 斷言）

**Files:**

- Create: `src/lib/changelog.js`
- Create: `scripts/__verify-changelog-parse.mjs`

把 Keep-a-Changelog 格式切成結構。使用者段＝`新增`/`變動`/`移除`；其餘（`內部`/`安全`/`文件`/`後續`…）為技術段。

- [ ] **Step 1: 先寫斷言 `scripts/__verify-changelog-parse.mjs`**

```js
// scripts/__verify-changelog-parse.mjs — 純函式 sanity check（無框架，直接 node 跑）
import assert from "node:assert";
import { parseChangelog } from "../src/lib/changelog.js";

const SAMPLE = `# Changelog

## [0.7] — 2026-05-29

登入認證系統大改版。

### 新增

- Google 登入
- passkey

### 安全

- 修提權漏洞

## [0.6] — 2026-05-20

第二版摘要。

### 變動

- 改了 X
`;

const v = parseChangelog(SAMPLE);
assert.equal(v.length, 2, "應解析出 2 個版本");
assert.equal(v[0].version, "0.7");
assert.equal(v[0].date, "2026-05-29");
assert.ok(v[0].summary.includes("登入認證"), "summary 應含摘要");
// 使用者段 = 新增；技術段 = 安全
assert.deepEqual(
  v[0].userSections.map((s) => s.heading),
  ["新增"],
);
assert.deepEqual(
  v[0].techSections.map((s) => s.heading),
  ["安全"],
);
assert.equal(v[0].userSections[0].items.length, 2);
assert.equal(v[1].version, "0.6");
assert.deepEqual(
  v[1].userSections.map((s) => s.heading),
  ["變動"],
);
assert.equal(v[1].techSections.length, 0);

console.log("✅ changelog parse verify passed");
```

- [ ] **Step 2: 跑斷言確認失敗**

Run: `node scripts/__verify-changelog-parse.mjs`
Expected: FAIL（`parseChangelog` 尚未定義）。

- [ ] **Step 3: 實作 `src/lib/changelog.js`**

```js
// src/lib/changelog.js
// 解析 Keep-a-Changelog 格式的 CHANGELOG.md。純函式、無 I/O（讀檔在 server component 做）。

const USER_HEADINGS = ["新增", "變動", "移除"]; // 面向使用者；其餘視為技術段

/**
 * @param {string} md  CHANGELOG.md 全文
 * @returns {{version:string,date:string,summary:string,userSections:{heading:string,items:string[]}[],techSections:{heading:string,items:string[]}[]}[]}
 */
export function parseChangelog(md) {
  const lines = (md || "").split("\n");
  const versions = [];
  let cur = null;
  let curSection = null;

  const pushSection = () => {
    if (!cur || !curSection) return;
    const bucket = USER_HEADINGS.includes(curSection.heading)
      ? cur.userSections
      : cur.techSections;
    bucket.push(curSection);
    curSection = null;
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    // 版本標題：## [0.7] — 2026-05-29  （破折號可能是 — 或 -）
    const vMatch = line.match(/^##\s*\[([^\]]+)\]\s*[—\-–]\s*(.+)$/);
    if (vMatch) {
      pushSection();
      if (cur) versions.push(cur);
      cur = {
        version: vMatch[1].trim(),
        date: vMatch[2].trim(),
        summary: "",
        userSections: [],
        techSections: [],
      };
      continue;
    }
    if (!cur) continue;
    // 區段標題：### 新增
    const sMatch = line.match(/^###\s+(.+)$/);
    if (sMatch) {
      pushSection();
      curSection = { heading: sMatch[1].trim(), items: [] };
      continue;
    }
    // 條列：- xxx（只收一層；巢狀縮排併入上一條）
    const bullet = line.match(/^\s*-\s+(.+)$/);
    if (bullet && curSection) {
      curSection.items.push(bullet[1].trim());
      continue;
    }
    if (bullet && cur && !curSection) {
      // 摘要前的條列（少見）→ 併入 summary
      cur.summary += (cur.summary ? "\n" : "") + bullet[1].trim();
      continue;
    }
    // 其餘非空行、且還在「摘要區」（尚未進任何 ### section）→ 累加為 summary
    if (line && !curSection && !line.startsWith("#")) {
      cur.summary += (cur.summary ? " " : "") + line.trim();
    }
  }
  pushSection();
  if (cur) versions.push(cur);
  return versions;
}
```

- [ ] **Step 4: 跑斷言確認通過**

Run: `node scripts/__verify-changelog-parse.mjs`
Expected: `✅ changelog parse verify passed`

- [ ] **Step 5: build + Commit**

Run: `npm run build`（成功）

```bash
git add src/lib/changelog.js scripts/__verify-changelog-parse.mjs
git commit -m "feat(changelog): 加 CHANGELOG.md parser（使用者段/技術段分離）+ 斷言

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

## Task 4: `/changelog` 時間軸頁

**Files:**

- Create: `src/components/ChangelogTimeline.jsx`
- Create: `app/changelog/page.jsx`

版型 A（左側時間軸）。server component 讀 `CHANGELOG.md`、parse、傳給 client 時間軸；技術段收合。

- [ ] **Step 1: 建立 `src/components/ChangelogTimeline.jsx`**

```jsx
"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

function Section({ heading, items }) {
  return (
    <div className="mt-2">
      <p className="text-xs font-extrabold text-[var(--color-text-mid)] uppercase tracking-wider mb-1">
        {heading}
      </p>
      <ul className="list-disc ml-5 flex flex-col gap-1 text-sm text-[var(--color-text-mid)] [&_a]:text-[var(--color-clay-blue)] [&_a]:underline [&_code]:bg-gray-100 dark:[&_code]:bg-gray-700 [&_code]:px-1 [&_code]:rounded">
        {items.map((it, i) => (
          <li key={i}>
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{ p: (p) => <span {...p} /> }}
            >
              {it}
            </ReactMarkdown>
          </li>
        ))}
      </ul>
    </div>
  );
}

function VersionCard({ v }) {
  const [showTech, setShowTech] = useState(false);
  return (
    <div className="relative pl-8 pb-8">
      {/* rail dot */}
      <span className="absolute left-0 top-1.5 w-3 h-3 rounded-full bg-[var(--color-clay-purple)] ring-4 ring-[var(--color-clay-purple)]/15" />
      <div className="flex items-baseline gap-3 flex-wrap mb-1">
        <span className="font-black text-lg text-[var(--color-text-dark)]">
          v{v.version}
        </span>
        <span className="text-sm font-bold text-[var(--color-text-mid)]">
          {v.date}
        </span>
      </div>
      {v.summary && (
        <p className="text-sm text-[var(--color-text-mid)] font-semibold leading-relaxed">
          {v.summary}
        </p>
      )}
      {v.userSections.map((s) => (
        <Section key={s.heading} heading={s.heading} items={s.items} />
      ))}
      {v.techSections.length > 0 && (
        <>
          <button
            onClick={() => setShowTech((x) => !x)}
            className="mt-3 text-xs font-extrabold text-[var(--color-clay-purple)] hover:opacity-80"
          >
            {showTech ? "▾ 收起技術細節" : "▸ 技術細節"}
          </button>
          {showTech &&
            v.techSections.map((s) => (
              <Section key={s.heading} heading={s.heading} items={s.items} />
            ))}
        </>
      )}
    </div>
  );
}

/** 左側時間軸。versions 由 server component 解析後傳入。 */
export default function ChangelogTimeline({ versions }) {
  return (
    <div className="relative border-l-2 border-[var(--color-clay-purple)]/25 ml-1.5">
      {versions.map((v) => (
        <VersionCard key={v.version} v={v} />
      ))}
    </div>
  );
}
```

- [ ] **Step 2: 建立 `app/changelog/page.jsx`（server component 讀檔）**

```jsx
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseChangelog } from "@/lib/changelog";
import ChangelogTimeline from "@/components/ChangelogTimeline";

export const metadata = { title: "更新日誌 · SimHope Hub" };

export default async function ChangelogPage() {
  let versions = [];
  try {
    const md = await readFile(path.join(process.cwd(), "CHANGELOG.md"), "utf8");
    versions = parseChangelog(md);
  } catch (e) {
    console.error("讀取 CHANGELOG.md 失敗：", e);
  }
  return (
    <div className="max-w-3xl mx-auto px-4 md:px-0 py-10">
      <header className="text-center mb-10">
        <h1 className="text-4xl md:text-5xl font-black text-[var(--color-text-dark)] mb-3">
          更新日誌
        </h1>
        <p className="text-[var(--color-text-mid)] font-semibold">
          平台每個版本做了什麼。技術細節可展開。
        </p>
      </header>
      {versions.length ? (
        <ChangelogTimeline versions={versions} />
      ) : (
        <p className="text-center text-[var(--color-text-mid)]">
          目前沒有更新紀錄。
        </p>
      )}
      <p className="text-center text-xs text-[var(--color-text-mid)] mt-8">
        想看完整技術版本紀錄？看 repo 的{" "}
        <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">
          CHANGELOG.md
        </code>
        。
      </p>
    </div>
  );
}
```

- [ ] **Step 3: build**

Run: `npm run build`
Expected: 成功（server component 讀檔在 build/SSR 階段執行）。

- [ ] **Step 4: 視覺實測（含 RWD）**

`npm run dev` → `/changelog`：左側 rail + 圓點、各版本摘要 + 新增/變動 段；「▸ 技術細節」可展開出 內部/安全 段。手機寬度確認 rail 不擠爆。

- [ ] **Step 5: Commit**

```bash
git add src/components/ChangelogTimeline.jsx app/changelog/page.jsx
git commit -m "feat(changelog): 左側時間軸頁（讀 CHANGELOG.md，技術段收合）

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

## Task 5: firestore.rules — `faqs` + `requests`

**Files:**

- Modify: `firestore.rules`

`faqs`：公開讀、admin 寫。`requests`：client 不可讀寫（只 Admin SDK 寫）、admin 可讀（後台看待辦）。

- [ ] **Step 1: 加規則**

在 `match /painCards/...` 區塊之後（`match /passkeys` 之前）插入：

```
    // FAQ：公開可讀；僅 admin 可寫（前端後台 CRUD）
    match /faqs/{faqId} {
      allow read: if true;
      allow write: if isAdmin();
    }

    // 申請開發者 / 提需求：只由伺服器端 Admin SDK 寫入（/api/request）；
    // client 不可寫（防偽造 uid）；admin 可讀（後台看待辦）。
    match /requests/{reqId} {
      allow read: if isAdmin();
      allow write: if false;
    }
```

> `isAdmin()` 為既有 helper（Phase A 加的）。沿用即可。

- [ ] **Step 2: build（確認 rules 檔不影響 app build）**

Run: `npm run build`
Expected: 成功（firestore.rules 不進 build，但 commit 一致性）。

- [ ] **Step 3: ⚠️ 手動發布（部署時）**

> 依 AGENTS.md：SA 無 `firebaserules.releases.create` → **到 Firebase Console → Firestore → 規則貼上發布**。**未發布前 `faqs`/`requests` 預設 deny**，Task 7/8/10 的 runtime 會失敗。本 task 只 commit 檔案；發布是部署步驟。

- [ ] **Step 4: Commit**

```bash
git add firestore.rules
git commit -m "feat(rules): 加 faqs（admin 寫/公開讀）+ requests（僅 Admin SDK 寫/admin 讀）

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

## Task 6: `src/lib/faq.js`（分類）+ `db.js` getFaqs

**Files:**

- Create: `src/lib/faq.js`
- Modify: `src/lib/db.js`

- [ ] **Step 1: 建立 `src/lib/faq.js`**

```js
// src/lib/faq.js
// FAQ 分類（給 /faq 頁分組 + admin CRUD 選單用）。FAQ 專屬，與 hub 的 5 大 category 無關。
export const FAQ_CATEGORIES = [
  { key: "login", emoji: "🔐", label: "登入 / 帳號" },
  { key: "usage", emoji: "🧭", label: "使用工具" },
  { key: "submit", emoji: "📤", label: "提需求 / 上架" },
  { key: "security", emoji: "🛡️", label: "資料安全" },
  { key: "install", emoji: "🧠", label: "MCP / Skill 怎麼裝" },
];
export const FAQ_CATEGORY_KEYS = FAQ_CATEGORIES.map((c) => c.key);
```

- [ ] **Step 2: 在 `src/lib/db.js` 加 `getFaqs()`**

於 `getApprovedTools` 之後加（沿用既有 import 的 `collection`/`getDocs`/`db`）：

```js
/**
 * 取已發布的 FAQ，依 category 內 order 升冪。
 * @returns {Promise<object[]>}
 */
export async function getFaqs() {
  const snap = await getDocs(collection(db, "faqs"));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((f) => f.published !== false)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}
```

> 若 `db.js` 尚未 import `getDocs`/`collection`，補進現有 `firebase/firestore` import（grep `from "firebase/firestore"` 確認）。

- [ ] **Step 3: build + Commit**

Run: `npm run build`（成功）

```bash
git add src/lib/faq.js src/lib/db.js
git commit -m "feat(faq): 加 FAQ_CATEGORIES + db.getFaqs()

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

## Task 7: `/faq` 頁（分類分組 + chip 跳轉 + Accordion）

**Files:**

- Create: `app/faq/page.jsx`

版型 A。client component：`getFaqs` → 依 `FAQ_CATEGORIES` 分組 → 頂部 chip 跳轉 → 每組一個 `Accordion`。

- [ ] **Step 1: 建立 `app/faq/page.jsx`**

```jsx
"use client";

import { useState, useEffect, useMemo } from "react";
import { getFaqs } from "@/lib/db";
import { FAQ_CATEGORIES } from "@/lib/faq";
import Accordion from "@/components/Accordion";

export default function FaqPage() {
  const [faqs, setFaqs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getFaqs()
      .then(setFaqs)
      .catch((e) => console.error("載入 FAQ 失敗:", e))
      .finally(() => setLoading(false));
  }, []);

  const grouped = useMemo(() => {
    const m = {};
    for (const c of FAQ_CATEGORIES) {
      const items = faqs
        .filter((f) => f.category === c.key)
        .map((f) => ({ q: f.question, a: f.answer }));
      if (items.length) m[c.key] = items;
    }
    return m;
  }, [faqs]);

  const activeCats = FAQ_CATEGORIES.filter((c) => grouped[c.key]);

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-0 py-10">
      <header className="text-center mb-8">
        <h1 className="text-4xl md:text-5xl font-black text-[var(--color-text-dark)] mb-3">
          常見問題
        </h1>
        <p className="text-[var(--color-text-mid)] font-semibold">
          找不到答案？到取用說明的「提需求」聯絡我們。
        </p>
      </header>

      {/* 分類 chip 跳轉 */}
      {activeCats.length > 0 && (
        <nav className="sticky top-20 z-10 flex flex-wrap gap-2 justify-center mb-8 py-2 bg-[var(--color-bg)]/80 backdrop-blur-sm">
          {activeCats.map((c) => (
            <a
              key={c.key}
              href={`#${c.key}`}
              className="text-xs font-extrabold px-3 py-1.5 rounded-full bg-[var(--color-card-bg)] border border-[var(--color-card-border)] hover:border-[var(--color-clay-purple)] transition"
            >
              {c.emoji} {c.label}
            </a>
          ))}
        </nav>
      )}

      {loading ? (
        <p className="text-center py-16 text-[var(--color-text-mid)]">
          載入中…
        </p>
      ) : activeCats.length === 0 ? (
        <p className="text-center py-16 text-[var(--color-text-mid)]">
          目前還沒有常見問題。
        </p>
      ) : (
        <div className="flex flex-col gap-10">
          {activeCats.map((c) => (
            <section key={c.key} id={c.key} className="scroll-mt-32">
              <h2 className="text-xl font-black text-[var(--color-text-dark)] mb-4">
                {c.emoji} {c.label}
              </h2>
              <Accordion items={grouped[c.key]} />
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: build**

Run: `npm run build`
Expected: 成功。

- [ ] **Step 3: 視覺實測（含 RWD）**

`npm run dev` → `/faq`。**注意**：需 `faqs` 規則已發布 + 有資料才看得到內容；無資料時顯示「目前還沒有常見問題」。可先在 Firestore Console 手建 1-2 筆 `faqs`（`{question,answer,category:'login',order:0,published:true}`）驗證分組/chip 跳轉/accordion 展開 + markdown。手機寬度確認 chip 換行不爆。

- [ ] **Step 4: Commit**

```bash
git add app/faq/page.jsx
git commit -m "feat(faq): /faq 頁（分類分組 + chip 跳轉 + Accordion）

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

## Task 8: admin FAQ 管理（FaqManager + tab）

**Files:**

- Create: `src/components/FaqManager.jsx`
- Modify: `app/admin/page.jsx`

前端 CRUD（新增/編輯/排序/上下架/刪除），存 `faqs`。沿用 admin 既有 client SDK 寫法。

- [ ] **Step 1: 建立 `src/components/FaqManager.jsx`**

```jsx
"use client";

import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
} from "firebase/firestore";
import { FAQ_CATEGORIES } from "@/lib/faq";

const BLANK = {
  question: "",
  answer: "",
  category: "login",
  order: 0,
  published: true,
};

export default function FaqManager() {
  const [faqs, setFaqs] = useState([]);
  const [editing, setEditing] = useState(null); // {id?, ...fields}
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const snap = await getDocs(collection(db, "faqs"));
    setFaqs(
      snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    );
    setLoading(false);
  };
  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    if (!editing.question?.trim()) return alert("請填問題");
    const payload = {
      question: editing.question.trim(),
      answer: editing.answer || "",
      category: editing.category || "login",
      order: Number(editing.order) || 0,
      published: editing.published !== false,
    };
    try {
      if (editing.id) await updateDoc(doc(db, "faqs", editing.id), payload);
      else await addDoc(collection(db, "faqs"), payload);
      setEditing(null);
      await load();
    } catch (e) {
      alert("儲存失敗：" + (e.code || e.message));
    }
  };

  const remove = async (id) => {
    if (!confirm("確定刪除這題？")) return;
    await deleteDoc(doc(db, "faqs", id));
    await load();
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-between items-center">
        <h3 className="font-extrabold text-lg text-[var(--color-text-dark)]">
          FAQ 管理（{faqs.length}）
        </h3>
        <button
          onClick={() => setEditing({ ...BLANK })}
          className="px-4 py-2 rounded-full bg-[var(--color-clay-purple)] text-white font-bold text-sm"
        >
          ＋ 新增題目
        </button>
      </div>

      {editing && (
        <div className="bg-[var(--color-card-bg)] border-2 border-[var(--color-clay-purple)]/40 rounded-2xl p-4 flex flex-col gap-3">
          <input
            value={editing.question}
            onChange={(e) =>
              setEditing({ ...editing, question: e.target.value })
            }
            placeholder="問題"
            className="bg-gray-50 dark:bg-gray-700 p-2 rounded-lg border border-gray-200 dark:border-gray-600 text-sm font-bold"
          />
          <textarea
            value={editing.answer}
            onChange={(e) => setEditing({ ...editing, answer: e.target.value })}
            placeholder="答案（支援 markdown）"
            rows={4}
            className="bg-gray-50 dark:bg-gray-700 p-2 rounded-lg border border-gray-200 dark:border-gray-600 text-sm"
          />
          <div className="flex gap-2 flex-wrap items-center">
            <select
              value={editing.category}
              onChange={(e) =>
                setEditing({ ...editing, category: e.target.value })
              }
              className="bg-gray-50 dark:bg-gray-700 p-2 rounded-lg border border-gray-200 dark:border-gray-600 text-sm"
            >
              {FAQ_CATEGORIES.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.emoji} {c.label}
                </option>
              ))}
            </select>
            <input
              type="number"
              value={editing.order}
              onChange={(e) =>
                setEditing({ ...editing, order: e.target.value })
              }
              placeholder="排序"
              className="w-20 bg-gray-50 dark:bg-gray-700 p-2 rounded-lg border border-gray-200 dark:border-gray-600 text-sm"
            />
            <label className="flex items-center gap-1 text-sm font-bold">
              <input
                type="checkbox"
                checked={editing.published !== false}
                onChange={(e) =>
                  setEditing({ ...editing, published: e.target.checked })
                }
              />{" "}
              發布
            </label>
            <button
              onClick={save}
              className="px-4 py-2 rounded-full bg-[var(--color-clay-purple)] text-white font-bold text-sm"
            >
              儲存
            </button>
            <button
              onClick={() => setEditing(null)}
              className="px-4 py-2 rounded-full border border-gray-300 font-bold text-sm"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-[var(--color-text-mid)]">載入中…</p>
      ) : (
        <div className="flex flex-col gap-2">
          {faqs.map((f) => {
            const cat = FAQ_CATEGORIES.find((c) => c.key === f.category);
            return (
              <div
                key={f.id}
                className="flex items-center gap-3 bg-[var(--color-card-bg)] border border-[var(--color-card-border)] rounded-xl p-3"
              >
                <span className="text-xs font-bold text-[var(--color-text-mid)] w-10">
                  #{f.order ?? 0}
                </span>
                <span className="text-xs">{cat?.emoji}</span>
                <span className="flex-1 font-bold text-sm text-[var(--color-text-dark)] truncate">
                  {f.question}
                </span>
                {f.published === false && (
                  <span className="text-xs text-gray-400">（未發布）</span>
                )}
                <button
                  onClick={() => setEditing(f)}
                  className="text-xs font-bold text-[var(--color-clay-purple)]"
                >
                  編輯
                </button>
                <button
                  onClick={() => remove(f.id)}
                  className="text-xs font-bold text-red-500"
                >
                  刪除
                </button>
              </div>
            );
          })}
          {faqs.length === 0 && (
            <p className="text-[var(--color-text-mid)] text-sm">還沒有題目。</p>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 在 `app/admin/page.jsx` 加 FAQ tab**

1. 檔頭加 import：`import FaqManager from "@/components/FaqManager";`
2. 找到 admin 的 tab bar（`activeTab` 控制，目前有 tools/painCards/users 等 tab 按鈕）—— 加一個「FAQ」tab 按鈕，沿用既有 tab 按鈕樣式：`onClick={() => setActiveTab("faqs")}`，label「❓ FAQ」。
3. 在 tab 內容渲染區（依 `activeTab` 切換的地方）加：`{activeTab === "faqs" && <FaqManager />}`。

> grep `activeTab ===` 找到既有 tab 內容渲染位置，依樣畫葫蘆插入。FaqManager 自包含（自己 load/CRUD），不需 admin 頁傳 props。

- [ ] **Step 3: build**

Run: `npm run build`
Expected: 成功。

- [ ] **Step 4: 視覺實測**

`npm run dev` → admin 登入 → `/admin` → 點「❓ FAQ」tab → 新增一題（含 markdown 答案、選分類、排序、發布）→ 儲存 → 列表出現 → 到 `/faq` 確認該題依分類顯示、accordion 展開、markdown 正確 → 回 admin 編輯/取消發布/刪除各驗一次。（需 `faqs` 規則已發布。）

- [ ] **Step 5: Commit**

```bash
git add src/components/FaqManager.jsx app/admin/page.jsx
git commit -m "feat(admin): FAQ 管理區（前端 CRUD + 排序 + 上下架）

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

## Task 9: 工具詳情頁 `faq` block

**Files:**

- Modify: `app/tool/[id]/page.jsx`

加第 8 種 block：`faq`（Q&A 陣列）。動 `BLOCK_DEFS` + `addBlock` + `BlockEditor`（編輯）+ `BlockView`（前台，用 `Accordion`）。

- [ ] **Step 1: import Accordion**

檔頭（其他 import 旁）加：

```js
import Accordion from "@/components/Accordion";
```

- [ ] **Step 2: `BLOCK_DEFS` 加 faq**

在 `BLOCK_DEFS` 物件（檔案上方，結尾約 line 42 `};`）內加一個 entry（沿用既有 `{label,badge}` 格式）：

```js
  faq: {
    label: "❓ 常見問題",
    badge: "bg-sky-50 text-sky-700 border-sky-200",
  },
```

- [ ] **Step 3: `addBlock` 為 faq 種子 items**

把現有 `addBlock`（約 line 838）改成依 type 帶初值：

```js
const addBlock = (type) =>
  setLocalBlocks((bs) => [
    ...bs,
    {
      id: crypto.randomUUID(),
      type,
      content: "",
      caption: "",
      ...(type === "faq" ? { items: [{ q: "", a: "" }] } : {}),
    },
  ]);
```

- [ ] **Step 4: `BlockEditor` 加 faq 編輯分支**

在 `BlockEditor` 的 content 區（`{block.type === "steps" && (...)}` 之後、`{(block.type === "text" || ...)}` 之前）插入：

```jsx
{
  block.type === "faq" && (
    <div className="flex flex-col gap-3">
      <p className="text-xs font-bold text-[var(--color-text-mid)]">
        這個工具的常見問答。答案支援 markdown。
      </p>
      {(block.items || []).map((qa, qi) => (
        <div
          key={qi}
          className="flex flex-col gap-2 border border-[var(--color-card-border)] rounded-xl p-3"
        >
          <div className="flex gap-2">
            <input
              value={qa.q || ""}
              onChange={(e) => {
                const items = [...(block.items || [])];
                items[qi] = { ...items[qi], q: e.target.value };
                onChange({ ...block, items });
              }}
              placeholder="問題"
              className="flex-1 bg-[var(--color-card-bg)] text-[var(--color-text-dark)] border border-[var(--color-card-border)] rounded-lg px-3 py-2 text-sm font-bold outline-none focus:border-[var(--color-clay-purple)]"
            />
            <button
              onClick={() => {
                const items = (block.items || []).filter((_, i) => i !== qi);
                onChange({ ...block, items });
              }}
              className="w-9 rounded-lg bg-red-50 text-red-400 hover:bg-red-100 text-sm"
              title="刪除此問答"
            >
              ✕
            </button>
          </div>
          <textarea
            value={qa.a || ""}
            onChange={(e) => {
              const items = [...(block.items || [])];
              items[qi] = { ...items[qi], a: e.target.value };
              onChange({ ...block, items });
            }}
            placeholder="答案（支援 markdown）"
            rows={2}
            className="bg-[var(--color-card-bg)] text-[var(--color-text-dark)] border border-[var(--color-card-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-clay-purple)] resize-y"
          />
        </div>
      ))}
      <button
        onClick={() =>
          onChange({
            ...block,
            items: [...(block.items || []), { q: "", a: "" }],
          })
        }
        className="self-start text-xs font-bold text-[var(--color-clay-purple)] border border-[var(--color-clay-purple)]/30 rounded-full px-3 py-1.5 hover:bg-[var(--color-clay-purple)]/5"
      >
        ＋ 加一題
      </button>
    </div>
  );
}
```

- [ ] **Step 5: `BlockView` 加 faq 前台分支**

在 `BlockView`（約 line 139）的某個分支之後、`return <text markdown>` 之前插入：

```jsx
if (type === "faq") {
  const items = (block.items || []).filter((qa) => qa.q);
  if (!items.length) return null;
  return <Accordion items={items} />;
}
```

> `block` 已在 `BlockView({ block })` 參數中；`type` 來自既有 `const { type, content, caption, source } = block;`。

- [ ] **Step 6: build**

Run: `npm run build`
Expected: 成功，無 "Accordion is not defined" 等錯。

- [ ] **Step 7: 視覺實測（迴歸重點）**

`npm run dev` → 開一個自己是作者/admin 的工具詳情頁 → 進編輯模式：

1. 「＋ 新增 Block」面板出現「❓ 常見問題」；點它加一個 faq block。
2. 加 2 題（答案放 markdown 連結/粗體）→ 儲存 → 退出編輯 → 該 block 以 accordion 呈現、可展開、markdown 正確。
3. **迴歸**：既有 7 種 block（text/tip/warning/steps/image/audio/video）編輯與前台渲染都正常、type 下拉含 faq。

- [ ] **Step 8: Commit**

```bash
git add app/tool/[id]/page.jsx
git commit -m "feat(detail): block editor 加 faq block（作者自助，前台共用 Accordion）

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

## Task 10: `notify.js` + `/api/request` route

**Files:**

- Create: `src/lib/notify.js`
- Create: `app/api/request/route.js`

`notify()` 發 Discord webhook（可抽換，LINE 後補）。route 驗 Firebase ID token（Admin SDK）→ 寫 `requests`（server，uid 取自 token）→ 通知。通知失敗不擋寫入。

- [ ] **Step 1: 建立 `src/lib/notify.js`**

```js
// src/lib/notify.js — 伺服器端通知（可抽換 channel）。目前：Discord webhook。
// LINE 後補：屆時在此多接一個 channel（Messaging API push），不動 caller。
// 絕不可在 client import（讀 server env）。

/** 發送通知。回傳是否成功。任何錯誤都吞掉（通知失敗不該擋主流程）。 */
export async function notify(text) {
  const url = process.env.DISCORD_WEBHOOK_URL;
  if (!url) {
    console.warn("notify: 未設定 DISCORD_WEBHOOK_URL，略過通知");
    return false;
  }
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: text }),
    });
    return res.ok;
  } catch (e) {
    console.error("notify 失敗：", e);
    return false;
  }
}
```

- [ ] **Step 2: 建立 `app/api/request/route.js`**

```js
import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdmin } from "@/lib/firebaseAdmin";
import { notify } from "@/lib/notify";

/**
 * POST /api/request
 * Body: { type: 'access'|'feature', message: string, name?: string, email?: string }
 * Header: Authorization: Bearer <Firebase ID token>
 * 驗 token → 寫 requests（uid 取自 token，可信）→ Discord 通知。通知失敗不影響寫入結果。
 */
export async function POST(req) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return NextResponse.json({ error: "未登入" }, { status: 401 });

    const { adminAuth, adminDb } = getAdmin();
    let decoded;
    try {
      decoded = await adminAuth.verifyIdToken(token);
    } catch {
      return NextResponse.json({ error: "token 無效" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const type = body.type === "feature" ? "feature" : "access";
    const message = String(body.message || "").slice(0, 2000);
    const name = String(body.name || decoded.name || "").slice(0, 100);
    const email = decoded.email || body.email || "";

    const ref = await adminDb.collection("requests").add({
      type,
      uid: decoded.uid,
      email,
      name,
      message,
      status: "pending",
      createdAt: FieldValue.serverTimestamp(),
    });

    const label = type === "access" ? "🔑 申請開發者" : "💡 提需求";
    await notify(
      `${label}\n來自：${name || email || decoded.uid}\n內容：${message || "(無留言)"}\nrequest id: ${ref.id}`,
    );

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("/api/request 失敗：", e);
    return NextResponse.json({ error: "伺服器錯誤" }, { status: 500 });
  }
}
```

- [ ] **Step 3: build**

Run: `npm run build`
Expected: 成功。

- [ ] **Step 4: Commit**

```bash
git add src/lib/notify.js app/api/request/route.js
git commit -m "feat(api): /api/request（驗 token + 寫 requests + Discord notify，可抽換）

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

> ⚠️ 部署需設 Vercel env `DISCORD_WEBHOOK_URL`（Discord 頻道 → 整合 → Webhook）。`FIREBASE_SERVICE_ACCOUNT` Phase B 已設。

---

## Task 11: RequestModal + RequestButton

**Files:**

- Create: `src/components/RequestModal.jsx`
- Create: `src/components/RequestButton.jsx`

共用申請/提需求表單。`RequestModal` 帶 type；`RequestButton` 是 client 觸發鈕（讓 server 端 Footer 能嵌）。

- [ ] **Step 1: 建立 `src/components/RequestModal.jsx`**

```jsx
"use client";

import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { auth } from "@/lib/firebase";

const TITLES = {
  access: "申請成為開發者",
  feature: "提需求 / 想要的工具",
};

/** 共用申請/提需求表單。@param {{type:'access'|'feature', onClose:()=>void}} props */
export default function RequestModal({ type = "feature", onClose }) {
  const { user, profile } = useAuth();
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    if (!user) return setErr("請先登入");
    if (!message.trim()) return setErr("請填寫留言");
    setSending(true);
    setErr("");
    try {
      const token = await auth.currentUser.getIdToken();
      const res = await fetch("/api/request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          type,
          message: message.trim(),
          name: profile?.displayName || user.displayName || "",
          email: user.email || "",
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "送出失敗");
      setDone(true);
    } catch (e) {
      setErr(e.message || "送出失敗，請稍後再試");
    }
    setSending(false);
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="bg-[var(--color-card-bg)] rounded-3xl p-6 w-full max-w-md shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-black text-lg text-[var(--color-text-dark)]">
            {TITLES[type]}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 text-xl"
          >
            ✕
          </button>
        </div>
        {done ? (
          <div className="text-center py-6">
            <p className="text-2xl mb-2">✅</p>
            <p className="font-bold text-[var(--color-text-dark)]">
              已送出，我們會盡快回覆你！
            </p>
            <button
              onClick={onClose}
              className="mt-4 px-5 py-2 rounded-full bg-[var(--color-clay-purple)] text-white font-bold text-sm"
            >
              關閉
            </button>
          </div>
        ) : !user ? (
          <p className="text-[var(--color-text-mid)] font-semibold py-6 text-center">
            請先登入再送出申請。
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-[var(--color-text-mid)] font-semibold">
              以 <strong>{user.email || profile?.displayName}</strong>{" "}
              身份送出。
            </p>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={
                type === "access"
                  ? "想上架什麼？為什麼需要開發者權限？"
                  : "你想要什麼工具 / 功能？解決什麼問題？"
              }
              rows={4}
              className="bg-gray-50 dark:bg-gray-700 p-3 rounded-xl border border-gray-200 dark:border-gray-600 text-sm outline-none focus:border-[var(--color-clay-purple)]"
            />
            {err && <p className="text-sm text-red-500 font-bold">{err}</p>}
            <button
              onClick={submit}
              disabled={sending}
              className="px-5 py-2.5 rounded-full bg-[var(--color-clay-purple)] text-white font-extrabold disabled:opacity-60"
            >
              {sending ? "送出中…" : "📩 送出"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 建立 `src/components/RequestButton.jsx`**

```jsx
"use client";

import { useState } from "react";
import RequestModal from "@/components/RequestModal";

/** client 觸發鈕 — 讓 server 元件（Footer）也能開 RequestModal。 */
export default function RequestButton({
  type = "feature",
  className = "",
  children,
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        {children}
      </button>
      {open && <RequestModal type={type} onClose={() => setOpen(false)} />}
    </>
  );
}
```

- [ ] **Step 3: build + Commit**

Run: `npm run build`（成功）

```bash
git add src/components/RequestModal.jsx src/components/RequestButton.jsx
git commit -m "feat(request): RequestModal + RequestButton（共用申請/提需求表單）

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

## Task 12: `/access` 權限分級頁

**Files:**

- Create: `app/access/page.jsx`

版型 A+B（三欄角色卡 + 下方對照表）。讀 `useAuth()` 顯示目前角色 + 對 viewer 顯示申請 CTA。

- [ ] **Step 1: 建立 `app/access/page.jsx`**

```jsx
"use client";

import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import RequestModal from "@/components/RequestModal";

const ROLES = [
  {
    key: "viewer",
    label: "一般同仁",
    en: "viewer",
    caps: ["瀏覽 / 搜尋 / 使用所有資源"],
  },
  {
    key: "developer",
    label: "開發者",
    en: "developer",
    caps: ["以上全部", "上架自己的工具 / 痛點卡（送審）", "編輯自己上架的內容"],
  },
  {
    key: "admin",
    label: "管理員",
    en: "admin",
    caps: [
      "以上全部",
      "審核上架 · 退回、編輯全站內容",
      "管理 FAQ / 建開發者帳號 / 後台",
    ],
  },
];

const MATRIX = [
  ["瀏覽 / 搜尋 / 使用所有資源", true, true, true],
  ["上架自己的工具 / 痛點卡（送審）", false, true, true],
  ["編輯自己上架的內容", false, true, true],
  ["審核上架 · 退回、編輯全站內容", false, false, true],
  ["管理 FAQ / 建開發者帳號 / 後台", false, false, true],
];

export default function AccessPage() {
  const { user, isAdmin, isDeveloper } = useAuth();
  const [showReq, setShowReq] = useState(false);
  const current = isAdmin
    ? "admin"
    : isDeveloper
      ? "developer"
      : user
        ? "viewer"
        : null;

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-0 py-10">
      <header className="text-center mb-10">
        <h1 className="text-4xl md:text-5xl font-black text-[var(--color-text-dark)] mb-3">
          取用說明 / 權限分級
        </h1>
        <p className="text-[var(--color-text-mid)] font-semibold">
          登入用公司 Google 帳號或 Face
          ID（passkey）。首次登入自動成為「一般同仁」。
          {current && (
            <span className="ml-1">
              你目前：
              <strong className="text-[var(--color-clay-purple)]">
                {ROLES.find((r) => r.key === current)?.label}
              </strong>
              。
            </span>
          )}
        </p>
      </header>

      {/* 三欄角色卡 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
        {ROLES.map((r) => {
          const isCurrent = current === r.key;
          return (
            <div
              key={r.key}
              className={`rounded-3xl p-6 border-2 ${isCurrent ? "border-[var(--color-clay-purple)] bg-[var(--color-clay-purple)]/5" : "border-[var(--color-card-border)] bg-[var(--color-card-bg)]"}`}
            >
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="font-black text-lg text-[var(--color-text-dark)]">
                    {r.label}
                  </h3>
                  <span className="text-xs font-bold text-[var(--color-text-mid)]">
                    {r.en}
                  </span>
                </div>
                {isCurrent && (
                  <span className="text-xs font-extrabold bg-[var(--color-clay-purple)] text-white px-2 py-1 rounded-full">
                    你目前
                  </span>
                )}
              </div>
              <ul className="flex flex-col gap-2 text-sm font-semibold text-[var(--color-text-mid)]">
                {r.caps.map((c) => (
                  <li key={c} className="flex gap-2">
                    <span className="text-[var(--color-clay-purple)]">✓</span>
                    {c}
                  </li>
                ))}
              </ul>
              {r.key === "developer" && current === "viewer" && (
                <button
                  onClick={() => setShowReq(true)}
                  className="mt-5 w-full py-2.5 rounded-full bg-[var(--color-clay-purple)] text-white font-extrabold text-sm"
                >
                  📩 申請成為開發者
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* 對照表 */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse min-w-[480px]">
          <thead>
            <tr className="border-b-2 border-[var(--color-card-border)]">
              <th className="text-left py-3 font-extrabold text-[var(--color-text-dark)]">
                能做什麼
              </th>
              {ROLES.map((r) => (
                <th
                  key={r.key}
                  className="py-3 font-extrabold text-[var(--color-text-dark)] text-center"
                >
                  {r.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MATRIX.map(([cap, ...flags]) => (
              <tr
                key={cap}
                className="border-b border-[var(--color-card-border)]"
              >
                <td className="py-3 font-semibold text-[var(--color-text-mid)]">
                  {cap}
                </td>
                {flags.map((ok, i) => (
                  <td key={i} className="py-3 text-center">
                    {ok ? (
                      <span className="text-[var(--color-clay-purple)] font-black">
                        ✓
                      </span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!user && (
        <p className="text-center text-[var(--color-text-mid)] mt-8 font-semibold">
          登入後即可申請開發者權限。
        </p>
      )}

      {showReq && (
        <RequestModal type="access" onClose={() => setShowReq(false)} />
      )}
    </div>
  );
}
```

- [ ] **Step 2: build**

Run: `npm run build`
Expected: 成功。

- [ ] **Step 3: 視覺實測（含 RWD + 角色）**

`npm run dev` → `/access`：

1. 未登入：三欄卡無「你目前」、無申請鈕、底部提示登入。
2. viewer 登入：developer 卡出現「📩 申請成為開發者」；點開 RequestModal、填留言、送出 → 成功畫面（需 `DISCORD_WEBHOOK_URL` 設好才會真的進 Discord；本機可先確認 `requests` 有寫入 / 或看 route log）。
3. admin 登入：admin 卡標「你目前」、無申請鈕。
4. **手機寬度**：三欄疊成三張；對照表可橫向捲動（`overflow-x-auto`）。

- [ ] **Step 4: Commit**

```bash
git add app/access/page.jsx
git commit -m "feat(access): 權限分級頁（三欄卡 + 對照表 + 角色感知申請 CTA）

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

## Task 13: Chrome — Navbar 連結 + Footer（支援頁連結 + 提需求改表單）

**Files:**

- Modify: `src/components/Navbar.jsx`
- Modify: `src/components/Footer.jsx`

- [ ] **Step 1: Navbar 加 3 個連結**

在 `src/components/Navbar.jsx` 的「資源中心」`<Link href="/hub">`（約 line 38-43）之後，插入三個同樣式連結：

```jsx
          <Link href="/docs" className="hidden md:inline hover:text-violet-500 dark:hover:text-violet-400 transition-colors">文件</Link>
          <Link href="/faq" className="hidden md:inline hover:text-violet-500 dark:hover:text-violet-400 transition-colors">FAQ</Link>
          <Link href="/changelog" className="hidden md:inline hover:text-violet-500 dark:hover:text-violet-400 transition-colors">更新日誌</Link>
```

> 沿用既有 `hidden md:inline` 模式（手機隱藏；手機導覽靠 Footer）。可移除「關於這個平台」以免 nav 過擠（選擇性，與 Jason 確認；預設保留）。

- [ ] **Step 2: Footer 加支援頁連結 + 提需求改 RequestButton**

`src/components/Footer.jsx`：

1. 檔頭加 `import RequestButton from "@/components/RequestButton";`（Footer 仍是 server 元件，RequestButton 是 client，可被嵌）。
2. 「開發者」欄的「提需求」`<a href="mailto:...">提需求</a>`（line 65-72）改成：

```jsx
<li>
  <RequestButton
    type="feature"
    className="hover:text-[var(--color-clay-purple)] cursor-pointer"
  >
    提需求
  </RequestButton>
</li>
```

3. 把「關於」欄（line 75-82）的內容換成「說明」連結清單（並把「經企室建置維運」移到品牌欄副標）：

```jsx
<div>
  <div className="text-xs font-extrabold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">
    說明
  </div>
  <ul className="flex flex-col gap-2 text-sm font-bold text-[var(--color-text-mid)]">
    <li>
      <Link href="/docs" className="hover:text-[var(--color-clay-purple)]">
        新手上路
      </Link>
    </li>
    <li>
      <Link href="/faq" className="hover:text-[var(--color-clay-purple)]">
        常見問題
      </Link>
    </li>
    <li>
      <Link href="/changelog" className="hover:text-[var(--color-clay-purple)]">
        更新日誌
      </Link>
    </li>
    <li>
      <Link href="/access" className="hover:text-[var(--color-clay-purple)]">
        取用說明
      </Link>
    </li>
  </ul>
</div>
```

4. 品牌欄副標（line 17-19）的 `<p>` 後補一行「經企室建置維運」：

```jsx
<p className="text-xs text-[var(--color-text-mid)] font-semibold mt-1">
  經企室建置維運
</p>
```

- [ ] **Step 3: build**

Run: `npm run build`
Expected: 成功（server Footer 嵌 client RequestButton 合法）。

- [ ] **Step 4: 視覺實測（含 RWD）**

`npm run dev` →

1. Navbar（桌機）出現 文件 / FAQ / 更新日誌，點擊各自到頁。
2. Footer「說明」欄四連結可點；「提需求」點了開 RequestModal（type=feature），登入後可送出。
3. 手機寬度：Navbar 連結照舊隱藏（靠 Footer）；Footer 欄位堆疊正常。

- [ ] **Step 5: Commit**

```bash
git add src/components/Navbar.jsx src/components/Footer.jsx
git commit -m "feat(chrome): Navbar 加支援頁連結 + Footer 說明欄 + 提需求改 RequestModal

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

## Task 14: 整合驗收

- [ ] **Step 1: 全量 build + lint**

Run: `npm run build` → 成功；`npm run lint` → 無新錯。

- [ ] **Step 2: 對照 spec §11 驗收標準逐項實測（dev）**

逐項打勾：Navbar/Footer 連結、`/docs` 三路徑+分流器+錨點、`/faq` 分組+chip+accordion+markdown、admin FAQ CRUD、faq block（含既有 block 無迴歸）、`/changelog` 時間軸+技術段收合、`/access` 三欄卡+對照表+角色 CTA、申請表單寫入+通知（本機驗 `requests` 寫入；通知需 env）、四頁 RWD。

- [ ] **Step 3: 跑 changelog parser 斷言**

Run: `node scripts/__verify-changelog-parse.mjs` → `✅`（可保留作 sanity check）。

- [ ] **Step 4: 用 superpowers:finishing-a-development-branch 決定合併方式（建議開 PR）。**

- [ ] **Step 5: 部署待辦（人工，依 AGENTS.md）**

1. **Phase 1 收尾先做完**（若尚未）：`migrate-category.mjs --apply` + 驗 live。
2. merge Phase 2 PR → Vercel production deploy **Ready 綠燈**。
3. **設 Vercel env `DISCORD_WEBHOOK_URL`**（否則申請通知靜默失敗）。
4. **Firebase Console 手動發布 firestore.rules**（含新 `faqs`/`requests`）—— 否則 `/faq` 無資料、`/api/request` 寫入失敗。
5. **連 live 站驗證**：`/docs` `/faq` `/changelog` `/access` 四頁 + 送一筆測試申請確認 Discord 收到。

---

## Self-Review（plan 對照 spec）

- **§1 chrome**：Task 13（Navbar/Footer）。✅
- **§2 /docs**（3 路徑 + 分流器 + 錨點 + 靜態 + 版型 B）：Task 2。✅
- **§3 /faq**（兩層 + faqs 模型 + admin CRUD + 5 分類 + markdown + 版型 A + 共用 Accordion + faq block）：Task 1（Accordion）/6（faq.js+getFaqs）/7（/faq）/8（admin）/9（faq block）。✅
- **§4 /changelog**（渲染 CHANGELOG.md + 過濾技術段 + 版型 A）：Task 3（parser）/4（頁）。✅
- **§5 /access**（三層權限 + 角色感知 CTA + 統一 requests 管道 + Discord notify + footer 接線 + 版型 A+B）：Task 5（rules）/10（notify+api）/11（modal/button）/12（/access）/13（footer）。✅
- **§6 資料模型**：`faqs`（Task 5/6/8）、`requests`（Task 5/10）、`faq` block（Task 9）、`DISCORD_WEBHOOK_URL`（Task 10/14）。✅
- **§9 風險**：RWD（每個 UI task 的 Step 都有手機寬度檢查）、rules 手動發布（Task 5 Step 3 + Task 14 Step 5）、webhook 失敗不擋寫入（Task 10 notify 吞錯 + route 先寫後通知）、用詞（/docs、/access 文案白話）、faq block 迴歸（Task 9 Step 7）、Phase 1 migration 先後（Task 14 Step 5）。✅
- **Placeholder 掃描**：各 step 附實際程式碼或精確指令；admin FAQ tab 插入點用 grep 定位（既有 activeTab 模式，非 placeholder）。✅
- **型別一致性**：`Accordion` 吃 `items:[{q,a}]` —— `/faq`（`{q:question,a:answer}`）、faq block（`{q,a}`）一致；`getFaqs` 回傳含 `question/answer/category/order/published`，`FaqManager` 與 `/faq` 用相同欄位名；`parseChangelog` 回傳 `{version,date,summary,userSections,techSections}`，`ChangelogTimeline` 同名取用；`/api/request` body `{type,message,name,email}` 與 `RequestModal` 送出一致。✅

---

## 已知取捨 / 非本 plan

- **Navbar 手機選單**：沿用既有 `hidden md:inline`（手機不顯示 nav 連結，靠 Footer）。加 hamburger menu 屬既有限制、非本 Phase 範圍（可列 backlog）。
- **per-tool 版本歷史**：Phase 2.5（spec §10），不在此 plan。
- **LINE 通知**：`notify()` 已預留可抽換；LINE push 待 Jason 啟用既有 bot 後另接，非本 plan。
