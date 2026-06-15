# 每週新增資源摘要 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 每週一自動把近 7 天新增的公開工具摘要發到 Discord（空週不發）。

**Architecture:** 純函式 `weeklyDigest.mjs`（篩近 7 天 + 組訊息）→ Vercel cron 觸發 `GET /api/cron/weekly-digest`（驗 CRON_SECRET → Admin SDK 讀公開工具 → select → build → notify）→ `vercel.json` 註冊 cron。Discord + cron 皆免費。

**Tech Stack:** Next.js 16 App Router (route handler GET), Firebase Admin SDK (read tools), Discord webhook (notify.js), Vercel cron, ESM, `node --test`。

**Spec:** `docs/superpowers/specs/2026-06-15-weekly-digest-design.md`

**驗證指令**

- 單元測試：`npm run test:unit`
- Lint：`npm run lint`
- Build：`npm run build`（若失敗訊息只有 `fonts.gstatic.com` / "Failed to fetch" 屬本機網路 flake，重跑即可，最多 2 次）

---

## File Structure

- `src/lib/weeklyDigest.mjs`（新）— `selectRecentTools` + `buildDigestMessage` 純函式
- `src/lib/weeklyDigest.test.mjs`（新）— 測試
- `app/api/cron/weekly-digest/route.js`（新）— cron route
- `vercel.json`（改）— 加 crons

---

## Task 1: `weeklyDigest.mjs` 純函式（TDD）

**Files:**

- Create: `src/lib/weeklyDigest.mjs`
- Test: `src/lib/weeklyDigest.test.mjs`

- [ ] **Step 1: 寫測試（先紅）** — 建立 `src/lib/weeklyDigest.test.mjs`：

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { selectRecentTools, buildDigestMessage } from "./weeklyDigest.mjs";

const NOW = 1_000_000_000_000; // 固定基準
const DAY = 24 * 60 * 60 * 1000;
const T = (id, createdAtMs, status = "live") => ({
  id,
  title: id,
  tagline: id + " tagline",
  status,
  createdAtMs,
});

test("selectRecentTools：保留近 7 天 + 公開狀態", () => {
  const out = selectRecentTools(
    [T("a", NOW - 1 * DAY), T("b", NOW - 6 * DAY)],
    NOW,
  );
  assert.deepEqual(
    out.map((t) => t.id),
    ["a", "b"],
  );
});

test("selectRecentTools：排除超過 7 天的", () => {
  const out = selectRecentTools([T("old", NOW - 8 * DAY)], NOW);
  assert.deepEqual(out, []);
});

test("selectRecentTools：排除非公開狀態（dev/terminated/pending）", () => {
  const out = selectRecentTools(
    [
      T("a", NOW, "dev"),
      T("b", NOW, "terminated"),
      T("c", NOW, "pending"),
      T("d", NOW, "new"),
    ],
    NOW,
  );
  assert.deepEqual(
    out.map((t) => t.id),
    ["d"],
  );
});

test("selectRecentTools：排除缺 / 非數字 createdAtMs", () => {
  const out = selectRecentTools(
    [T("a", null), T("b", undefined), T("c", "x"), T("d", NOW)],
    NOW,
  );
  assert.deepEqual(
    out.map((t) => t.id),
    ["d"],
  );
});

test("selectRecentTools：空 / null 安全", () => {
  assert.deepEqual(selectRecentTools(undefined, NOW), []);
  assert.deepEqual(selectRecentTools([], NOW), []);
});

test("buildDigestMessage：多筆 → 含筆數與每筆名稱", () => {
  const msg = buildDigestMessage([T("工具A", NOW), T("工具B", NOW)]);
  assert.ok(msg.includes("2"));
  assert.ok(msg.includes("工具A") && msg.includes("工具B"));
});

test("buildDigestMessage：空 / null → null", () => {
  assert.equal(buildDigestMessage([]), null);
  assert.equal(buildDigestMessage(null), null);
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `node --test src/lib/weeklyDigest.test.mjs`
Expected: FAIL（`Cannot find module './weeklyDigest.mjs'`）

- [ ] **Step 3: 寫實作** — 建立 `src/lib/weeklyDigest.mjs`：

```js
// src/lib/weeklyDigest.mjs
// 每週新增資源摘要的純邏輯。無 firebase/browser 依賴，可 node:test。

const PUBLIC_STATUSES = new Set(["live", "beta", "new"]);

/**
 * 篩出「近 windowDays 天內新增的公開工具」。
 * @param {Array<{status?:string, createdAtMs?:unknown}>} tools
 * @param {number} nowMs
 * @param {number} [windowDays=7]
 * @returns {object[]}
 */
export function selectRecentTools(tools, nowMs, windowDays = 7) {
  const cutoff = nowMs - windowDays * 24 * 60 * 60 * 1000;
  return (tools || []).filter(
    (t) =>
      t &&
      PUBLIC_STATUSES.has(t.status) &&
      typeof t.createdAtMs === "number" &&
      t.createdAtMs >= cutoff,
  );
}

/**
 * 組 Discord 摘要訊息。無工具 → null（空週不發）。
 * @param {Array<{title?:string, tagline?:string}>} tools
 * @returns {string|null}
 */
export function buildDigestMessage(tools) {
  if (!tools || tools.length === 0) return null;
  const lines = tools.map(
    (t) => `• ${t.title || "(未命名)"}${t.tagline ? ` — ${t.tagline}` : ""}`,
  );
  return `📢 SimHope 本週新增資源（${tools.length}）：\n${lines.join("\n")}\n\n看全部：https://simhope-platform.vercel.app/hub`;
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `node --test src/lib/weeklyDigest.test.mjs`
Expected: PASS（全部 7 個）

- [ ] **Step 5: Commit**

```bash
git add src/lib/weeklyDigest.mjs src/lib/weeklyDigest.test.mjs
git commit -m "feat(digest): weeklyDigest 純函式（篩近 7 天新工具 + 組訊息）

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

## Task 2: `GET /api/cron/weekly-digest` route

**Files:**

- Create: `app/api/cron/weekly-digest/route.js`

無純單元測試（cron + Admin SDK + Discord）；以 `node --check` + build 驗證。

- [ ] **Step 1: 建立 route** — 建立 `app/api/cron/weekly-digest/route.js`：

```js
import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebaseAdmin";
import { notify } from "@/lib/notify";
import { selectRecentTools, buildDigestMessage } from "@/lib/weeklyDigest.mjs";

const PUBLIC_STATUSES = ["live", "beta", "new"];

/**
 * GET /api/cron/weekly-digest — Vercel cron 每週觸發。
 * 驗 CRON_SECRET → 讀公開工具 → 篩近 7 天 → Discord 摘要（空週不發）。
 */
export async function GET(request) {
  // Vercel cron 帶 Authorization: Bearer <CRON_SECRET>。未設 secret 一律 401（fail-safe）。
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization") || "";
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  try {
    const { adminDb } = getAdmin();
    const snap = await adminDb
      .collection("tools")
      .where("status", "in", PUBLIC_STATUSES)
      .get();
    const tools = [];
    snap.forEach((d) => {
      const data = d.data();
      tools.push({
        id: d.id,
        title: data.title,
        tagline: data.tagline,
        status: data.status,
        createdAtMs: data.createdAt?.toMillis?.() ?? null,
      });
    });

    const recent = selectRecentTools(tools, Date.now());
    const message = buildDigestMessage(recent);
    if (message) await notify(message);
    return NextResponse.json({ ok: true, count: recent.length });
  } catch (e) {
    console.error("/api/cron/weekly-digest 失敗：", e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
```

- [ ] **Step 2: 語法檢查**

Run: `node --check app/api/cron/weekly-digest/route.js`
Expected: 無輸出（通過）

- [ ] **Step 3: Commit**

```bash
git add app/api/cron/weekly-digest/route.js
git commit -m "feat(digest): GET /api/cron/weekly-digest（CRON_SECRET + 讀工具 + Discord）

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

## Task 3: `vercel.json` 註冊 cron

**Files:**

- Modify: `vercel.json`

- [ ] **Step 1: 改 vercel.json** — 目前內容是 `{ "framework": "nextjs" }`。整檔換成：

```json
{
  "framework": "nextjs",
  "crons": [{ "path": "/api/cron/weekly-digest", "schedule": "0 1 * * 1" }]
}
```

- [ ] **Step 2: 驗 JSON 合法**

Run: `node -e "JSON.parse(require('fs').readFileSync('vercel.json','utf8')); console.log('vercel.json ok')"`
Expected: `vercel.json ok`

- [ ] **Step 3: Commit**

```bash
git add vercel.json
git commit -m "chore(digest): vercel.json 註冊每週摘要 cron（週一 01:00 UTC）

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

## Task 4: 全量驗證

- [ ] **Step 1: 單元測試**

Run: `npm run test:unit`
Expected: 全綠（原 108 + 7 weeklyDigest = 115 上下；以實際輸出為準、0 fail）

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: 0 errors（2 既有 `<img>` warning）

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: `✓ Compiled successfully`（`/api/cron/weekly-digest` 出現在 route 清單）

- [ ] **Step 4: 收尾** — `git status` 乾淨；推 branch、開 PR。PR 說明標註：**Discord + Vercel cron 皆免費、零付費 API、零 rules/資料/SA；Jason 需在 Vercel 設 `CRON_SECRET`（否則 route 401、不會發）**。部署後驗：帶 secret GET route → 有近 7 天新工具則 Discord 收摘要 / 無則 `{ok:true,count:0}`；不帶 secret → 401。

---

## 範圍外（路線圖）

即時 on-publish 公告、email/LINE、個人化訂閱、其它內容類型摘要。
