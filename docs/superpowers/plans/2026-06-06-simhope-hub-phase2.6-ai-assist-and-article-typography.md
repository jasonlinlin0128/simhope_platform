# SimHope Hub Phase 2.6 — AI 輔助撰寫鈕 + 文章式閱讀排版 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `text` block 編輯器加「✨ AI」輔助鈕（部落格口吻潤飾/生成，後端 `/api/ai/assist-block`），並把詳情頁 `desc` + `text` block 的 markdown 渲染升級成文章式閱讀排版（正常字重內文、乾淨加粗、`desc` 依 `##` 細線分段）。

**Architecture:** 純函式（`safeUrl` SSRF 判斷、`article` 切段）抽成 `src/lib/`，可 node 斷言。`MarkdownContent` + 升級後的 `mdComponents` 從 `app/tool/[id]/page.jsx` 抽到共用 `src/components/MarkdownContent.jsx`，讓 `ArticleDesc` 與詳情頁共用同一套文章 typography。AI 後端沿用既有 `enrich-tool` 的 auth（Bearer idToken → Identity Toolkit → users/{uid}.role）+ `rateLimit.js` + Gemini，gating 放寬到 developer/admin。前端 `AiAssist` 自帶 `useAuth()`，預覽再採用、不直接覆寫原文。

**Tech Stack:** Next.js 16 (App Router) + React 19 + Firebase + Tailwind 4 + react-markdown/remark-gfm + Gemini 2.5 Flash。**無單元測試框架**——純邏輯用 `node scripts/__verify-*.mjs` 斷言、UI/route 用 `npm run build` + `npm run lint` + preview 目視。

**Spec:** `docs/superpowers/specs/2026-06-06-simhope-hub-phase2.6-ai-assist-and-article-typography-design.md`

---

## File Structure

**新增：**

- `src/lib/safeUrl.js` — `isSafeHttpUrl(url)`：擋 SSRF（限 http/https + 內網/private host）。純函式。
- `scripts/__verify-safeurl.mjs` — safeUrl 斷言。
- `app/api/ai/assist-block/route.js` — AI 撰寫端點（auth developer/admin、rateLimit、SSRF-guarded fetch、Gemini plain text + maxOutputTokens）。
- `src/lib/article.js` — `splitMarkdownSections(md)`：依 `##` 切段。純函式。
- `scripts/__verify-article.mjs` — article 斷言（含邊界）。
- `src/components/MarkdownContent.jsx` — 從 page.jsx 抽出 + **升級 typography** 的共用 markdown 渲染器。
- `src/components/ArticleDesc.jsx` — `desc` 文章式呈現（lead + 細線分段編號）。
- `src/components/AiAssist.jsx` — text block 的 AI 輔助面板（受控、自帶 useAuth）。

**修改：**

- `app/tool/[id]/page.jsx` — 移除本地 `mdComponents`/`MarkdownContent` 改 import 共用版；`DetailTab` 用 `ArticleDesc`；`BlockEditor` text 分支嵌 `AiAssist` + 下傳 `context`。

**依賴順序：** Task 1 → Task 2（依 1）；Task 3 獨立；Task 4（抽+升級 MarkdownContent）→ Task 5（依 3,4）；Task 6（依 2，且在 4/5 之後動 page.jsx）→ Task 7（驗證+PR）。subagent-driven 依序跑即可。

---

## Task 1: `safeUrl` SSRF 判斷 helper

**Files:**

- Create: `src/lib/safeUrl.js`
- Create: `scripts/__verify-safeurl.mjs`

- [ ] **Step 1: 寫 helper**

Create `src/lib/safeUrl.js`:

```js
// src/lib/safeUrl.js
// 判斷一個 URL 是否可安全讓「伺服器」去 fetch（擋 SSRF）。純函式、可 node 斷言。
// 只允許 http/https，且擋掉 localhost / 內網 / link-local / 純主機名。

const PRIVATE_HOST_RE = [
  /^localhost$/i,
  /^127\./,
  /^0\.0\.0\.0$/,
  /^10\./,
  /^192\.168\./,
  /^169\.254\./, // link-local
  /^172\.(1[6-9]|2\d|3[01])\./, // 172.16–172.31
  /^\[?::1\]?$/, // IPv6 loopback
  /\.local$/i,
];

/**
 * @param {string} raw
 * @returns {boolean} 只有 http/https 且非內網/私有 host 才回 true
 */
export function isSafeHttpUrl(raw) {
  let u;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  const host = u.hostname;
  if (!host) return false;
  // 純主機名（無點、無冒號）多半是內網，拒掉
  if (!host.includes(".") && !host.includes(":")) return false;
  return !PRIVATE_HOST_RE.some((re) => re.test(host));
}
```

- [ ] **Step 2: 寫斷言**

Create `scripts/__verify-safeurl.mjs`:

```js
// scripts/__verify-safeurl.mjs — 純函式 sanity check
import assert from "node:assert";
import { isSafeHttpUrl } from "../src/lib/safeUrl.js";

// 安全：公開 http/https
assert.equal(isSafeHttpUrl("https://github.com/a/b"), true);
assert.equal(isSafeHttpUrl("http://example.com/x"), true);
// 非 http(s) scheme
assert.equal(isSafeHttpUrl("file:///etc/passwd"), false);
assert.equal(isSafeHttpUrl("ftp://example.com"), false);
assert.equal(isSafeHttpUrl("javascript:alert(1)"), false);
// 內網 / loopback / link-local
assert.equal(isSafeHttpUrl("http://localhost/x"), false);
assert.equal(isSafeHttpUrl("http://127.0.0.1/x"), false);
assert.equal(isSafeHttpUrl("http://10.0.0.5/x"), false);
assert.equal(isSafeHttpUrl("http://192.168.1.1/x"), false);
assert.equal(isSafeHttpUrl("http://172.16.0.1/x"), false);
assert.equal(isSafeHttpUrl("http://169.254.169.254/latest/meta-data"), false); // 雲端 metadata
assert.equal(isSafeHttpUrl("http://[::1]/x"), false);
assert.equal(isSafeHttpUrl("http://intranet/x"), false); // 純主機名
assert.equal(isSafeHttpUrl("http://printer.local/x"), false);
// 垃圾輸入
assert.equal(isSafeHttpUrl(""), false);
assert.equal(isSafeHttpUrl("not a url"), false);

console.log("✅ safeUrl verify passed");
```

- [ ] **Step 3: 跑斷言**

Run: `node scripts/__verify-safeurl.mjs`
Expected: `✅ safeUrl verify passed`

- [ ] **Step 4: Commit**

```bash
git add src/lib/safeUrl.js scripts/__verify-safeurl.mjs
git commit -m "feat(ai): safeUrl SSRF 判斷 helper + 斷言

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

## Task 2: `/api/ai/assist-block` 端點

**Files:**

- Create: `app/api/ai/assist-block/route.js`

依賴：Task 1（safeUrl）。沿用 `app/api/admin/enrich-tool/route.js`（auth）與 `app/api/refine-request/route.js`（rateLimit + Gemini）。

- [ ] **Step 1: 寫 route**

Create `app/api/ai/assist-block/route.js`:

```js
import { NextResponse } from "next/server";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { isSafeHttpUrl } from "@/lib/safeUrl";

/**
 * POST /api/ai/assist-block
 * 給 text block 編輯器的 AI 撰寫助理。potish/generate，部落格口吻。
 * Auth：Bearer idToken → Identity Toolkit → users/{uid}.role in [developer, admin]
 * Body：{ mode:'polish'|'generate', currentText?, instruction?, sourceUrl?, context? }
 * Returns：{ text }（markdown）
 */
export async function POST(request) {
  // ── rate limit（developer 可用，擋 Gemini 額度濫用）──
  const ip = clientIp(request);
  if (!rateLimit(`assist-block:${ip}`, { limit: 10, windowMs: 60000 }).ok) {
    return NextResponse.json(
      { error: "操作過於頻繁，請稍後再試" },
      { status: 429 },
    );
  }

  // ── auth：developer / admin ──
  const authHeader = request.headers.get("authorization");
  const idToken = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;
  if (!idToken) return NextResponse.json({ error: "未授權" }, { status: 401 });

  const verifyRes = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${process.env.FIREBASE_WEB_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    },
  );
  if (!verifyRes.ok)
    return NextResponse.json({ error: "未授權" }, { status: 401 });
  const verifyData = await verifyRes.json();
  const uid = verifyData.users?.[0]?.localId;
  if (!uid) return NextResponse.json({ error: "未授權" }, { status: 401 });

  const profileRes = await fetch(
    `https://firestore.googleapis.com/v1/projects/${process.env.FIREBASE_PROJECT_ID}/databases/(default)/documents/users/${uid}`,
    { headers: { Authorization: `Bearer ${idToken}` } },
  );
  if (!profileRes.ok)
    return NextResponse.json({ error: "無法驗證使用者權限" }, { status: 403 });
  const profileData = await profileRes.json();
  const role = profileData.fields?.role?.stringValue;
  if (role !== "admin" && role !== "developer") {
    return NextResponse.json(
      { error: "需要開發者或管理員權限" },
      { status: 403 },
    );
  }

  const key = process.env.GEMINI_API_KEY;
  if (!key)
    return NextResponse.json(
      { error: "伺服器未設定 Gemini API Key" },
      { status: 500 },
    );

  // ── 參數 ──
  const body = await request.json().catch(() => ({}));
  const mode = body.mode === "generate" ? "generate" : "polish";
  const currentText = String(body.currentText || "").slice(0, 6000);
  const instruction = String(body.instruction || "").slice(0, 6000);
  const sourceUrl = String(body.sourceUrl || "").trim();
  const context = body.context || {};

  // ── 來源抓取（generate + sourceUrl）：GitHub README 走白名單，其餘走 SSRF-guarded fetch ──
  let sourceText = "";
  if (mode === "generate" && sourceUrl) {
    const gh = sourceUrl.match(/github\.com\/([^/]+)\/([^/?#]+)/);
    if (gh) {
      try {
        const r = await fetch(
          `https://api.github.com/repos/${gh[1]}/${gh[2].replace(/\.git$/, "")}/readme`,
          {
            headers: {
              Accept: "application/vnd.github.raw+json",
              "User-Agent": "simhope-platform",
            },
          },
        );
        if (r.ok) sourceText = (await r.text()).slice(0, 6000);
      } catch {
        /* 抓不到就略過 */
      }
    } else if (isSafeHttpUrl(sourceUrl)) {
      try {
        const r = await fetch(sourceUrl, {
          headers: { "User-Agent": "simhope-platform" },
        });
        if (r.ok) sourceText = (await r.text()).slice(0, 6000);
      } catch {
        /* 抓不到就略過 */
      }
    }
    // 不安全 URL → 靜默不 fetch
  }

  // ── prompt ──
  const VOICE = `你是 SimHope 內部 AI 工具平台的內容撰寫助理。用親切、像在跟一般同仁解釋的「部落格口吻」寫——娓娓道來的內文，寫給非技術的一般讀者。避免：條列式技術 changelog 腔、整段粗體、堆砌 markdown 標記。適度用 ## 小標分段（2–4 段）讓人好讀；關鍵字才加粗；多用完整句子與生活化比喻。只輸出繁體中文 markdown 內文，前後不要加說明或 code fence。`;
  const ctx = `（工具背景：名稱「${context.title || ""}」、一句話介紹「${context.tagline || ""}」、類型「${context.type || ""}」）`;
  const task =
    mode === "polish"
      ? `請把下面這段內容潤飾成上述口吻，保留原意與事實，只改表達方式：\n\n${currentText}`
      : `請依下面指示撰寫內容${sourceText ? "（若附了來源內容，請據實摘要、不要編造）" : ""}：\n指示：${instruction}${sourceText ? `\n\n來源內容（節錄）：\n${sourceText}` : ""}`;

  // ── Gemini（純文字、限輸出長度）──
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            { role: "user", parts: [{ text: `${VOICE}\n${ctx}\n\n${task}` }] },
          ],
          generationConfig: { temperature: 0.7, maxOutputTokens: 1500 },
        }),
      },
    );
    if (!res.ok) {
      return NextResponse.json(
        { error: `AI 服務暫時無法使用 (${res.status})` },
        { status: 502 },
      );
    }
    const data = await res.json();
    const text = (data.candidates?.[0]?.content?.parts?.[0]?.text || "").trim();
    if (!text)
      return NextResponse.json(
        { error: "AI 沒有產生內容，請重試" },
        { status: 502 },
      );
    return NextResponse.json({ text });
  } catch (e) {
    console.error("/api/ai/assist-block 失敗：", e);
    return NextResponse.json(
      { error: "AI 輔助失敗，請稍後再試" },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 2: 語法 + lint + build**

Run: `node --check app/api/ai/assist-block/route.js` → 無輸出
Run: `npx eslint app/api/ai/assist-block/route.js` → 無 error
Run: `npm run build` → 成功（route 被編譯）

- [ ] **Step 3: Commit**

```bash
git add app/api/ai/assist-block/route.js
git commit -m "feat(ai): /api/ai/assist-block 端點（developer/admin、rateLimit、SSRF guard、Gemini）

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

## Task 3: `article` 切段 helper

**Files:**

- Create: `src/lib/article.js`
- Create: `scripts/__verify-article.mjs`

- [ ] **Step 1: 寫 helper**

Create `src/lib/article.js`:

```js
// src/lib/article.js
// 把 desc markdown 依 ## 標題切成 { lead, sections }。純函式、可 node 斷言。
// 限制（YAGNI）：不處理 code fence 內的 ##（desc 罕見含 code，naive 逐行掃即可）。

/**
 * @param {string} md
 * @returns {{ lead: string, sections: Array<{heading:string, body:string}> }}
 */
export function splitMarkdownSections(md) {
  const src = String(md || "").replace(/\r\n/g, "\n");
  const lines = src.split("\n");
  const lead = [];
  const sections = [];
  let cur = null; // { heading, bodyLines: [] }
  for (const line of lines) {
    // 精確錨定：行首兩個井號 + 空白 + 至少一個非空字元；### / #### 因 (?!#) 被排除
    const m = /^##(?!#)\s+(.+?)\s*$/.exec(line);
    if (m) {
      if (cur)
        sections.push({
          heading: cur.heading,
          body: cur.bodyLines.join("\n").trim(),
        });
      cur = { heading: m[1].trim(), bodyLines: [] };
    } else if (cur) {
      cur.bodyLines.push(line);
    } else {
      lead.push(line);
    }
  }
  if (cur)
    sections.push({
      heading: cur.heading,
      body: cur.bodyLines.join("\n").trim(),
    });
  return { lead: lead.join("\n").trim(), sections };
}
```

- [ ] **Step 2: 寫斷言（含邊界）**

Create `scripts/__verify-article.mjs`:

```js
// scripts/__verify-article.mjs — 純函式 sanity check
import assert from "node:assert";
import { splitMarkdownSections } from "../src/lib/article.js";

// 無 ## → 全進 lead（Pattern C fallback）
assert.deepEqual(splitMarkdownSections("**Before**：痛點\n**After**：改善"), {
  lead: "**Before**：痛點\n**After**：改善",
  sections: [],
});

// lead + 2 段
{
  const r = splitMarkdownSections(
    "開頭導言\n\n## 緣由\n內文A\n\n## 更新\n內文B",
  );
  assert.equal(r.lead, "開頭導言");
  assert.equal(r.sections.length, 2);
  assert.deepEqual(r.sections[0], { heading: "緣由", body: "內文A" });
  assert.deepEqual(r.sections[1], { heading: "更新", body: "內文B" });
}

// ### / # 不切段（留在 body / lead）
{
  const r = splitMarkdownSections("## 標題\n### 子標題\n內文\n# 大標也不切");
  assert.equal(r.sections.length, 1);
  assert.equal(r.sections[0].heading, "標題");
  assert.ok(r.sections[0].body.includes("### 子標題"));
  assert.ok(r.sections[0].body.includes("# 大標也不切"));
}

// 行中 ## 不切
{
  const r = splitMarkdownSections("一行 ## 不是標題");
  assert.equal(r.sections.length, 0);
  assert.equal(r.lead, "一行 ## 不是標題");
}

// 空 body 段落 → body ""
{
  const r = splitMarkdownSections("## A\n## B\n內容");
  assert.deepEqual(r.sections[0], { heading: "A", body: "" });
  assert.deepEqual(r.sections[1], { heading: "B", body: "內容" });
}

// CRLF 容錯
{
  const r = splitMarkdownSections("導言\r\n## 段\r\n內文\r\n");
  assert.equal(r.lead, "導言");
  assert.deepEqual(r.sections[0], { heading: "段", body: "內文" });
}

// 空輸入
assert.deepEqual(splitMarkdownSections(""), { lead: "", sections: [] });
assert.deepEqual(splitMarkdownSections(null), { lead: "", sections: [] });

console.log("✅ article verify passed");
```

- [ ] **Step 3: 跑斷言**

Run: `node scripts/__verify-article.mjs`
Expected: `✅ article verify passed`

- [ ] **Step 4: Commit**

```bash
git add src/lib/article.js scripts/__verify-article.mjs
git commit -m "feat(article): splitMarkdownSections 依 ## 切段 + 邊界斷言

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

## Task 4: 抽出並升級共用 `MarkdownContent`（文章 typography）

**Files:**

- Create: `src/components/MarkdownContent.jsx`
- Modify: `app/tool/[id]/page.jsx`（移除本地 `mdComponents`(行 75-126) + `MarkdownContent`(行 128-134)，改 import）

**Why:** `desc` 與 `text` block 都走 `MarkdownContent`。抽成共用模組 + 升級 typography（正常字重內文、乾淨加粗、✦ 清單），既達成排版目標、又讓 `ArticleDesc`（Task 5）能 import 同一套。

- [ ] **Step 1: 建共用模組（升級後 typography）**

Create `src/components/MarkdownContent.jsx`:

```jsx
"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// 文章級 typography（Phase 2.6）：正常字重內文、乾淨加粗（不換色）、✦ 清單、舒服行距。
// desc 與 text block 共用。
export const mdComponents = {
  h2: (props) => (
    <h2
      className="text-xl font-extrabold mt-7 mb-3 text-[var(--color-text-dark)]"
      {...props}
    />
  ),
  h3: (props) => (
    <h3
      className="text-lg font-bold mt-5 mb-2 text-[var(--color-text-dark)]"
      {...props}
    />
  ),
  ul: (props) => <ul className="flex flex-col gap-2 my-3" {...props} />,
  ol: (props) => (
    <ol className="list-decimal ml-5 flex flex-col gap-2 my-3" {...props} />
  ),
  li: (props) => (
    <li
      className="font-normal text-[var(--color-text-dark)] leading-[1.85] relative pl-5 before:content-['✦'] before:absolute before:left-0 before:top-0 before:text-[var(--color-clay-purple)] before:text-sm"
      {...props}
    />
  ),
  p: (props) => (
    <p
      className="font-normal text-[var(--color-text-dark)] leading-[1.9] text-[1.04rem] mb-4"
      {...props}
    />
  ),
  strong: (props) => (
    <strong className="font-bold text-[var(--color-text-dark)]" {...props} />
  ),
  code: ({ inline, ...props }) =>
    inline ? (
      <code
        className="bg-gray-100 dark:bg-gray-700 px-1 py-0.5 rounded text-[0.85em]"
        {...props}
      />
    ) : (
      <code
        className="block bg-gray-900 text-gray-100 p-3 rounded-lg text-sm font-mono overflow-x-auto"
        {...props}
      />
    ),
  a: (props) => (
    <a
      className="text-[var(--color-clay-blue)] underline hover:opacity-80"
      target="_blank"
      rel="noopener noreferrer"
      {...props}
    />
  ),
};

export default function MarkdownContent({ children }) {
  if (!children) return null;
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
      {children}
    </ReactMarkdown>
  );
}
```

> 註：`ol` 的編號清單沿用 list-decimal（不套 ✦，那是 `ul` 的）。`li` 的 ✦ 對 `ul` 與 `ol` 都會套到——若 `ol` 也出現 ✦ 不理想，實作時可把 `ul`/`ol` 用不同 li；但 desc/text 內容以 `-` 無序清單為主，先共用一個 li（YAGNI）。

- [ ] **Step 2: page.jsx 移除本地定義、改 import**

In `app/tool/[id]/page.jsx`:

(a) 在檔案頂部 import 區（`import remarkGfm from "remark-gfm";` 那一帶）後，加：

```jsx
import MarkdownContent from "@/components/MarkdownContent";
```

(b) **刪除**本地 `mdComponents` 整段（從 `// ─── Markdown 渲染 ───` 註解到 `const mdComponents = { ... };` 結束，約行 72-126）。

(c) **刪除**本地 `MarkdownContent` 函式（約行 128-134）：

```jsx
function MarkdownContent({ children }) {
  if (!children) return null;
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
      {children}
    </ReactMarkdown>
  );
}
```

(d) 若移除後 `ReactMarkdown` / `remarkGfm` import 在 page.jsx 已無其他使用 → 一併移除那兩個 import（用 `npx eslint` 的 no-unused-vars 確認）。

- [ ] **Step 3: build + lint**

Run: `npm run build` → 成功
Run: `npx eslint app/tool/[id]/page.jsx src/components/MarkdownContent.jsx` → 無 **新** error（page.jsx 既有 `react-hooks/set-state-in-effect` 與 `no-img-element` 是 pre-existing，不算）

- [ ] **Step 4: Commit**

```bash
git add src/components/MarkdownContent.jsx "app/tool/[id]/page.jsx"
git commit -m "refactor(detail): 抽出共用 MarkdownContent + 升級文章 typography

正常字重內文、乾淨加粗（不換色）、✦ 清單、舒服行距；desc 與 text block 共用.

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

## Task 5: `ArticleDesc` + 接進 DetailTab

**Files:**

- Create: `src/components/ArticleDesc.jsx`
- Modify: `app/tool/[id]/page.jsx`（`DetailTab` desc 段、約行 835-839；加 import）

依賴：Task 3（article.js）、Task 4（共用 MarkdownContent）。

- [ ] **Step 1: 寫元件**

Create `src/components/ArticleDesc.jsx`:

```jsx
"use client";

import { splitMarkdownSections } from "@/lib/article";
import MarkdownContent from "@/components/MarkdownContent";

/**
 * desc 文章式呈現：lead 導言 + 依 ## 細線分隔的編號段落（容器 B）。
 * 無 ## 的短文案 → 只渲染 lead（單段文章 body）。
 * @param {{ desc: string }} props
 */
export default function ArticleDesc({ desc }) {
  if (!desc) return null;
  const { lead, sections } = splitMarkdownSections(desc);

  return (
    <div className="flex flex-col max-w-none">
      {lead && (
        <div className="[&_p]:text-[1.08rem] [&_p]:leading-[1.9] [&_p]:text-[var(--color-text-mid)] mb-2">
          <MarkdownContent>{lead}</MarkdownContent>
        </div>
      )}
      {sections.map((s, i) => (
        <section
          key={i}
          className={`py-6 ${
            i > 0 || lead ? "border-t border-[var(--color-card-border)]" : ""
          }`}
        >
          <div className="text-xs font-extrabold tracking-[0.14em] text-[var(--color-clay-purple)] mb-1">
            {String(i + 1).padStart(2, "0")}
          </div>
          <h3 className="text-lg font-extrabold text-[var(--color-text-dark)] mb-3">
            {s.heading}
          </h3>
          {s.body && <MarkdownContent>{s.body}</MarkdownContent>}
        </section>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: 接進 DetailTab**

In `app/tool/[id]/page.jsx`:

(a) import 區加：

```jsx
import ArticleDesc from "@/components/ArticleDesc";
```

(b) `DetailTab` 內，找：

```jsx
{
  tool.desc && (
    <div className="max-w-none">
      <MarkdownContent>{tool.desc}</MarkdownContent>
    </div>
  );
}
```

換成：

```jsx
{
  tool.desc && <ArticleDesc desc={tool.desc} />;
}
```

- [ ] **Step 3: build + lint**

Run: `npm run build` → 成功
Run: `npx eslint src/components/ArticleDesc.jsx "app/tool/[id]/page.jsx"` → 無新 error

- [ ] **Step 4: Commit**

```bash
git add src/components/ArticleDesc.jsx "app/tool/[id]/page.jsx"
git commit -m "feat(article): ArticleDesc 文章式 desc（lead + 細線分隔編號段）接進 DetailTab

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

## Task 6: `AiAssist` 元件 + 接進 BlockEditor

**Files:**

- Create: `src/components/AiAssist.jsx`
- Modify: `app/tool/[id]/page.jsx`（`BlockEditor` text 分支、signature、呼叫處）

依賴：Task 2（端點）。沿用 `useAuth`（page.jsx 已 import 自 `@/context/AuthContext`）。

- [ ] **Step 1: 寫元件**

Create `src/components/AiAssist.jsx`:

```jsx
"use client";

import { useState } from "react";
import { useAuth } from "@/context/AuthContext";

/**
 * text block 的 AI 撰寫面板（受控）。潤飾現有 / 依指示生成 → 預覽 → 採用才覆寫。
 * @param {{ value: string, onAccept: (text:string)=>void, context?: object }} props
 */
export default function AiAssist({ value, onAccept, context = {} }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState("");

  const run = async (mode) => {
    if (!user) {
      setError("請先登入");
      return;
    }
    setLoading(true);
    setError("");
    setPreview(null);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/ai/assist-block", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          mode,
          currentText: value || "",
          instruction,
          sourceUrl,
          context,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "AI 失敗，請稍後再試");
        return;
      }
      setPreview(data.text || "");
    } catch {
      setError("AI 失敗，請稍後再試");
    } finally {
      setLoading(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="self-start text-xs font-bold text-[var(--color-clay-purple)] border border-[var(--color-clay-purple)]/30 rounded-full px-3 py-1.5 hover:bg-[var(--color-clay-purple)]/5"
      >
        ✨ AI 輔助
      </button>
    );
  }

  return (
    <div className="border border-[var(--color-clay-purple)]/30 rounded-xl p-3 flex flex-col gap-2 bg-[var(--color-clay-purple)]/5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-extrabold text-[var(--color-clay-purple)]">
          ✨ AI 輔助撰寫（部落格口吻）
        </span>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setPreview(null);
            setError("");
          }}
          className="text-xs text-[var(--color-text-mid)] hover:text-[var(--color-text-dark)]"
          aria-label="關閉 AI 面板"
        >
          ✕
        </button>
      </div>
      <input
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
        placeholder="要 AI 幫你做什麼？例如：用部落格口吻介紹這個版本"
        className="bg-[var(--color-card-bg)] text-[var(--color-text-dark)] border border-[var(--color-card-border)] rounded-lg px-2 py-1.5 text-sm outline-none focus:border-[var(--color-clay-purple)]"
      />
      <input
        value={sourceUrl}
        onChange={(e) => setSourceUrl(e.target.value)}
        placeholder="可選：貼 GitHub README / 文件連結，AI 會讀內容"
        className="bg-[var(--color-card-bg)] text-[var(--color-text-dark)] border border-[var(--color-card-border)] rounded-lg px-2 py-1.5 text-sm font-mono outline-none focus:border-[var(--color-clay-purple)]"
      />
      <div className="flex gap-2 flex-wrap">
        <button
          type="button"
          disabled={loading}
          onClick={() => run("polish")}
          className="text-xs font-bold rounded-full px-3 py-1.5 bg-[var(--color-clay-purple)]/10 text-[var(--color-clay-purple)] border border-[var(--color-clay-purple)]/30 disabled:opacity-50"
        >
          {loading ? "AI 思考中…" : "✨ 潤飾現有內容"}
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={() => run("generate")}
          className="text-xs font-bold rounded-full px-3 py-1.5 bg-[var(--color-clay-purple)] text-white disabled:opacity-50"
        >
          {loading ? "AI 思考中…" : "✨ 依指示生成"}
        </button>
      </div>
      {error && <p className="text-xs text-red-500 font-bold">{error}</p>}
      {preview !== null && (
        <div className="flex flex-col gap-2">
          <div className="text-xs font-bold text-[var(--color-text-mid)]">
            預覽（按「採用」才會填入）：
          </div>
          <pre className="bg-[var(--color-card-bg)] border border-[var(--color-card-border)] rounded-lg p-2 text-sm whitespace-pre-wrap max-h-48 overflow-y-auto text-[var(--color-text-dark)]">
            {preview}
          </pre>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                onAccept(preview);
                setOpen(false);
                setPreview(null);
              }}
              className="text-xs font-bold rounded-full px-3 py-1.5 bg-green-500 text-white hover:bg-green-600"
            >
              採用
            </button>
            <button
              type="button"
              onClick={() => setPreview(null)}
              className="text-xs font-bold rounded-full px-3 py-1.5 bg-gray-200 text-gray-700 hover:bg-gray-300"
            >
              重來
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: BlockEditor 接線**

In `app/tool/[id]/page.jsx`:

(a) import 區加：

```jsx
import AiAssist from "@/components/AiAssist";
```

(b) `BlockEditor` 函式 signature 加 `context`。找：

```jsx
function BlockEditor({ block, idx, total, onChange, onDelete, onMove }) {
```

換成：

```jsx
function BlockEditor({ block, idx, total, onChange, onDelete, onMove, context }) {
```

(c) text 分支內，找 hint `<p>`：

```jsx
{
  block.type === "text" && (
    <p className="text-xs font-bold text-[var(--color-text-mid)]">
      支援 **粗體**、*斜體*、## 標題、- 清單、`程式碼`
    </p>
  );
}
```

在它**後面**插入（只給 text 用）：

```jsx
{
  block.type === "text" && (
    <AiAssist
      value={block.content}
      onAccept={(t) => onChange({ ...block, content: t })}
      context={context}
    />
  );
}
```

(d) `BlockEditor` 呼叫處（編輯模式 map），找：

```jsx
{
  localBlocks.map((block, idx) => (
    <BlockEditor
      key={block.id}
      block={block}
      idx={idx}
      total={localBlocks.length}
      onChange={(updated) => updateBlock(idx, updated)}
      onDelete={() => deleteBlock(idx)}
      onMove={moveBlock}
    />
  ));
}
```

在 `onMove={moveBlock}` 後加 `context`：

```jsx
{
  localBlocks.map((block, idx) => (
    <BlockEditor
      key={block.id}
      block={block}
      idx={idx}
      total={localBlocks.length}
      onChange={(updated) => updateBlock(idx, updated)}
      onDelete={() => deleteBlock(idx)}
      onMove={moveBlock}
      context={{
        title: tool.title,
        tagline: tool.tagline,
        type: tool.type,
      }}
    />
  ));
}
```

- [ ] **Step 3: build + lint**

Run: `npm run build` → 成功
Run: `npx eslint src/components/AiAssist.jsx "app/tool/[id]/page.jsx"` → 無新 error

- [ ] **Step 4: Commit**

```bash
git add src/components/AiAssist.jsx "app/tool/[id]/page.jsx"
git commit -m "feat(ai): AiAssist 面板接進 text block 編輯器（潤飾/生成、預覽再採用）

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

## Task 7: 全量驗證 + PR

**Files:** 無（驗證 + 整合）

- [ ] **Step 1: 全部斷言 + build + lint**

```bash
node scripts/__verify-safeurl.mjs   # ✅ safeUrl verify passed
node scripts/__verify-article.mjs   # ✅ article verify passed
node scripts/__verify-versions.mjs  # ✅ versions verify passed（2.5 既有，確認沒被波及）
node scripts/__verify-taxonomy.mjs  # ✅ taxonomy verify passed
npm run build                       # 成功
npm run lint                        # 只剩 pre-existing（ThemeProvider/page.jsx set-state-in-effect + img + root scratch parse error）
```

- [ ] **Step 2: 準備一個含 `##` 的測試 desc（驗分段路徑）**

現有 desc 全是 Pattern C（無 `##`），分段 UI 看不到。`npm run dev`，登入 admin，任挑一個工具進編輯模式或後台 wizard，把 desc 暫時改成含 `##` 的內容（例如 mock v2 的 SimHope 工具箱介紹），存檔後在詳情頁「詳細說明」tab 驗證：

- lead 導言（## 前那段）較大、柔和。
- 每個 `##` 一段，段間細線分隔、左上有 `01`/`02` 編號 + 標題。
- 強調是乾淨加粗（不換色）。
- 驗完可改回原 desc（或保留為示範）。

- [ ] **Step 3: 驗 Pattern C 舊 desc + text block typography**

開一個 desc 是 `**Before**`/`**After**` 的舊工具：

- desc 單段呈現、Before/After 在乾淨加粗下仍讀得出結構。
- 該頁若有 `text` block → 內文是正常字重、✦ 清單、乾淨加粗（不再整片粗體）。
- tip/warning/steps/faq/圖片/影片 **無迴歸**。

- [ ] **Step 4: 驗 AI 鈕（需登入 admin/developer）**

編輯模式新增一個 `text` block → 點「✨ AI 輔助」：

- 輸入指示 → 「依指示生成」→ 預覽出現部落格口吻內容 → 「採用」填入 textarea → 存檔。
- 「潤飾現有內容」對既有文字可用。
- 貼一個 GitHub README 連結 → 生成有讀到內容。
- （SSRF）貼 `http://127.0.0.1/` 當來源 → 後端靜默忽略、不 fetch（不報錯、靠指示生成）。
- 未登入 / 非 developer/admin → 端點 401/403（前端面板紅字、不卡死）。

- [ ] **Step 5: 截圖給 Jason（UI 改動先 preview 確認再 merge）**

依慣例：把「文章式 desc（含 ## 分段 + Pattern C 單段）」「text block 新字重」「AI 面板（指示/預覽/採用）」截圖給 Jason 拍板。可用本機 dev 或推 branch 觸發 Vercel preview（preview 的 auth-gated 編輯要用本機 localhost 驗，見 spec 風險）。

- [ ] **Step 6: 開 PR**

```bash
git push -u origin feature-hub-phase2.6
gh pr create --base main --head feature-hub-phase2.6 \
  --title "feat(hub): Phase 2.6 AI 輔助撰寫鈕 + 文章式閱讀排版" \
  --body "見 docs/superpowers/specs/2026-06-06-simhope-hub-phase2.6-ai-assist-and-article-typography-design.md。

Part A：text block「✨ AI」鈕（部落格口吻潤飾/生成，預覽再採用）+ /api/ai/assist-block（developer/admin、rateLimit、SSRF guard、Gemini maxOutputTokens）。
Part B：抽共用 MarkdownContent + 升級文章 typography（正常字重內文、乾淨加粗、✦ 清單）；ArticleDesc 把 desc 依 ## 切成 lead + 細線分隔編號段。

firestore.rules 不需改、不用 Console 發布；無 migration。
驗證：safeUrl/article node 斷言、build/lint、preview 目視（含 ## 分段 + Pattern C + AI 面板）。

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

---

## Self-Review（plan vs spec）

**Spec coverage：**

- Part A.1 範圍（text block only）→ Task 6 step 2c（`block.type === "text"` gate）。
- Part A.2 UX（指示/來源/潤飾/生成/預覽/採用/取消/失敗不卡死）→ Task 6 step 1（AiAssist）。
- Part A.3 元件（context、useAuth、整段覆寫）→ Task 6。
- Part A.4 後端（gating developer/admin、rateLimit、SSRF、GitHub/受限 fetch、Gemini 純文字 maxOutputTokens、env）→ Task 1（safeUrl）+ Task 2（route）。
- Part B.1 mdComponents 升級 → Task 4。
- Part B.2 splitMarkdownSections + 邊界斷言 → Task 3。
- Part B.3 ArticleDesc（lead + 細線分隔編號、空 body 不出）→ Task 5。
- Part B.4 接 DetailTab → Task 5 step 2。
- 風險（mdComponents 範圍、Pattern C、AI 安全）→ Task 7 驗收步驟逐項。
- 驗收標準 → Task 7。

**Placeholder scan：** 無 TBD/TODO；所有 code step 皆完整碼或精確 old→new。

**Type consistency：** `isSafeHttpUrl`(Task1/2)、`splitMarkdownSections`→`{lead,sections:[{heading,body}]}`(Task3/5)、`MarkdownContent` default export(Task4/5)、`mdComponents` named export(Task4)、`AiAssist {value,onAccept,context}`(Task6)、端點 body `{mode,currentText,instruction,sourceUrl,context}`(Task2/6 一致)。
