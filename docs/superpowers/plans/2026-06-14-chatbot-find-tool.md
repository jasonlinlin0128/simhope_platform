# Chatbot 找工具助理 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把現有「誠實版」ChatbotWidget 升級成單次語意找工具——使用者描述需求 → Gemini 從目錄挑相符工具（grounding 防幻覺）→ 卡片 + 一句回應；找不到引導提需求。

**Architecture:** 純函式 `findTool.mjs`（組 prompt + 驗證 Gemini 回傳的 id 都真實存在）→ 新 route `POST /api/find-tool`（匿名 + IP 限流 → 讀公開目錄 → callGemini json → 驗證 → 回 {reply, tools}）→ ChatbotWidget 加輸入框/結果區。沿用既有 **免費 tier** Gemini，不引入付費 API。

**Tech Stack:** Next.js 16 App Router (route handler), React 19 (client component), Firestore REST (getServerCatalog), Gemini free tier (callGemini), Tailwind 4, ESM, `node --test`。

**Spec:** `docs/superpowers/specs/2026-06-14-chatbot-find-tool-design.md`

**驗證指令**

- 單元測試：`npm run test:unit`
- Lint：`npm run lint`
- Build：`npm run build`（若失敗訊息只有 `fonts.gstatic.com` / "Failed to fetch" 屬本機網路 flake，重跑即可，最多 2 次）

---

## File Structure

- `src/lib/findTool.mjs`（新）— `buildFindToolPrompt` + `validateToolMatches` 純函式
- `src/lib/findTool.test.mjs`（新）— 測試
- `app/api/find-tool/route.js`（新）— 匿名 + 限流 + Gemini + 驗證
- `src/components/ChatbotWidget.jsx`（改）— 加輸入框 / 結果區 / 無結果 fallback

---

## Task 1: `findTool.mjs` 純函式（prompt 組裝 + id 驗證）

**Files:**

- Create: `src/lib/findTool.mjs`
- Test: `src/lib/findTool.test.mjs`

- [ ] **Step 1: 寫測試（先紅）** — 建立 `src/lib/findTool.test.mjs`：

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildFindToolPrompt, validateToolMatches } from "./findTool.mjs";

const TOOLS = [
  {
    id: "pdf",
    title: "PDF 工具箱",
    tagline: "合併拆分 PDF",
    scenarios: ["文件"],
    tags: ["pdf", "合併"],
  },
  {
    id: "trans",
    title: "現場翻譯",
    tagline: "產線術語翻譯",
    scenarios: ["產線"],
    tags: ["翻譯"],
  },
];

// ---- buildFindToolPrompt ----
test("buildFindToolPrompt：含使用者 query", () => {
  const p = buildFindToolPrompt("我要合併 PDF", TOOLS);
  assert.ok(p.includes("我要合併 PDF"));
});

test("buildFindToolPrompt：列出每個工具的 id 與 title", () => {
  const p = buildFindToolPrompt("x", TOOLS);
  assert.ok(p.includes("pdf") && p.includes("PDF 工具箱"));
  assert.ok(p.includes("trans") && p.includes("現場翻譯"));
});

test("buildFindToolPrompt：含「不可編造」與 JSON schema 指示", () => {
  const p = buildFindToolPrompt("x", TOOLS);
  assert.ok(p.includes("不可編造"));
  assert.ok(p.includes("toolIds") && p.includes("reply"));
});

// ---- validateToolMatches ----
test("validateToolMatches：保留存在的 id、回完整工具物件", () => {
  const out = validateToolMatches({ toolIds: ["pdf"], reply: "找到了" }, TOOLS);
  assert.equal(out.reply, "找到了");
  assert.deepEqual(
    out.tools.map((t) => t.id),
    ["pdf"],
  );
});

test("validateToolMatches：濾掉不存在（幻覺）的 id", () => {
  const out = validateToolMatches(
    { toolIds: ["ghost", "trans"], reply: "r" },
    TOOLS,
  );
  assert.deepEqual(
    out.tools.map((t) => t.id),
    ["trans"],
  );
});

test("validateToolMatches：去重 + 截上限", () => {
  const out = validateToolMatches(
    { toolIds: ["pdf", "pdf", "trans"], reply: "r" },
    TOOLS,
    1,
  );
  assert.deepEqual(
    out.tools.map((t) => t.id),
    ["pdf"],
  );
});

test("validateToolMatches：空 toolIds → tools 空 + 無結果 reply", () => {
  const out = validateToolMatches({ toolIds: [], reply: "" }, TOOLS);
  assert.deepEqual(out.tools, []);
  assert.ok(out.reply.includes("沒有現成"));
});

test("validateToolMatches：有結果但 reply 空 → 給通用 reply", () => {
  const out = validateToolMatches({ toolIds: ["pdf"], reply: "" }, TOOLS);
  assert.deepEqual(
    out.tools.map((t) => t.id),
    ["pdf"],
  );
  assert.ok(out.reply.length > 0);
});

test("validateToolMatches：壞輸入（null / 缺欄位）安全退化", () => {
  assert.deepEqual(validateToolMatches(null, TOOLS).tools, []);
  assert.deepEqual(validateToolMatches({}, TOOLS).tools, []);
  assert.deepEqual(validateToolMatches({ toolIds: "x" }, TOOLS).tools, []);
  assert.deepEqual(validateToolMatches({ toolIds: ["pdf"] }, null).tools, []);
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `node --test src/lib/findTool.test.mjs`
Expected: FAIL（`Cannot find module './findTool.mjs'`）

- [ ] **Step 3: 寫實作** — 建立 `src/lib/findTool.mjs`：

```js
// src/lib/findTool.mjs
// 找工具助理的純邏輯：組 Gemini prompt + 驗證回傳。無 firebase/browser 依賴，可 node:test。

/**
 * 組「從目錄挑相符工具」的 Gemini prompt。
 * @param {string} query  使用者需求
 * @param {Array<{id:string,title:string,tagline?:string,scenarios?:string[],tags?:string[]}>} tools 精簡工具清單
 * @returns {string}
 */
export function buildFindToolPrompt(query, tools) {
  const list = (tools || [])
    .map((t) => {
      const scen = Array.isArray(t.scenarios) ? t.scenarios.join("、") : "";
      const tags = Array.isArray(t.tags) ? t.tags.join("、") : "";
      return `- id:${t.id} | ${t.title}：${t.tagline || ""}${scen ? `（場景：${scen}）` : ""}${tags ? `（關鍵字：${tags}）` : ""}`;
    })
    .join("\n");
  return `你是 SimHope 內部工具平台的「找工具助理」。使用者描述一個工作需求，請從下面「工具清單」挑出最相符的（最多 4 個）。

規則：
- 只能挑清單裡真實存在的工具，只回它們的 id；絕對不可編造不存在的 id。
- 依相符程度由高到低排序；沒有夠相符的就回空陣列。
- reply 用一句繁體中文：有結果時像「這幾個應該能幫到你」；沒結果時誠實說「目前沒有現成的工具完全符合」。
- 固定輸出純 JSON（不要 markdown code fence），schema：
{ "toolIds": ["id1", "id2"], "reply": "一句話" }

工具清單：
${list}

使用者需求：${query}`;
}

/**
 * 驗證 Gemini 回傳：只留「確實存在於 catalog」的 id、去重、截上限，帶出 reply。
 * 任何壞輸入都安全退化（tools=[]、reply 給通用字串）。
 * @param {{toolIds?:unknown, reply?:unknown}} geminiResult
 * @param {object[]} catalog  完整工具物件（需有 id）
 * @param {number} [limit=4]
 * @returns {{reply:string, tools:object[]}}
 */
export function validateToolMatches(geminiResult, catalog = [], limit = 4) {
  const byId = new Map((catalog || []).map((t) => [t.id, t]));
  const rawIds = Array.isArray(geminiResult?.toolIds)
    ? geminiResult.toolIds
    : [];
  const seen = new Set();
  const tools = [];
  for (const id of rawIds) {
    if (tools.length >= limit) break;
    if (byId.has(id) && !seen.has(id)) {
      seen.add(id);
      tools.push(byId.get(id));
    }
  }
  const rawReply = geminiResult?.reply;
  const reply =
    typeof rawReply === "string" && rawReply.trim()
      ? rawReply.trim()
      : tools.length
        ? "這幾個應該能幫到你："
        : "目前沒有現成的工具完全符合，要不要把需求告訴經企室？";
  return { reply, tools };
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `node --test src/lib/findTool.test.mjs`
Expected: PASS（全部 9 個）

- [ ] **Step 5: Commit**

```bash
git add src/lib/findTool.mjs src/lib/findTool.test.mjs
git commit -m "feat(find-tool): findTool 純函式（prompt 組裝 + id grounding 驗證）

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

## Task 2: `POST /api/find-tool` route

**Files:**

- Create: `app/api/find-tool/route.js`

無純單元測試（Admin/外部呼叫）；以 `node --check` + build 驗證。比照 `app/api/refine-request/route.js` 的匿名 + 限流 + callGemini + handleApiError 範式。

- [ ] **Step 1: 建立 route** — 建立 `app/api/find-tool/route.js`：

```js
import { NextResponse } from "next/server";
import { callGemini } from "@/lib/gemini.mjs";
import { HttpError, handleApiError } from "@/lib/apiError.mjs";
import { rateLimit, clientIp } from "@/lib/rateLimit.mjs";
import { getServerCatalog } from "@/lib/serverCatalog";
import { buildFindToolPrompt, validateToolMatches } from "@/lib/findTool.mjs";

const FIND_STATUSES = ["live", "beta", "new"];

/**
 * POST /api/find-tool — 語意找工具（匿名）。
 * per-IP 限流 → 讀公開目錄(篩 live/beta/new) → Gemini JSON → 驗證 id grounding → {reply, tools}。
 */
export async function POST(request) {
  try {
    const ip = clientIp(request);
    if (!rateLimit(`find-tool:${ip}`, { limit: 10, windowMs: 60000 }).ok)
      throw new HttpError(429, "操作過於頻繁，請稍後再試");

    const body = await request.json().catch(() => ({}));
    const query = String(body.query || "")
      .slice(0, 500)
      .trim();
    if (!query) throw new HttpError(400, "請描述你想做的事");

    const catalog = (await getServerCatalog()).filter((t) =>
      FIND_STATUSES.includes(t.status),
    );
    const compact = catalog.map((t) => ({
      id: t.id,
      title: t.title,
      tagline: t.tagline,
      scenarios: t.scenarios,
      tags: t.tags,
    }));

    const parsed = await callGemini({
      prompt: buildFindToolPrompt(query, compact),
      json: true,
      temperature: 0.3,
      timeoutMs: 10000,
    });
    const { reply, tools } = validateToolMatches(parsed, catalog, 4);
    return NextResponse.json({ reply, tools });
  } catch (e) {
    return handleApiError(e, "/api/find-tool");
  }
}
```

- [ ] **Step 2: 語法檢查**

Run: `node --check app/api/find-tool/route.js`
Expected: 無輸出（通過）

- [ ] **Step 3: Commit**

```bash
git add app/api/find-tool/route.js
git commit -m "feat(find-tool): POST /api/find-tool（匿名+限流+Gemini+grounding）

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

## Task 3: ChatbotWidget 加找工具輸入框 + 結果

**Files:**

- Modify: `src/components/ChatbotWidget.jsx`（整檔替換）

- [ ] **Step 1: 整檔替換** — 把 `src/components/ChatbotWidget.jsx` 全部內容換成：

```jsx
"use client";

import { useState } from "react";
import Link from "next/link";
import RequestCard from "@/components/RequestCard";
import ToolCard from "@/components/ToolCard";
import { track } from "@/lib/track";
import { INPUT_BOX } from "@/lib/uiClasses";

/**
 * 右下角浮動「需要幫忙?」入口。
 * 主功能：語意找工具（打需求 → /api/find-tool → 卡片 + 一句回應）；
 * 找不到 / 備援：找現有工具(/hub)、提需求(RequestCard)。
 */
export default function ChatbotWidget() {
  const [open, setOpen] = useState(false);
  const [showReq, setShowReq] = useState(false);
  const [query, setQuery] = useState("");
  const [finding, setFinding] = useState(false);
  const [result, setResult] = useState(null); // { reply, tools } | null
  const [findErr, setFindErr] = useState("");

  const runFind = async (e) => {
    e?.preventDefault();
    const q = query.trim();
    if (!q) return;
    setFindErr("");
    setFinding(true);
    setResult(null);
    try {
      track("search");
      const res = await fetch("/api/find-tool", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "找工具失敗");
      setResult({
        reply: data.reply || "",
        tools: Array.isArray(data.tools) ? data.tools : [],
      });
    } catch (err) {
      setFindErr(err.message || "找工具失敗，請稍後再試");
    } finally {
      setFinding(false);
    }
  };

  const openRequest = () => {
    setShowReq(true);
    setOpen(false);
  };

  return (
    <>
      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
        {open && (
          <div className="w-80 bg-white dark:bg-gray-900 rounded-2xl shadow-[0_16px_48px_rgba(0,0,0,0.18)] border border-gray-100 dark:border-gray-700 flex flex-col overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-violet-500 to-blue-500">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-lg">
                💬
              </div>
              <div className="flex-1">
                <div className="font-extrabold text-white text-sm leading-tight">
                  需要幫忙?
                </div>
                <div className="text-white/70 text-xs">
                  描述你想做的事，幫你找現成工具
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                aria-label="關閉"
                className="text-white/80 hover:text-white text-lg leading-none"
              >
                ✕
              </button>
            </div>

            <div className="p-4 flex flex-col gap-3">
              {/* 找工具輸入 */}
              <form onSubmit={runFind} className="flex gap-2">
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="描述你想做的事，例：把 PDF 合併…"
                  aria-label="描述你想做的事"
                  className={`flex-1 ${INPUT_BOX} px-3 py-2 text-sm outline-none focus:border-[var(--color-clay-purple)]`}
                />
                <button
                  type="submit"
                  disabled={finding}
                  className="px-3 py-2 rounded-lg bg-[var(--color-clay-purple)] text-white font-extrabold text-sm disabled:opacity-60"
                >
                  {finding ? "…" : "找"}
                </button>
              </form>

              {/* 結果 */}
              {findErr && (
                <p className="text-xs text-red-500 font-bold">{findErr}</p>
              )}
              {result && (
                <div className="flex flex-col gap-2">
                  <p className="text-sm font-bold text-[var(--color-text-dark)]">
                    {result.reply}
                  </p>
                  {result.tools.length > 0 ? (
                    <div className="flex flex-col gap-2 max-h-72 overflow-y-auto">
                      {result.tools.map((t) => (
                        <ToolCard key={t.id} tool={t} />
                      ))}
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={openRequest}
                      className="self-start text-sm font-bold text-[var(--color-clay-purple)] underline"
                    >
                      → 提需求給經企室
                    </button>
                  )}
                </div>
              )}

              <div className="h-px bg-[var(--color-card-border)]" />

              {/* 備援動作 */}
              <Link
                href="/hub"
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 px-4 py-3 rounded-xl border border-[var(--color-card-border)] bg-[var(--color-card-bg)] hover:border-[var(--color-clay-purple)] transition font-bold text-sm text-[var(--color-text-dark)]"
              >
                <span className="text-xl">🔍</span>
                <span className="flex flex-col">
                  瀏覽全部工具
                  <span className="text-xs font-semibold text-[var(--color-text-mid)]">
                    到資源中心搜尋
                  </span>
                </span>
              </Link>
              <button
                type="button"
                onClick={openRequest}
                className="flex items-center gap-3 px-4 py-3 rounded-xl border border-[var(--color-card-border)] bg-[var(--color-card-bg)] hover:border-[var(--color-clay-purple)] transition font-bold text-sm text-[var(--color-text-dark)] text-left"
              >
                <span className="text-xl">💬</span>
                <span className="flex flex-col">
                  提需求給經企室
                  <span className="text-xs font-semibold text-[var(--color-text-mid)]">
                    沒有現成的？說說你的需求
                  </span>
                </span>
              </button>
            </div>
          </div>
        )}

        {/* 浮鈕 */}
        <button
          onClick={() => setOpen((o) => !o)}
          aria-label="需要幫忙?"
          className="w-14 h-14 rounded-full bg-gradient-to-br from-violet-500 to-blue-500 text-white text-2xl flex items-center justify-center shadow-[0_8px_24px_rgba(139,92,246,0.5)] hover:scale-110 hover:shadow-[0_12px_32px_rgba(139,92,246,0.65)] transition-all"
        >
          {open ? "✕" : "💬"}
        </button>
      </div>

      {showReq && <RequestCard onClose={() => setShowReq(false)} />}
    </>
  );
}
```

- [ ] **Step 2: Build + Lint**

Run: `npm run lint`
Expected: 0 errors（既有 2 個 `<img>` warning 不算）

Run: `npm run build`
Expected: `✓ Compiled successfully`（font-flake 則重跑）

- [ ] **Step 3: Commit**

```bash
git add src/components/ChatbotWidget.jsx
git commit -m "feat(chatbot): ChatbotWidget 加語意找工具（輸入→卡片+回應，找不到引導提需求）

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

## Task 4: 全量驗證

- [ ] **Step 1: 單元測試**

Run: `npm run test:unit`
Expected: 全綠（在原 86 基礎上 +9 findTool = 95 上下；以實際輸出為準、0 fail）

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: 0 errors

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: `✓ Compiled successfully`（`/api/find-tool` 出現在 route 清單）

- [ ] **Step 4: 收尾** — 確認 `git status` 乾淨；推 branch、開 PR。PR 說明標註：**沿用既有免費 tier Gemini、無新付費 API、無 rules/資料/SA → merge 即部署**；部署後 Jason 驗：①打「PDF 合併」「翻譯」等 query → 回相符工具卡 + 一句回應；②打目錄沒有的需求 → 誠實回應 + 提需求；③（可選）Gemini 失敗 → 友善錯誤。

---

## 範圍外（路線圖）

多輪對話、每工具推薦理由、搜尋歷史、點擊回饋學習。
