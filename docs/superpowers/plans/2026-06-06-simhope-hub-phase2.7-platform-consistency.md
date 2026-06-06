# SimHope Hub Phase 2.7 — 全平台呈現一致性 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓平台每個頁面的 prose 一致走共用文章 typography（`MarkdownContent`），並把 UI 頁散落的硬編灰色換成品牌 token——內頁文章輕、首頁保留行銷聲量。

**Architecture:** 把 `/faq`(Accordion)、`/changelog`(ChangelogTimeline)、版本歷史(VersionHistory) 的裸 `ReactMarkdown` 改用共用 `src/components/MarkdownContent.jsx`（2.6 已升級的文章 typography）。`/docs` 手寫 prose 就地正規化字重/標題。UI 頁（hub/dashboard/admin/access/home）只換顏色 class 為品牌 CSS var。無新檔、無邏輯改動、無 migration。

**Tech Stack:** Next.js 16 + React 19 + Tailwind 4 + react-markdown。**無單元測試框架**；本輪以 UI/視覺為主 → 驗證重 `npm run build` + `npm run lint`（無新增錯誤）+ preview 目視。

**Spec:** `docs/superpowers/specs/2026-06-06-simhope-hub-phase2.7-platform-consistency-design.md`

---

## File Structure（全部 Modify，無 Create）

- `src/components/Accordion.jsx` — 答案改用 MarkdownContent（修 /faq + 詳情頁 faq block）。
- `src/components/ChangelogTimeline.jsx` — bullet 改用 MarkdownContent；summary/版本號字重輕化。
- `src/components/VersionHistory.jsx` — notes 改用 MarkdownContent。
- `app/docs/page.jsx` — in-content prose 字重/標題正規化。
- `app/hub/page.jsx` / `app/dashboard/page.jsx` / `app/admin/page.jsx` / `app/access/page.jsx` / `app/page.jsx` — 硬編灰色 → 品牌 token。

**依賴順序：** 全部獨立，可任意序；subagent-driven 依 Task 1→6 跑。

---

## Task 1: `/faq` — Accordion 改用 MarkdownContent

**Files:** Modify `src/components/Accordion.jsx`

- [ ] **Step 1: 換 import**

Find:

```jsx
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
```

Replace with:

```jsx
import { useState } from "react";
import MarkdownContent from "@/components/MarkdownContent";
```

- [ ] **Step 2: 答案區改用 MarkdownContent、拔臨時排版 class**

Find:

```jsx
{
  open && (
    <div className="px-5 pb-5 pt-1 text-sm text-[var(--color-text-mid)] leading-relaxed border-t border-[var(--color-card-border)] [&_a]:text-[var(--color-clay-blue)] [&_a]:underline [&_ul]:list-disc [&_ul]:ml-5 [&_ol]:list-decimal [&_ol]:ml-5 [&_code]:bg-gray-100 dark:[&_code]:bg-gray-700 [&_code]:px-1 [&_code]:rounded">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{item.a || ""}</ReactMarkdown>
    </div>
  );
}
```

Replace with:

```jsx
{
  open && (
    <div className="px-5 pb-4 pt-1 border-t border-[var(--color-card-border)]">
      <MarkdownContent>{item.a || ""}</MarkdownContent>
    </div>
  );
}
```

- [ ] **Step 3: build + lint**

Run: `npm run build` → 成功
Run: `npx eslint src/components/Accordion.jsx` → 無 error（無殘留 unused import）

- [ ] **Step 4: Commit**

```bash
git add src/components/Accordion.jsx
git commit -m "refactor(faq): Accordion 答案改用共用 MarkdownContent

/faq 與詳情頁 faq block 統一文章 typography（正常字重、✦ 清單、乾淨加粗）.

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

## Task 2: `/changelog` — ChangelogTimeline 改用 MarkdownContent

**Files:** Modify `src/components/ChangelogTimeline.jsx`

- [ ] **Step 1: 換 import**

Find:

```jsx
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
```

Replace with:

```jsx
import { useState } from "react";
import MarkdownContent from "@/components/MarkdownContent";
```

- [ ] **Step 2: `Section` 改用 MarkdownContent（items 組成 markdown 清單）**

Find:

```jsx
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
```

Replace with:

```jsx
function Section({ heading, items }) {
  return (
    <div className="mt-2">
      <p className="text-xs font-extrabold text-[var(--color-text-mid)] uppercase tracking-wider mb-1">
        {heading}
      </p>
      <MarkdownContent>
        {items.map((it) => `- ${it}`).join("\n")}
      </MarkdownContent>
    </div>
  );
}
```

- [ ] **Step 3: summary 字重 + 版本號標題輕化**

Find:

```jsx
<span className="font-black text-lg text-[var(--color-text-dark)]">
  v{v.version}
</span>
```

Replace with:

```jsx
<span className="font-extrabold text-lg text-[var(--color-text-dark)]">
  v{v.version}
</span>
```

Then find:

```jsx
{
  v.summary && (
    <p className="text-sm text-[var(--color-text-mid)] font-semibold leading-relaxed">
      {v.summary}
    </p>
  );
}
```

Replace with:

```jsx
{
  v.summary && (
    <p className="text-[var(--color-text-mid)] font-normal leading-relaxed">
      {v.summary}
    </p>
  );
}
```

- [ ] **Step 4: build + lint**

Run: `npm run build` → 成功
Run: `npx eslint src/components/ChangelogTimeline.jsx` → 無 error（無殘留 unused import）

- [ ] **Step 5: Commit**

```bash
git add src/components/ChangelogTimeline.jsx
git commit -m "refactor(changelog): timeline bullet 改用共用 MarkdownContent

每版 bullet 組成 markdown 清單走文章 typography（✦ 清單、品牌粗體/連結）；
summary 正常字重、版本號 font-extrabold。技術細節收合邏輯不動.

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

## Task 3: 版本歷史 — VersionHistory 改用 MarkdownContent

**Files:** Modify `src/components/VersionHistory.jsx`

- [ ] **Step 1: 換 import**

Find:

```jsx
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
```

Replace with:

```jsx
import MarkdownContent from "@/components/MarkdownContent";
```

- [ ] **Step 2: notes 改用 MarkdownContent、拔臨時 class**

Find:

```jsx
{
  v.notes && (
    <div className="text-sm text-[var(--color-text-dark)] font-medium [&_p]:mb-1 [&_ul]:list-disc [&_ul]:ml-5 [&_a]:text-[var(--color-clay-blue)] [&_a]:underline">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{v.notes}</ReactMarkdown>
    </div>
  );
}
```

Replace with:

```jsx
{
  v.notes && <MarkdownContent>{v.notes}</MarkdownContent>;
}
```

- [ ] **Step 3: build + lint**

Run: `npm run build` → 成功
Run: `npx eslint src/components/VersionHistory.jsx` → 無 error

- [ ] **Step 4: Commit**

```bash
git add src/components/VersionHistory.jsx
git commit -m "refactor(versions): VersionHistory notes 改用共用 MarkdownContent

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

## Task 4: `/docs` — in-content prose 正規化

**Files:** Modify `app/docs/page.jsx`

只動「內文區」字重/標題；**頁首 h1 + 副標不動**（保留跨內容頁一致的頁首 pattern）。

- [ ] **Step 1: 三個 section `<h2>` 輕化（font-black → font-extrabold、text-2xl → text-xl）**

This exact `<h2>` className appears 3 times (lines ~69, ~103, ~133). Replace ALL occurrences of:

```jsx
        <h2 className="text-2xl font-black text-[var(--color-text-dark)] mb-4">
```

with:

```jsx
        <h2 className="text-xl font-extrabold text-[var(--color-text-dark)] mb-4">
```

（用 replace-all / 逐一替換三處皆可。）

- [ ] **Step 2: 內文 `<ol>` 字重正常化（兩處：① 與 ② 段）**

Replace ALL occurrences of:

```jsx
        <ol className="flex flex-col gap-3 text-[var(--color-text-mid)] font-semibold">
```

with:

```jsx
        <ol className="flex flex-col gap-3 text-[var(--color-text-mid)] font-normal leading-relaxed">
```

- [ ] **Step 3: 內文 `<p>`（② 段前言）正常化**

Find:

```jsx
<p className="text-[var(--color-text-mid)] font-semibold mb-3">
  <strong>前置</strong>：先安裝 Claude Desktop 或 Claude Code / Cursor。
</p>
```

Replace with:

```jsx
<p className="text-[var(--color-text-mid)] font-normal mb-3">
  <strong>前置</strong>：先安裝 Claude Desktop 或 Claude Code / Cursor。
</p>
```

- [ ] **Step 4: ③ API 占位卡內文正常化**

Find:

```jsx
        <div className="bg-[var(--color-card-bg)] border border-[var(--color-card-border)] rounded-2xl p-5 text-[var(--color-text-mid)] font-semibold">
```

Replace with:

```jsx
        <div className="bg-[var(--color-card-bg)] border border-[var(--color-card-border)] rounded-2xl p-5 text-[var(--color-text-mid)] font-normal leading-relaxed">
```

- [ ] **Step 5: build + lint**

Run: `npm run build` → 成功
Run: `npx eslint "app/docs/page.jsx"` → 無新 error

- [ ] **Step 6: Commit**

```bash
git add "app/docs/page.jsx"
git commit -m "style(docs): in-content prose 正規化（font-normal + 標題 extrabold）

內文字重從 semibold 降 normal、section 標題 font-black→extrabold，與文章頁
一致；頁首 h1+副標保留既有 pattern.

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

## Task 5: UI 頁硬編灰色 → 品牌 token

**Files:** Modify `app/hub/page.jsx`, `app/dashboard/page.jsx`, `app/admin/page.jsx`, `app/access/page.jsx`, `app/page.jsx`

只換**顏色 class → 品牌 CSS var**，不動版面/邏輯。先 READ 每個檔案、定位下列 class、就地替換。

- [ ] **Step 1: `app/hub/page.jsx`**

- 搜尋框：把該 `<input>` 的 `border-gray-200 dark:border-gray-700` → `border-[var(--color-card-border)]`。
- 空狀態文字：`text-gray-500`（搭配 `font-bold` 的空狀態訊息）→ `text-[var(--color-text-mid)]`。

- [ ] **Step 2: `app/dashboard/page.jsx`**

- 歡迎標題列：`border-b-2 border-gray-100 dark:border-gray-700` → `border-b-2 border-[var(--color-card-border)]`。

- [ ] **Step 3: `app/admin/page.jsx`**

- `<aside>` sidebar：`border-gray-200` → `border-[var(--color-card-border)]`；其 nav 項 `text-gray-600` → `text-[var(--color-text-mid)]`。
- 找到只有 `font-black mb-6`（缺色 token）的那個 `<h2>`，補上 `text-[var(--color-text-dark)]`。
- ⚠️ 黃色 pending 警示塊（`bg-yellow-50/50` 等）＝狀態色，**保留不動**。

- [ ] **Step 4: `app/access/page.jsx`**

- role 卡的 `rounded-3xl` → `rounded-2xl`（與站內慣用一致）。

- [ ] **Step 5: `app/page.jsx`（首頁）— 只換 testimonial 硬編色**

- 找到 testimonial 卡的 `style={{ borderTop: \`4px solid ${t.color}\` }}`（或類似硬編 hex 來源）。
把資料來源 `t.color`的硬編 hex 改成品牌 token：若`t.color`是`DEFAULT_SITE`/本檔常數陣列裡的 hex 值，
改成對應 CSS var（如 `var(--color-clay-purple)`等）或保留 inline 但用 var。**其餘行銷字重`font-black`/`font-semibold` 維持不動。\*\*
  - 註：若 testimonial 顏色來自本檔內聯陣列的 hex，最小改動＝把那些 hex 換成品牌 var 字串；確保 build 不破。

- [ ] **Step 6: build + lint**

Run: `npm run build` → 成功
Run: `npx eslint "app/hub/page.jsx" "app/dashboard/page.jsx" "app/admin/page.jsx" "app/access/page.jsx" "app/page.jsx"` → 無新 error

- [ ] **Step 7: Commit**

```bash
git add "app/hub/page.jsx" "app/dashboard/page.jsx" "app/admin/page.jsx" "app/access/page.jsx" "app/page.jsx"
git commit -m "style(ui): UI 頁硬編灰色 → 品牌 token（一致性清理）

hub/dashboard/admin/access/home 散落的 gray class 換 CSS var；access role 卡
rounded-2xl；首頁只換 testimonial 硬編色、行銷字重維持。黃色狀態色保留.

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

## Task 6: 全量驗證 + PR

**Files:** 無

- [ ] **Step 1: build + lint + 既有斷言**

```bash
npm run build                        # 成功
npm run lint 2>&1 | tail -15         # 只剩 pre-existing（ThemeProvider/page.jsx set-state、img、root scratch parse error）
node scripts/__verify-versions.mjs   # ✅（確認沒被波及）
node scripts/__verify-article.mjs    # ✅
node scripts/__verify-safeurl.mjs    # ✅
node scripts/__verify-taxonomy.mjs   # ✅
```

- [ ] **Step 2: 逐頁 preview 目視（`npm run dev`）**

- `/faq`：展開答案＝文章 typography（正常字重、✦ 清單、乾淨加粗、品牌連結）；展開/收合正常。
- `/changelog`：每版 bullet ✦ 清單、inline 粗體/連結/code 正確；summary 正常字重；版本號不過粗；「技術細節」收合仍動。
- 詳情頁「🕒 版本」：notes 走新樣式、與全站一致；詳情頁 faq block（若有）正常。
- `/docs`：內文輕盈、section 標題 extrabold、頁首不變。
- `/hub` `/dashboard` `/admin` `/access` `/`：顏色換 token 後無破版；首頁行銷感維持。
- 特別確認 compact 場景（/changelog 密集條列）不會過於鬆散；若體感過鬆，回報後決定是否局部 override（spec 風險 1）。

- [ ] **Step 3: 截圖給 Jason（UI 改動先 preview 再 merge）**

把 /faq、/changelog、/docs 三張（before/after 體感）給 Jason 拍板。本機 `npm run dev` 或推 branch 觸發 Vercel preview。

- [ ] **Step 4: 開 PR**

```bash
git push -u origin feature-hub-phase2.7
gh pr create --base main --head feature-hub-phase2.7 \
  --title "feat(hub): Phase 2.7 全平台呈現一致性" \
  --body "見 docs/superpowers/specs/2026-06-06-simhope-hub-phase2.7-platform-consistency-design.md。

prose 全走共用 MarkdownContent（/faq Accordion、/changelog Timeline、版本歷史），
/docs in-content prose 正規化，UI 頁硬編灰換品牌 token。內頁文章輕、首頁保留行銷聲量。
無 migration、不動 rules。

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

---

## Self-Review（plan vs spec）

**Spec coverage：**

- P1 Accordion → Task 1；ChangelogTimeline → Task 2。
- P2 VersionHistory → Task 3。
- P3 /docs prose → Task 4。
- P4 UI token cleanup → Task 5。
- 風險（compact 過鬆、changelog `- {it}` 組裝、Accordion 兩處共用、token 不破版、首頁不動）→ Task 6 preview 步驟逐項。
- 驗收標準 → Task 6。

**Placeholder scan：** Task 1–4 為精確 old→new；Task 5 為「定位+替換規則」（因 5 檔散落小 swap，給規則+位置由 implementer 就地套），非佔位。

**Type consistency：** 所有改動都是 `MarkdownContent`（default import from `@/components/MarkdownContent`）+ 既有品牌 CSS var；無新型別/簽名。
