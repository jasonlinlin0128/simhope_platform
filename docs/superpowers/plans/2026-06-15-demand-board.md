# 需求看板（AI 主題分群）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** admin 後台新分頁「💡 需求看板」，點「分析需求」用 Gemini 把待處理 feature 需求分群成主題（主題名 / AI 歸納筆數 / 代表例句）+ 真實總數。

**Architecture:** 純函式 `demandBoard.mjs`（組 prompt + 清理 Gemini 回傳）→ admin-only route `POST /api/analyze-demand`（requireRole admin → Admin SDK 讀 pending feature 需求 → callGemini → normalize）→ `DemandBoard.jsx`（按鈕帶 admin Bearer）→ admin 分頁。沿用既有免費 Gemini，零付費、零 rules 變更。

**Tech Stack:** Next.js 16 App Router (route handler), React 19 (client component), Firebase Admin SDK (read requests), Gemini free tier (callGemini), Tailwind 4, ESM, `node --test`。

**Spec:** `docs/superpowers/specs/2026-06-15-demand-board-design.md`

**驗證指令**

- 單元測試：`npm run test:unit`
- Lint：`npm run lint`
- Build：`npm run build`（若失敗訊息只有 `fonts.gstatic.com` / "Failed to fetch" 屬本機網路 flake，重跑即可，最多 2 次）

---

## File Structure

- `src/lib/demandBoard.mjs`（新）— `buildDemandPrompt` + `normalizeThemes` 純函式
- `src/lib/demandBoard.test.mjs`（新）— 測試
- `app/api/analyze-demand/route.js`（新）— admin-only + 限流 + 讀需求 + Gemini
- `src/components/DemandBoard.jsx`（新）— 看板 UI
- `app/admin/page.jsx`（改）— 加分頁

---

## Task 1: `demandBoard.mjs` 純函式（TDD）

**Files:**

- Create: `src/lib/demandBoard.mjs`
- Test: `src/lib/demandBoard.test.mjs`

- [ ] **Step 1: 寫測試（先紅）** — 建立 `src/lib/demandBoard.test.mjs`：

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDemandPrompt, normalizeThemes } from "./demandBoard.mjs";

test("buildDemandPrompt：含每筆需求文字", () => {
  const p = buildDemandPrompt(["要 PDF 合併", "要翻譯產線術語"]);
  assert.ok(p.includes("要 PDF 合併"));
  assert.ok(p.includes("要翻譯產線術語"));
});

test("buildDemandPrompt：含「不可編造」與 JSON/themes 指示", () => {
  const p = buildDemandPrompt(["x"]);
  assert.ok(p.includes("不可編造"));
  assert.ok(p.includes("themes"));
});

test("normalizeThemes：正常 → 回 themes（theme/count/examples）", () => {
  const out = normalizeThemes({
    themes: [{ theme: "文件處理", count: 3, examples: ["合併 PDF"] }],
  });
  assert.deepEqual(out, [
    { theme: "文件處理", count: 3, examples: ["合併 PDF"] },
  ]);
});

test("normalizeThemes：examples 截 ≤2", () => {
  const out = normalizeThemes({
    themes: [{ theme: "x", count: 1, examples: ["a", "b", "c"] }],
  });
  assert.deepEqual(out[0].examples, ["a", "b"]);
});

test("normalizeThemes：themes 截 limit", () => {
  const themes = Array.from({ length: 10 }, (_, i) => ({
    theme: "t" + i,
    count: 1,
    examples: [],
  }));
  assert.equal(normalizeThemes({ themes }, 3).length, 3);
});

test("normalizeThemes：丟棄缺 theme / 型別錯的項目", () => {
  const out = normalizeThemes({
    themes: [
      { count: 1 },
      { theme: "", count: 1 },
      { theme: "好的", count: 2, examples: [] },
    ],
  });
  assert.deepEqual(
    out.map((t) => t.theme),
    ["好的"],
  );
});

test("normalizeThemes：count 非數字 → 轉 0；examples 非陣列 → []", () => {
  const out = normalizeThemes({
    themes: [{ theme: "x", count: "abc", examples: "nope" }],
  });
  assert.equal(out[0].count, 0);
  assert.deepEqual(out[0].examples, []);
});

test("normalizeThemes：壞結構（null / 非陣列 / 缺 themes）→ []", () => {
  assert.deepEqual(normalizeThemes(null), []);
  assert.deepEqual(normalizeThemes({}), []);
  assert.deepEqual(normalizeThemes({ themes: "x" }), []);
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `node --test src/lib/demandBoard.test.mjs`
Expected: FAIL（`Cannot find module './demandBoard.mjs'`）

- [ ] **Step 3: 寫實作** — 建立 `src/lib/demandBoard.mjs`：

```js
// src/lib/demandBoard.mjs
// 需求看板的純邏輯：組 Gemini 分群 prompt + 清理回傳。無 firebase/browser 依賴，可 node:test。

/**
 * 組「把待處理需求分群成主題」的 Gemini prompt。
 * @param {string[]} messages  待處理需求文字
 * @returns {string}
 */
export function buildDemandPrompt(messages) {
  const list = (messages || []).map((m, i) => `${i + 1}. ${m}`).join("\n");
  return `你是 SimHope 內部平台的需求分析助理。下面是同仁提出的「待處理需求」清單，請歸納成幾個主題（最多 6 個）。

規則：
- 只根據下面提供的需求內容歸納，不可編造沒提到的需求。
- 每個主題給：theme（主題短名）、count（屬於此主題的需求數，整數）、examples（1-2 句代表性原文）。
- 固定輸出純 JSON（不要 markdown code fence），schema：
{ "themes": [ { "theme": "主題名", "count": 3, "examples": ["原文1", "原文2"] } ] }

待處理需求：
${list}`;
}

/**
 * 清理 Gemini 回傳的主題：保留合法項、count 轉數字、examples 截 ≤2、themes 截 limit。
 * 壞輸入安全回 []。
 * @param {{themes?:unknown}|null|undefined} geminiResult
 * @param {number} [limit=6]
 * @returns {Array<{theme:string,count:number,examples:string[]}>}
 */
export function normalizeThemes(geminiResult, limit = 6) {
  const raw = Array.isArray(geminiResult?.themes) ? geminiResult.themes : [];
  const out = [];
  for (const t of raw) {
    if (out.length >= limit) break;
    if (!t || typeof t !== "object") continue;
    const theme = typeof t.theme === "string" ? t.theme.trim() : "";
    if (!theme) continue;
    const count = Number.isFinite(t.count) ? t.count : Number(t.count) || 0;
    const examples = Array.isArray(t.examples)
      ? t.examples.filter((e) => typeof e === "string" && e.trim()).slice(0, 2)
      : [];
    out.push({ theme, count, examples });
  }
  return out;
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `node --test src/lib/demandBoard.test.mjs`
Expected: PASS（全部 8 個）

- [ ] **Step 5: Commit**

```bash
git add src/lib/demandBoard.mjs src/lib/demandBoard.test.mjs
git commit -m "feat(demand): demandBoard 純函式（分群 prompt + 主題清理）

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

## Task 2: `POST /api/analyze-demand` route

**Files:**

- Create: `app/api/analyze-demand/route.js`

無純單元測試（admin SDK + 外部呼叫）；以 `node --check` + build 驗證。比照 `app/api/admin/enrich-tool/route.js` 的 admin-only AI 範式。

- [ ] **Step 1: 建立 route** — 建立 `app/api/analyze-demand/route.js`：

```js
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/apiAuth.mjs";
import { callGemini } from "@/lib/gemini.mjs";
import { HttpError, handleApiError } from "@/lib/apiError.mjs";
import { rateLimit, clientIp } from "@/lib/rateLimit.mjs";
import { getAdmin } from "@/lib/firebaseAdmin";
import { buildDemandPrompt, normalizeThemes } from "@/lib/demandBoard.mjs";

const MAX_REQUESTS = 100; // 送 Gemini 的需求上限（避免 prompt 過長）
const MSG_MAX = 500; // 每筆 message 截斷長度

/**
 * POST /api/analyze-demand — admin-only。讀待處理 feature 需求 → Gemini 主題分群。
 * IP 前置限流 → auth(admin, Admin SDK) → 讀 requests → Gemini JSON → normalize。
 */
export async function POST(request) {
  try {
    const ip = clientIp(request);
    if (!rateLimit(`analyze-demand:${ip}`, { limit: 10, windowMs: 60000 }).ok)
      throw new HttpError(429, "操作過於頻繁，請稍後再試");

    await requireRole(request, ["admin"], {
      forbiddenMessage: "需要管理員權限",
    });

    const { adminDb } = getAdmin();
    const snap = await adminDb
      .collection("requests")
      .where("status", "==", "pending")
      .get();
    const messages = [];
    snap.forEach((d) => {
      const data = d.data();
      if (data.type === "feature" && data.message) {
        messages.push(String(data.message).slice(0, MSG_MAX));
      }
    });
    const total = messages.length;
    if (total === 0) return NextResponse.json({ themes: [], total: 0 });

    const parsed = await callGemini({
      prompt: buildDemandPrompt(messages.slice(0, MAX_REQUESTS)),
      json: true,
      temperature: 0.3,
      timeoutMs: 15000,
    });
    const themes = normalizeThemes(parsed, 6);
    return NextResponse.json({ themes, total });
  } catch (e) {
    return handleApiError(e, "/api/analyze-demand");
  }
}
```

- [ ] **Step 2: 語法檢查**

Run: `node --check app/api/analyze-demand/route.js`
Expected: 無輸出（通過）

- [ ] **Step 3: Commit**

```bash
git add app/api/analyze-demand/route.js
git commit -m "feat(demand): POST /api/analyze-demand（admin-only 讀需求 + Gemini 分群）

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

## Task 3: `DemandBoard.jsx` 看板 UI

**Files:**

- Create: `src/components/DemandBoard.jsx`

- [ ] **Step 1: 建立元件** — 建立 `src/components/DemandBoard.jsx`：

```jsx
"use client";

import { useState } from "react";
import { auth } from "@/lib/firebase";

/**
 * admin 後台「需求看板」：點「分析需求」→ /api/analyze-demand（admin Bearer）→ 主題卡。
 */
export default function DemandBoard() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null); // { themes, total } | null
  const [err, setErr] = useState("");

  const analyze = async () => {
    setErr("");
    setLoading(true);
    setData(null);
    try {
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch("/api/analyze-demand", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "分析失敗");
      setData({
        themes: Array.isArray(d.themes) ? d.themes : [],
        total: d.total || 0,
      });
    } catch (e) {
      setErr(e.message || "分析失敗，請稍後再試");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-black text-lg text-[var(--color-text-dark)]">
            💡 需求看板
          </h3>
          <p className="text-sm text-[var(--color-text-mid)]">
            AI 把待處理需求歸納成主題，導引該做什麼。
          </p>
        </div>
        <button
          onClick={analyze}
          disabled={loading}
          className="px-4 py-2 rounded-full bg-[var(--color-clay-purple)] text-white font-extrabold text-sm disabled:opacity-60"
        >
          {loading ? "分析中…" : "分析需求"}
        </button>
      </div>

      {err && <p className="text-sm text-red-500 font-bold">{err}</p>}

      {data &&
        (data.total === 0 ? (
          <p className="text-[var(--color-text-mid)] font-semibold py-6 text-center">
            目前沒有待處理需求。
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-[var(--color-text-mid)]">
              待處理需求{" "}
              <strong className="text-[var(--color-text-dark)]">
                {data.total}
              </strong>{" "}
              筆（以下主題與筆數為 AI 歸納）
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {data.themes.map((t, i) => (
                <div
                  key={i}
                  className="bg-[var(--color-card-bg)] border border-[var(--color-card-border)] rounded-2xl p-4 flex flex-col gap-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-extrabold text-[var(--color-text-dark)]">
                      {t.theme}
                    </span>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-[var(--color-clay-purple)]/10 text-[var(--color-clay-purple)] flex-shrink-0">
                      約 {t.count} 筆
                    </span>
                  </div>
                  {t.examples.length > 0 && (
                    <ul className="list-disc ml-5 text-sm text-[var(--color-text-mid)] flex flex-col gap-1">
                      {t.examples.map((e, j) => (
                        <li key={j}>{e}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
    </div>
  );
}
```

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: 0 errors（2 既有 `<img>` warning 不算）

- [ ] **Step 3: Commit**

```bash
git add src/components/DemandBoard.jsx
git commit -m "feat(demand): DemandBoard 看板 UI（分析需求 → 主題卡）

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

## Task 4: admin 後台加「💡 需求看板」分頁

**Files:**

- Modify: `app/admin/page.jsx`（import + 分頁鈕 + 內容）

- [ ] **Step 1: 加 import** — 在 `app/admin/page.jsx`，於 `import UsageDashboard from "@/components/UsageDashboard";` 之後加一行：

```js
import DemandBoard from "@/components/DemandBoard";
```

- [ ] **Step 2: 加分頁鈕** — 找到「📊 使用概況」分頁鈕（`onClick={() => setActiveTab("usage")}` 那顆 `<button>`，以 `📊 使用概況` 結尾、`</button>` 收尾）。在那顆 `</button>` 之後、`</nav>` 之前，插入：

```jsx
<button
  onClick={() => setActiveTab("demand")}
  className={`w-full text-left px-4 py-3 rounded-xl font-bold transition-all ${activeTab === "demand" ? "bg-[var(--color-clay-purple)] text-white shadow-md" : "text-[var(--color-text-mid)] hover:bg-gray-100 dark:hover:bg-gray-700"}`}
>
  💡 需求看板
</button>
```

- [ ] **Step 3: 加內容** — 找到 `{activeTab === "usage" && ( ... <UsageDashboard /> ... )}` 區塊。在它的收尾 `)}` 之後、`</main>` 之前，插入：

```jsx
{
  activeTab === "demand" && (
    <div className="bg-[var(--color-card-bg)] rounded-[24px] shadow-sm border border-[var(--color-card-border)] p-8">
      <DemandBoard />
    </div>
  );
}
```

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: 0 errors

- [ ] **Step 5: Commit**

```bash
git add app/admin/page.jsx
git commit -m "feat(demand): admin 後台加「需求看板」分頁

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

## Task 5: 全量驗證

- [ ] **Step 1: 單元測試**

Run: `npm run test:unit`
Expected: 全綠（原 100 + 8 demandBoard = 108 上下；以實際輸出為準、0 fail）

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: 0 errors

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: `✓ Compiled successfully`（`/api/analyze-demand` 出現在 route 清單）

- [ ] **Step 4: 收尾** — `git status` 乾淨；推 branch、開 PR。PR 說明標註：**沿用既有免費 Gemini、零付費 API、admin-only、無 rules/資料/SA → merge 即部署**；部署後 Jason 驗：①有待處理 feature 需求 → 點分析 → 出主題卡 + 真實總數 ②無待處理 → 顯空訊息 ③非 admin 打 route → 403。

---

## 範圍外（路線圖）

handled/趨勢與跨期統計、自動定期分析、主題→建立工具連動、匯出。
