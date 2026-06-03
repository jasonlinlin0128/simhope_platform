# SimHope Hub Phase 2.x Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 加上 (F1) 開發者自助申請+審核閘、(F2) 免登入 AI 輔助提需求卡、(C) admin 統一申請/需求收件匣、(A) 手機下拉導覽選單。

**Architecture:** 沿用 Next.js 16 App Router + Firebase（client SDK + Admin SDK）+ Tailwind 4 + Gemini REST。後端 `/api/request` 改成依 `type` 分流（access 需登入、feature 免登入）；新 `/api/refine-request`（Gemini，免登入）+ 共用 `rateLimit.js`。前端：LoginModal 改雙 tab（登入/開發者註冊）、新 `RequestCard` 雙欄提需求卡、Navbar 手機選單、admin `RequestInbox`。

**Tech Stack:** Next.js 16.2 / React 19 / Firebase 12（Firestore client + firebase-admin）/ Tailwind 4 / Gemini 2.5 Flash（generativelanguage REST）。

**Spec:** `docs/superpowers/specs/2026-06-02-simhope-hub-phase2x-design.md`（commit `4f77b27`）。

---

## 驗證取向（同 Phase 1/2）

無測試框架。Gate：(1) `npm run build` 通過；(2) `npm run lint` 無**新**錯（既有 test\*.js / ThemeProvider / tool/[id] / dashboard 的 pre-existing 錯誤忽略）；(3) 純邏輯（`rateLimit`）附 `node` 斷言；(4) **互動/RWD 視覺驗證由 controller 用連線的 Chrome 在 local dev 做**（subagent 不做 `npm run dev` 視覺）。每個 UI task 的「視覺實測」步驟標明檢查點供 controller 用。

**Branch：** 已在 `feature-hub-phase2x`（從 main 開）。**不在 main 直接 commit。** 每個 commit 結尾：

```
Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>
```

**全域守則（spec §0.5）：** 新手+專業用詞；RWD；免登入端點輕量防護；改 firestore.rules 須 Console 手動發布。

---

## 檔案結構

**新增：**

- `src/lib/rateLimit.js` — per-IP 記憶體限流（共用）
- `scripts/__verify-ratelimit.mjs` — rateLimit 斷言（暫時）
- `app/api/refine-request/route.js` — Gemini AI 輔助（免登入 + 限流）
- `src/components/RequestCard.jsx` — 雙欄提需求卡（左 mailto / 右免登入表單 + AI 輔助）
- `src/components/RequestInbox.jsx` — admin 申請/需求收件匣

**修改：**

- `app/api/request/route.js` — 改 type 分流（access 需登入+寫 devStatus / feature 免登入+name）+ 限流
- `src/components/LoginModal.jsx` — 雙 tab（登入/開發者註冊）+ 註冊流程 + devStatus 狀態 + `initialTab` prop
- `src/components/RequestButton.jsx` — 改開 `RequestCard`
- `src/components/Navbar.jsx` — 按鈕文案「登入👨‍💻 / 註冊🔑」+ 手機 ☰ 下拉選單
- `src/components/Footer.jsx` — 「提需求」沿用 RequestButton（自動接新卡，通常免改；確認即可）
- `app/page.jsx` — §about「提需求給我」mailto → RequestButton（開新卡）
- `app/access/page.jsx` — 「申請成為開發者」改開 LoginModal（register tab），移除舊 RequestModal(type=access)
- `app/admin/page.jsx` — 加「📥 申請/需求」tab
- `firestore.rules` — requests `update, delete: if isAdmin()`

**依賴順序：** 1 rateLimit → 2 refine-request → 3 /api/request → 4 rules → 5 RequestCard → 6 首頁/footer 接線 → 7 LoginModal → 8 Navbar → 9 /access → 10 RequestInbox → 11 整合。

---

## Task 1: rateLimit.js + node 斷言

**Files:** Create `src/lib/rateLimit.js`, `scripts/__verify-ratelimit.mjs`

per-IP 記憶體滑動視窗計數。serverless 多實例非全域精確，但足以擋洗版（spec §7.3）。

- [ ] **Step 1: 先寫斷言 `scripts/__verify-ratelimit.mjs`**

```js
// scripts/__verify-ratelimit.mjs — 純函式 sanity check（無框架）
import assert from "node:assert";
import { rateLimit } from "../src/lib/rateLimit.js";

// 同 key 第 1~3 次允許，第 4 次擋（limit=3, window 大）
const opts = { limit: 3, windowMs: 60000 };
let now = 1000;
const clock = () => now;
assert.equal(rateLimit("ip-a", opts, clock).ok, true);
assert.equal(rateLimit("ip-a", opts, clock).ok, true);
assert.equal(rateLimit("ip-a", opts, clock).ok, true);
assert.equal(rateLimit("ip-a", opts, clock).ok, false, "第4次應被擋");
// 不同 key 互不影響
assert.equal(rateLimit("ip-b", opts, clock).ok, true);
// 視窗滑過後重置
now = 1000 + 60001;
assert.equal(rateLimit("ip-a", opts, clock).ok, true, "視窗過後應放行");

console.log("✅ rateLimit verify passed");
```

- [ ] **Step 2: 跑斷言確認失敗**

Run: `node scripts/__verify-ratelimit.mjs` → FAIL（rateLimit 未定義）。

- [ ] **Step 3: 實作 `src/lib/rateLimit.js`**

```js
// src/lib/rateLimit.js
// per-IP（或任意 key）記憶體滑動視窗限流。server-only。
// 注意：Vercel serverless 多實例 → 只在單一實例內計數（非全域精確），
// 足以擋住明顯洗版；嚴格全域限流需外部 store（YAGNI）。
const hits = new Map(); // key -> number[]（timestamps）

/**
 * @param {string} key  通常是 IP
 * @param {{limit:number, windowMs:number}} opts
 * @param {() => number} [clock]  注入時鐘（測試用），預設 Date.now
 * @returns {{ok: boolean, remaining: number}}
 */
export function rateLimit(key, { limit, windowMs }, clock = Date.now) {
  const now = clock();
  const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
  if (arr.length >= limit) {
    hits.set(key, arr);
    return { ok: false, remaining: 0 };
  }
  arr.push(now);
  hits.set(key, arr);
  return { ok: true, remaining: limit - arr.length };
}

/** 從 Next request 取 client IP（Vercel 帶 x-forwarded-for）。 */
export function clientIp(req) {
  const xff = req.headers.get("x-forwarded-for") || "";
  return xff.split(",")[0].trim() || "unknown";
}
```

> ⚠️ 斷言用 `Date.now` 作預設、可注入 `clock`。`__verify-ratelimit.mjs` import `../src/lib/rateLimit.js`（純 ESM，沿用 Phase 1 `__verify-taxonomy.mjs` 同模式，無 type:module 警告無妨）。

- [ ] **Step 4: 跑斷言確認通過 + build**

Run: `node scripts/__verify-ratelimit.mjs` → `✅ rateLimit verify passed`；`npm run build` → 成功。

- [ ] **Step 5: Commit**

```bash
git add src/lib/rateLimit.js scripts/__verify-ratelimit.mjs
git commit -m "feat(lib): 加 per-IP 記憶體限流 rateLimit + 斷言

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

## Task 2: `/api/refine-request`（Gemini AI 輔助，免登入 + 限流）

**Files:** Create `app/api/refine-request/route.js`

沿用 `/api/generate` 的 Gemini REST 呼叫（model `gemini-2.5-flash`、`generativelanguage` REST、`responseMimeType: application/json`），但**免登入**、換 prompt、回 `{ optimized, suggestions[] }`、加限流。

- [ ] **Step 1: 建立 `app/api/refine-request/route.js`**

````js
import { NextResponse } from "next/server";
import { rateLimit, clientIp } from "@/lib/rateLimit";

const SYSTEM_PROMPT = `你是公司內部「需求收件」助理。使用者會用口語描述他工作上的痛點或想要的工具。
請做兩件事，並固定輸出純 JSON：
1. optimized：把他的描述改寫得更清楚具體（白話、保留原意、別誇大、別亂加他沒說的需求），約 40-120 字。
2. suggestions：列 1-3 個「他可能沒講清楚、補上會更好評估」的點（每點一句話、繁體中文）。若已很完整可給空陣列。

JSON Schema:
{ "optimized": "改寫後的需求描述", "suggestions": ["可補充的點1", "可補充的點2"] }`;

export async function POST(request) {
  // 限流（免登入端點）：每 IP 每分鐘 5 次
  const ip = clientIp(request);
  if (!rateLimit(`refine:${ip}`, { limit: 5, windowMs: 60000 }).ok) {
    return NextResponse.json(
      { error: "操作過於頻繁，請稍後再試" },
      { status: 429 },
    );
  }

  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "伺服器未設定 Gemini API Key" },
      { status: 500 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const text = String(body.text || "")
    .slice(0, 1000)
    .trim();
  if (!text) {
    return NextResponse.json({ error: "請先輸入需求內容" }, { status: 400 });
  }

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: SYSTEM_PROMPT + "\n使用者描述：" + text }],
            },
          ],
          generationConfig: {
            temperature: 0.5,
            responseMimeType: "application/json",
          },
        }),
      },
    );
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      return NextResponse.json(
        { error: `AI 服務暫時無法使用 (${res.status})` },
        { status: 502 },
      );
    }
    const data = await res.json();
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    const parsed = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim());
    return NextResponse.json({
      optimized: String(parsed.optimized || ""),
      suggestions: Array.isArray(parsed.suggestions)
        ? parsed.suggestions.slice(0, 3)
        : [],
    });
  } catch (e) {
    console.error("/api/refine-request 失敗：", e);
    return NextResponse.json(
      { error: "AI 輔助失敗，請稍後再試" },
      { status: 500 },
    );
  }
}
````

- [ ] **Step 2: build + Commit**

Run: `npm run build` → 成功（`/api/refine-request` 出現在 route 表，`ƒ`）。

```bash
git add app/api/refine-request/route.js
git commit -m "feat(api): 加 /api/refine-request（Gemini 需求文字優化，免登入 + 限流）

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

## Task 3: `/api/request` 改 type 分流（access 需登入 / feature 免登入）

**Files:** Modify `app/api/request/route.js`（整檔重寫）

access：必須 Bearer token（uid 取自 token）+ 寫 `requests`（含 reason）+ 設 `users/{uid}.devStatus='pending'`（Admin SDK）。feature：免登入、name 必填、寫 `requests`（無 uid）。兩者限流 + notify。

- [ ] **Step 1: 整檔取代 `app/api/request/route.js`**

```js
import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdmin } from "@/lib/firebaseAdmin";
import { notify } from "@/lib/notify";
import { rateLimit, clientIp } from "@/lib/rateLimit";

/**
 * POST /api/request
 * - type='access'（開發者申請）：需 Authorization: Bearer <idToken>；uid 取自 token；
 *   寫 requests（reason）+ 設 users/{uid}.devStatus='pending'（Admin SDK）。
 * - type='feature'（提需求）：免登入；name 必填；寫 requests（無 uid）。
 * 兩者：寫入後呼叫 notify()（失敗不擋）；per-IP 限流。
 */
export async function POST(req) {
  try {
    const ip = clientIp(req);
    if (!rateLimit(`request:${ip}`, { limit: 5, windowMs: 60000 }).ok) {
      return NextResponse.json(
        { error: "操作過於頻繁，請稍後再試" },
        { status: 429 },
      );
    }

    const { adminDb, adminAuth } = getAdmin();
    const body = await req.json().catch(() => ({}));
    const type = body.type === "access" ? "access" : "feature";

    if (type === "access") {
      // 開發者申請：必須登入
      const authHeader = req.headers.get("authorization") || "";
      const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
      if (!token)
        return NextResponse.json({ error: "請先登入" }, { status: 401 });
      let decoded;
      try {
        decoded = await adminAuth.verifyIdToken(token);
      } catch {
        return NextResponse.json({ error: "登入憑證無效" }, { status: 401 });
      }
      const reason = String(body.reason || body.message || "").slice(0, 1000);
      if (!reason)
        return NextResponse.json({ error: "請填寫申請理由" }, { status: 400 });
      const name = String(decoded.name || "").slice(0, 100);
      const email = String(decoded.email || "").slice(0, 200);

      const ref = await adminDb.collection("requests").add({
        type: "access",
        uid: decoded.uid,
        email,
        name,
        reason,
        status: "pending",
        createdAt: FieldValue.serverTimestamp(),
      });
      // 記錄申請狀態到 user 文件（Admin SDK，可信）
      await adminDb
        .collection("users")
        .doc(decoded.uid)
        .set({ devStatus: "pending" }, { merge: true });

      await notify(
        `🔑 開發者申請\n來自：${name || email || decoded.uid}\n理由：${reason}\nrequest id: ${ref.id}`,
      );
      return NextResponse.json({ ok: true });
    }

    // type === 'feature'：免登入提需求
    const name = String(body.name || "")
      .slice(0, 50)
      .trim();
    const contact = String(body.contact || "").slice(0, 100);
    const message = String(body.message || "")
      .slice(0, 1000)
      .trim();
    if (!name)
      return NextResponse.json({ error: "請填寫姓名" }, { status: 400 });
    if (!message)
      return NextResponse.json({ error: "請填寫需求內容" }, { status: 400 });

    const ref = await adminDb.collection("requests").add({
      type: "feature",
      name,
      contact,
      message,
      status: "pending",
      createdAt: FieldValue.serverTimestamp(),
    });
    await notify(
      `💡 提需求\n來自：${name}${contact ? `（${contact}）` : ""}\n內容：${message}\nrequest id: ${ref.id}`,
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("/api/request 失敗：", e);
    return NextResponse.json({ error: "伺服器錯誤" }, { status: 500 });
  }
}
```

- [ ] **Step 2: build + Commit**

Run: `npm run build` → 成功。

```bash
git add app/api/request/route.js
git commit -m "feat(api): /api/request 改 type 分流（access 需登入+寫 devStatus / feature 免登入+name）+ 限流

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

> ⚠️ 此改動讓 feature 提需求**免登入**（原 Phase 2 是需登入）。access（開發者申請）仍需登入。

---

## Task 4: firestore.rules — requests 允許 admin update/delete

**Files:** Modify `firestore.rules`

- [ ] **Step 1: 改 requests 區塊**

把現有：

```
    match /requests/{reqId} {
      allow read: if isAdmin();
      allow write: if false;
    }
```

改成：

```
    // 申請/需求：client 不可建（只 server Admin SDK 建，防偽造）；admin 可讀 + 改 status/刪除
    match /requests/{reqId} {
      allow read: if isAdmin();
      allow create: if false;
      allow update, delete: if isAdmin();
    }
```

- [ ] **Step 2: build（rules 不進 build，僅一致性）+ Commit**

Run: `npm run build` → 成功。

```bash
git add firestore.rules
git commit -m "feat(rules): requests 允許 admin update/delete（收件匣審核用）

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

> ⚠️ **部署時須 Firebase Console 手動發布**（SA 無發布權）。未發布前 admin 在收件匣按核准/標記會 deny。

---

## Task 5: `RequestCard.jsx`（雙欄提需求卡）+ RequestButton 改開它

**Files:** Create `src/components/RequestCard.jsx`; Modify `src/components/RequestButton.jsx`

左 mailto（免登入）/ 右免登入表單（姓名必填 + 聯絡選填 + 需求 + ✨AI輔助 + 送出→/api/request feature）。

- [ ] **Step 1: 建立 `src/components/RequestCard.jsx`**

```jsx
"use client";

import { useState } from "react";

const MAILTO = "mailto:jasonlin@simhope.com.tw?subject=AI工具需求";

/** 提需求卡：左 email、右免登入線上表單 + AI 輔助。@param {{onClose:()=>void}} props */
export default function RequestCard({ onClose }) {
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [message, setMessage] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [optimized, setOptimized] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");

  const runAi = async () => {
    if (!message.trim()) return setErr("請先輸入需求，再讓 AI 幫忙");
    setErr("");
    setAiLoading(true);
    setSuggestions([]);
    setOptimized("");
    try {
      const res = await fetch("/api/refine-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: message.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "AI 輔助失敗");
      setOptimized(data.optimized || "");
      setSuggestions(data.suggestions || []);
    } catch (e) {
      setErr(e.message || "AI 輔助失敗，請稍後再試");
    }
    setAiLoading(false);
  };

  const submit = async () => {
    if (!name.trim()) return setErr("請填寫姓名");
    if (!message.trim()) return setErr("請填寫需求內容");
    setErr("");
    setSending(true);
    try {
      const res = await fetch("/api/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "feature",
          name: name.trim(),
          contact: contact.trim(),
          message: message.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "送出失敗");
      setDone(true);
    } catch (e) {
      setErr(e.message || "送出失敗，請稍後再試");
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-[var(--color-card-bg)] rounded-3xl p-6 w-full max-w-2xl shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-black text-lg text-[var(--color-text-dark)]">
            提需求 / 想要的工具
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 text-xl"
          >
            ✕
          </button>
        </div>

        {done ? (
          <div className="text-center py-8">
            <p className="text-3xl mb-2">✅</p>
            <p className="font-bold text-[var(--color-text-dark)]">
              已送出，我們會盡快看！
            </p>
            <button
              onClick={onClose}
              className="mt-4 px-5 py-2 rounded-full bg-[var(--color-clay-purple)] text-white font-bold text-sm"
            >
              關閉
            </button>
          </div>
        ) : (
          <div className="flex flex-col md:flex-row gap-5">
            {/* 左：email */}
            <div className="md:w-44 flex-shrink-0 md:border-r md:border-[var(--color-card-border)] md:pr-5 flex flex-col gap-2">
              <span className="text-xs font-extrabold text-[var(--color-text-mid)] uppercase tracking-wider">
                ✉️ 用 email 寄
              </span>
              <p className="text-sm text-[var(--color-text-mid)] font-semibold">
                習慣寄信？直接寄給經企室（免登入）。
              </p>
              <a
                href={MAILTO}
                className="text-center px-4 py-2.5 rounded-xl border-2 border-[var(--color-card-border)] font-bold text-sm text-[var(--color-text-dark)] hover:border-[var(--color-clay-purple)] transition"
              >
                📧 寄信
              </a>
            </div>

            {/* 右：線上表單 + AI */}
            <div className="flex-1 flex flex-col gap-3">
              <span className="text-xs font-extrabold text-[var(--color-text-mid)] uppercase tracking-wider">
                ✍️ 線上填，AI 幫你寫清楚
              </span>
              <div className="flex gap-2">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="姓名（必填）"
                  maxLength={50}
                  className="flex-1 bg-gray-50 dark:bg-gray-700 p-2 rounded-lg border border-gray-200 dark:border-gray-600 text-sm"
                />
                <input
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  placeholder="聯絡方式（選填：分機/email）"
                  maxLength={100}
                  className="flex-1 bg-gray-50 dark:bg-gray-700 p-2 rounded-lg border border-gray-200 dark:border-gray-600 text-sm"
                />
              </div>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="你想要什麼工具 / 解決什麼問題？"
                rows={4}
                maxLength={1000}
                className="bg-gray-50 dark:bg-gray-700 p-3 rounded-xl border border-gray-200 dark:border-gray-600 text-sm outline-none focus:border-[var(--color-clay-purple)]"
              />

              <div className="flex gap-2">
                <button
                  onClick={runAi}
                  disabled={aiLoading}
                  className="flex-1 py-2 rounded-full border-2 border-[var(--color-clay-purple)]/40 text-[var(--color-clay-purple)] font-extrabold text-sm hover:bg-[var(--color-clay-purple)]/5 disabled:opacity-60"
                >
                  {aiLoading ? "AI 思考中…" : "✨ AI 幫我寫清楚"}
                </button>
                <button
                  onClick={submit}
                  disabled={sending}
                  className="flex-1 py-2 rounded-full bg-[var(--color-clay-purple)] text-white font-extrabold text-sm disabled:opacity-60"
                >
                  {sending ? "送出中…" : "送出"}
                </button>
              </div>

              {(optimized || suggestions.length > 0) && (
                <div className="bg-[var(--color-clay-purple)]/8 border border-[var(--color-clay-purple)]/20 rounded-xl p-3 text-sm flex flex-col gap-2">
                  <span className="font-extrabold text-[var(--color-text-dark)]">
                    ✨ AI 建議
                  </span>
                  {optimized && (
                    <div className="flex flex-col gap-1">
                      <p className="text-[var(--color-text-mid)]">
                        優化版：{optimized}
                      </p>
                      <button
                        onClick={() => {
                          setMessage(optimized);
                        }}
                        className="self-start text-xs font-bold text-[var(--color-clay-purple)] border border-[var(--color-clay-purple)]/30 rounded-full px-3 py-1 hover:bg-[var(--color-clay-purple)]/10"
                      >
                        採用這版
                      </button>
                    </div>
                  )}
                  {suggestions.length > 0 && (
                    <div>
                      <p className="font-bold text-[var(--color-text-mid)]">
                        可以再補充：
                      </p>
                      <ul className="list-disc ml-5 text-[var(--color-text-mid)]">
                        {suggestions.map((s, i) => (
                          <li key={i}>{s}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {err && <p className="text-sm text-red-500 font-bold">{err}</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: `RequestButton.jsx` 改開 RequestCard**

整檔取代（移除 `type` 概念，改用 RequestCard）：

```jsx
"use client";

import { useState } from "react";
import RequestCard from "@/components/RequestCard";

/** client 觸發鈕 — 讓 server 元件（Footer / 首頁）也能開提需求卡。 */
export default function RequestButton({ className = "", children }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        {children}
      </button>
      {open && <RequestCard onClose={() => setOpen(false)} />}
    </>
  );
}
```

> 注意：`RequestButton` 原本接受 `type` prop（Phase 2）。現在 footer 用法 `<RequestButton type="feature" ...>` 的 `type` 會被忽略（無害）；Task 6 會順手把 footer 的 `type="feature"` 移除。

- [ ] **Step 3: build + 視覺實測（controller）**

Run: `npm run build` → 成功。
Controller 視覺：local dev 點 footer「提需求」→ 跳新雙欄卡；填姓名+需求→「✨AI幫我寫清楚」出現優化版+建議（需 GEMINI_API_KEY，本機 .env.local 有）；採用鈕填回；送出（本機會真的寫 prod requests + Discord — 測試時注意，或先只驗 AI 與版面）。手機寬度雙欄改上下疊。

- [ ] **Step 4: Commit**

```bash
git add src/components/RequestCard.jsx src/components/RequestButton.jsx
git commit -m "feat(request): 新增雙欄提需求卡 RequestCard（左 mailto / 右免登入表單 + AI 輔助）

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

## Task 6: 首頁 §about + Footer 提需求接 RequestCard

**Files:** Modify `app/page.jsx`, `src/components/Footer.jsx`

- [ ] **Step 1: `app/page.jsx` §about「提需求給我」mailto → RequestButton**

檔頭 import 加：`import RequestButton from "@/components/RequestButton";`

把 §about 的（約 line 338-343）：

```jsx
<a
  href="mailto:jasonlin@simhope.com.tw?subject=AI工具需求"
  className="px-8 py-4 rounded-full bg-white dark:bg-gray-700 text-[var(--color-text-dark)] dark:text-gray-100 font-extrabold text-base border-2 border-[#1e1b4b]/15 dark:border-white/10 shadow-sm hover:-translate-y-1 hover:shadow-md transition-all"
>
  💬 提需求給我
</a>
```

改成：

```jsx
<RequestButton className="px-8 py-4 rounded-full bg-white dark:bg-gray-700 text-[var(--color-text-dark)] dark:text-gray-100 font-extrabold text-base border-2 border-[#1e1b4b]/15 dark:border-white/10 shadow-sm hover:-translate-y-1 hover:shadow-md transition-all cursor-pointer">
  💬 提需求給我
</RequestButton>
```

> `app/page.jsx` 已是 `"use client"`（首頁有搜尋/狀態），可直接用 RequestButton。若不是，確認後加 — grep 檔頭。

- [ ] **Step 2: `Footer.jsx` 的 RequestButton 移除 `type` prop**

Footer 既有 `<RequestButton type="feature" className="...">提需求</RequestButton>` → 移除 `type="feature"`（現在 RequestButton 不吃 type）。其餘不動。

- [ ] **Step 3: build + 視覺實測（controller）+ Commit**

Run: `npm run build` → 成功。Controller：首頁 §about「提需求給我」+ footer「提需求」都開同一張新卡。

```bash
git add app/page.jsx src/components/Footer.jsx
git commit -m "feat(request): 首頁與 footer 提需求統一接 RequestCard

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

## Task 7: LoginModal 雙 tab + 開發者註冊流程 + devStatus 狀態

**Files:** Modify `src/components/LoginModal.jsx`（整檔重寫）

加 `initialTab` prop（'login'|'register'，預設 'login'）。登入 tab = 現有三種登入。開發者註冊 tab = Google/passkey + 理由 → 送出申請（`/api/request` type=access）；依 `useAuth().profile.devStatus` / `isDeveloper` / `isAdmin` 顯示狀態。

- [ ] **Step 1: 整檔取代 `src/components/LoginModal.jsx`**

```jsx
"use client";

import { useState, useEffect } from "react";
import { auth } from "@/lib/firebase";
import {
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
} from "firebase/auth";
import { loginWithPasskey, passkeySupported } from "@/lib/passkey";
import { useAuth } from "@/context/AuthContext";

/**
 * 登入 / 開發者註冊 modal。
 * @param {{ onClose: () => void, initialTab?: 'login'|'register' }} props
 */
export default function LoginModal({ onClose, initialTab = "login" }) {
  const { user, profile, isAdmin, isDeveloper } = useAuth();
  const [tab, setTab] = useState(initialTab);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPasskey, setShowPasskey] = useState(false);
  const [applied, setApplied] = useState(false);

  useEffect(() => {
    setShowPasskey(passkeySupported());
  }, []);

  const mapAuthErr = (err) =>
    ({
      "auth/invalid-credential": "帳號或密碼錯誤，請確認後再試。",
      "auth/user-not-found": "查無此帳號，請聯絡系統管理員。",
      "auth/wrong-password": "帳號或密碼錯誤，請確認後再試。",
      "auth/too-many-requests": "登入失敗次數過多，請稍後再試。",
      "auth/popup-closed-by-user": "登入視窗被關閉，請再試一次。",
      "auth/popup-blocked": "瀏覽器擋住了登入視窗，請允許彈出視窗後再試。",
    })[err.code] || "操作失敗，請稍後再試。";

  // 登入 tab：成功即關閉
  const handlePasskeyLogin = async () => {
    setError("");
    setLoading(true);
    try {
      await loginWithPasskey();
      onClose();
    } catch (err) {
      setError(
        err?.name === "NotAllowedError"
          ? "已取消，或這台裝置沒有註冊過 Face ID / 指紋。"
          : err?.message || "passkey 登入失敗。",
      );
    } finally {
      setLoading(false);
    }
  };
  const handlePasswordLogin = async (e) => {
    e.preventDefault();
    if (!email || !password) return;
    setError("");
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      onClose();
    } catch (err) {
      setError(mapAuthErr(err));
    } finally {
      setLoading(false);
    }
  };
  // Google：登入 tab 成功即關；註冊 tab 成功則「不關」，留在頁面填理由
  const handleGoogle = async (closeOnSuccess) => {
    setError("");
    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      await signInWithPopup(auth, provider);
      if (closeOnSuccess) onClose();
    } catch (err) {
      setError(mapAuthErr(err));
    } finally {
      setLoading(false);
    }
  };
  const handlePasskeyForRegister = async () => {
    setError("");
    setLoading(true);
    try {
      await loginWithPasskey(); /* 不關，留下填理由 */
    } catch (err) {
      setError(
        err?.name === "NotAllowedError"
          ? "已取消或此裝置無 passkey。"
          : err?.message || "passkey 失敗。",
      );
    } finally {
      setLoading(false);
    }
  };

  const submitApplication = async () => {
    if (!reason.trim()) return setError("請填寫申請理由");
    setError("");
    setLoading(true);
    try {
      const token = await auth.currentUser.getIdToken();
      const res = await fetch("/api/request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ type: "access", reason: reason.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "送出失敗");
      setApplied(true);
    } catch (e) {
      setError(e.message || "送出失敗，請稍後再試");
    } finally {
      setLoading(false);
    }
  };

  const devStatus = profile?.devStatus;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-[var(--color-card-bg)] rounded-3xl shadow-2xl border border-[var(--color-card-border)] w-full max-w-sm mx-4 p-8 flex flex-col gap-5">
        {/* tab bar */}
        <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
          {[
            ["login", "登入"],
            ["register", "開發者註冊"],
          ].map(([k, lbl]) => (
            <button
              key={k}
              onClick={() => {
                setTab(k);
                setError("");
              }}
              className={`flex-1 py-2 rounded-lg text-sm font-extrabold transition ${tab === k ? "bg-[var(--color-card-bg)] text-[var(--color-clay-purple)] shadow-sm" : "text-[var(--color-text-mid)]"}`}
            >
              {lbl}
            </button>
          ))}
          <button
            onClick={onClose}
            className="w-8 text-gray-400 hover:text-gray-700 text-lg"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl px-4 py-2.5 text-sm font-bold text-red-600 dark:text-red-400">
            {error}
          </div>
        )}

        {tab === "login" ? (
          <>
            <button
              type="button"
              onClick={() => handleGoogle(true)}
              disabled={loading}
              className="w-full py-3 rounded-xl bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-600 text-[var(--color-text-dark)] font-extrabold text-sm shadow-sm hover:border-gray-300 transition-all disabled:opacity-60 flex items-center justify-center gap-2"
            >
              用 Google 登入
            </button>
            {showPasskey && (
              <button
                type="button"
                onClick={handlePasskeyLogin}
                disabled={loading}
                className="w-full py-3 rounded-xl bg-[var(--color-clay-purple)]/10 border-2 border-[var(--color-clay-purple)]/30 text-[var(--color-clay-purple)] font-extrabold text-sm hover:bg-[var(--color-clay-purple)]/20 transition-all disabled:opacity-60"
              >
                🔐 用 Face ID / 指紋登入
              </button>
            )}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-[var(--color-card-border)]" />
              <span className="text-xs font-bold text-[var(--color-text-mid)]">
                或用帳號密碼
              </span>
              <div className="flex-1 h-px bg-[var(--color-card-border)]" />
            </div>
            <form
              onSubmit={handlePasswordLogin}
              className="flex flex-col gap-3"
            >
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@simhope.com.tw"
                className="w-full px-4 py-2.5 rounded-xl border border-[var(--color-card-border)] bg-[var(--color-card-bg)] text-[var(--color-text-dark)] font-semibold text-sm outline-none focus:border-[var(--color-clay-purple)]"
              />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-2.5 rounded-xl border border-[var(--color-card-border)] bg-[var(--color-card-bg)] text-[var(--color-text-dark)] font-semibold text-sm outline-none focus:border-[var(--color-clay-purple)]"
              />
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-xl bg-gradient-to-br from-[var(--color-clay-purple)] to-[var(--color-clay-blue)] text-white font-extrabold text-sm shadow-md hover:-translate-y-0.5 transition-all disabled:opacity-60"
              >
                {loading ? "登入中..." : "登入"}
              </button>
            </form>
            <p className="text-center text-xs text-[var(--color-text-mid)]">
              想上架工具？切到「開發者註冊」申請開發權限。
            </p>
          </>
        ) : (
          // ── 開發者註冊 tab ──
          <div className="flex flex-col gap-4">
            {isAdmin || isDeveloper ? (
              <p className="text-center text-sm font-bold text-[var(--color-text-dark)] py-6">
                你已經是開發者了 ✅<br />
                <span className="font-semibold text-[var(--color-text-mid)]">
                  可直接到「我的工具 / 管理後台」上架。
                </span>
              </p>
            ) : applied || devStatus === "pending" ? (
              <div className="text-center py-6">
                <p className="text-2xl mb-2">🕓</p>
                <p className="font-bold text-[var(--color-text-dark)]">
                  申請審核中
                </p>
                <p className="text-sm text-[var(--color-text-mid)] font-semibold mt-1">
                  已送出，請等管理員核准。核准後重新整理即可上架。
                </p>
              </div>
            ) : !user ? (
              <>
                <p className="text-sm text-[var(--color-text-mid)] font-semibold">
                  先用公司帳號登入，再填申請理由：
                </p>
                <button
                  type="button"
                  onClick={() => handleGoogle(false)}
                  disabled={loading}
                  className="w-full py-3 rounded-xl bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-600 text-[var(--color-text-dark)] font-extrabold text-sm shadow-sm hover:border-gray-300 disabled:opacity-60"
                >
                  用 Google 註冊
                </button>
                {showPasskey && (
                  <button
                    type="button"
                    onClick={handlePasskeyForRegister}
                    disabled={loading}
                    className="w-full py-3 rounded-xl bg-[var(--color-clay-purple)]/10 border-2 border-[var(--color-clay-purple)]/30 text-[var(--color-clay-purple)] font-extrabold text-sm disabled:opacity-60"
                  >
                    🔐 用 Face ID / 指紋
                  </button>
                )}
              </>
            ) : (
              <>
                <p className="text-sm text-[var(--color-text-mid)] font-semibold">
                  以 <strong>{user.email || profile?.displayName}</strong>{" "}
                  申請。
                </p>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="你想開發 / 上架什麼？（讓管理員了解你的用途）"
                  rows={4}
                  maxLength={1000}
                  className="w-full px-4 py-2.5 rounded-xl border border-[var(--color-card-border)] bg-[var(--color-card-bg)] text-[var(--color-text-dark)] font-semibold text-sm outline-none focus:border-[var(--color-clay-purple)]"
                />
                <button
                  type="button"
                  onClick={submitApplication}
                  disabled={loading}
                  className="w-full py-3 rounded-xl bg-gradient-to-br from-[var(--color-clay-purple)] to-[var(--color-clay-blue)] text-white font-extrabold text-sm shadow-md disabled:opacity-60"
                >
                  {loading ? "送出中..." : "📩 送出申請"}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: build + 視覺實測（controller）**

Run: `npm run build` → 成功。
Controller（local dev）：開 modal → 兩 tab 可切。登入 tab 行為同舊。開發者註冊 tab：未登入顯示「用 Google 註冊」；登入後顯示理由欄；送出 → 「申請審核中」。已登入 admin 開註冊 tab → 「你已是開發者」。

- [ ] **Step 3: Commit**

```bash
git add src/components/LoginModal.jsx
git commit -m "feat(auth): LoginModal 雙 tab（登入 / 開發者註冊）+ 申請流程 + 審核狀態

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

## Task 8: Navbar — 按鈕文案 + 手機下拉選單

**Files:** Modify `src/components/Navbar.jsx`

- [ ] **Step 1: 登入鈕文案 + 加手機選單 state**

1. 檔頭 `export default function Navbar()` 內加：`const [menuOpen, setMenuOpen] = useState(false);`（`useState` 已 import）。
2. 把登出狀態的登入按鈕文字 `👨‍💻 開發者登入` 改成 `登入👨‍💻 / 註冊🔑`。

- [ ] **Step 2: 加 ☰ 鈕（手機顯示）+ 下拉面板**

在 `<nav>` 內、右側 div 之前（或之內最右）加一顆只在手機顯示的漢堡（`md:hidden`）：

```jsx
<button
  onClick={() => setMenuOpen((o) => !o)}
  className="md:hidden w-9 h-9 rounded-full border border-gray-200 dark:border-gray-600 flex items-center justify-center text-lg"
  aria-label="選單"
>
  ☰
</button>
```

在 `</nav>` 之後（仍在最外層 fragment 內）加下拉面板：

```jsx
{
  menuOpen && (
    <div className="md:hidden bg-[var(--color-nav-bg)] border-b border-[var(--color-nav-border)] px-6 py-4 flex flex-col gap-3 text-sm font-bold text-gray-600 dark:text-gray-300">
      <Link href="/hub" onClick={() => setMenuOpen(false)}>
        資源中心
      </Link>
      <Link href="/docs" onClick={() => setMenuOpen(false)}>
        文件
      </Link>
      <Link href="/faq" onClick={() => setMenuOpen(false)}>
        FAQ
      </Link>
      <Link href="/changelog" onClick={() => setMenuOpen(false)}>
        更新日誌
      </Link>
      <Link href="/#about" onClick={() => setMenuOpen(false)}>
        關於這個平台
      </Link>
      <Link href="/#feedback" onClick={() => setMenuOpen(false)}>
        同仁回饋
      </Link>
      <Link
        href="/hub"
        onClick={() => setMenuOpen(false)}
        className="text-[var(--color-clay-purple)]"
      >
        🔧 找工具
      </Link>
      <div className="h-px bg-[var(--color-nav-border)]" />
      {!loading && !user && (
        <button
          onClick={() => {
            setMenuOpen(false);
            setShowLogin(true);
          }}
          className="text-left text-[var(--color-clay-purple)]"
        >
          登入👨‍💻 / 註冊🔑
        </button>
      )}
      {!loading && user && (
        <>
          <Link
            href={isAdmin ? "/admin" : "/dashboard"}
            onClick={() => setMenuOpen(false)}
          >
            🛠️ {isAdmin ? "管理後台" : "我的工具"}
          </Link>
          <button
            onClick={() => {
              setMenuOpen(false);
              signOut(auth);
            }}
            className="text-left text-red-500"
          >
            登出
          </button>
        </>
      )}
      <button onClick={toggle} className="text-left">
        {isDark ? "☀️ 淺色" : "🌙 深色"}
      </button>
    </div>
  );
}
```

> 桌機橫列連結（`hidden md:inline`）完全不動。`Link`、`signOut`、`auth`、`toggle`、`isDark`、`isAdmin`、`user`、`loading`、`setShowLogin` 都已在 Navbar 既有 scope（grep 確認）。

- [ ] **Step 3: build + 視覺實測（controller）+ Commit**

Run: `npm run build` → 成功。Controller：桌機 navbar 不變、登入鈕顯示「登入👨‍💻 / 註冊🔑」；手機寬度出現 ☰ → 點開下拉所有連結 + 登入/註冊 + 深色；點連結收合。

```bash
git add src/components/Navbar.jsx
git commit -m "feat(chrome): Navbar 登入鈕改文案 + 手機下拉選單

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

## Task 9: /access「申請成為開發者」改開 LoginModal 註冊 tab

**Files:** Modify `app/access/page.jsx`

把舊的 `RequestModal type="access"` 換成開 `LoginModal initialTab="register"`（統一到 F1 流程）。

- [ ] **Step 1: 改 import + 觸發**

1. import：移除 `import RequestModal from "@/components/RequestModal";`，改 `import LoginModal from "@/components/LoginModal";`
2. 狀態 `showReq` 改名 `showLogin`（或保留變數名、只換元件）。
3. 「📩 申請成為開發者」按鈕 onClick 不變（開 modal）。
4. 底部 `{showReq && <RequestModal type="access" onClose=... />}` 改 `{showLogin && <LoginModal initialTab="register" onClose={() => setShowLogin(false)} />}`。

- [ ] **Step 2: build + 視覺實測 + Commit**

Run: `npm run build` → 成功。Controller：/access（viewer）按「申請成為開發者」→ 開 LoginModal 的「開發者註冊」tab。

```bash
git add app/access/page.jsx
git commit -m "feat(access): 申請成為開發者改走 LoginModal 註冊 tab（統一流程）

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

> 註：Phase 2 的 `src/components/RequestModal.jsx` 此後無人使用（footer 改 RequestCard、access 改 LoginModal）。**可在本 task 一併刪除** `src/components/RequestModal.jsx`（grep 確認無其他 import 後 `git rm`）。

---

## Task 10: RequestInbox（admin 申請/需求收件匣）+ /admin tab

**Files:** Create `src/components/RequestInbox.jsx`; Modify `app/admin/page.jsx`

- [ ] **Step 1: 建立 `src/components/RequestInbox.jsx`**

```jsx
"use client";

import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import {
  collection,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
} from "firebase/firestore";

export default function RequestInbox() {
  const [reqs, setReqs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("pending"); // pending | all

  const load = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, "requests"));
      setReqs(
        snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort(
            (a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0),
          ),
      );
    } catch (e) {
      console.error("載入 requests 失敗（rules 是否已發布？）:", e);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);

  const approve = async (r) => {
    if (!r.uid) return;
    try {
      await updateDoc(doc(db, "users", r.uid), {
        role: "developer",
        devStatus: "approved",
      });
      await updateDoc(doc(db, "requests", r.id), { status: "approved" });
      await load();
    } catch (e) {
      alert("核准失敗：" + (e.code || e.message));
    }
  };
  const reject = async (r) => {
    try {
      if (r.uid)
        await updateDoc(doc(db, "users", r.uid), { devStatus: "rejected" });
      await updateDoc(doc(db, "requests", r.id), { status: "rejected" });
      await load();
    } catch (e) {
      alert("操作失敗：" + (e.code || e.message));
    }
  };
  const markHandled = async (r) => {
    try {
      await updateDoc(doc(db, "requests", r.id), { status: "handled" });
      await load();
    } catch (e) {
      alert("操作失敗：" + (e.code || e.message));
    }
  };

  const shown = reqs.filter((r) =>
    filter === "pending" ? r.status === "pending" : true,
  );
  const access = shown.filter((r) => r.type === "access");
  const feature = shown.filter((r) => r.type === "feature");

  const badge = (s) =>
    ({
      pending: "🕓 待處理",
      approved: "✅ 已核准",
      rejected: "✕ 已拒絕",
      handled: "✅ 已處理",
    })[s] || s;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex justify-between items-center">
        <h3 className="font-extrabold text-lg text-[var(--color-text-dark)]">
          申請 / 需求（{shown.length}）
        </h3>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="bg-gray-50 dark:bg-gray-700 p-2 rounded-lg border border-gray-200 dark:border-gray-600 text-sm"
        >
          <option value="pending">待處理</option>
          <option value="all">全部</option>
        </select>
      </div>

      {loading ? (
        <p className="text-[var(--color-text-mid)]">載入中…</p>
      ) : (
        <>
          <div>
            <p className="text-xs font-extrabold text-[var(--color-text-mid)] uppercase tracking-wider mb-2">
              🔑 開發者申請
            </p>
            <div className="flex flex-col gap-2">
              {access.map((r) => (
                <div
                  key={r.id}
                  className="bg-[var(--color-card-bg)] border border-[var(--color-card-border)] rounded-xl p-3 text-sm"
                >
                  <div className="flex justify-between">
                    <b className="text-[var(--color-text-dark)]">
                      {r.name || r.email || r.uid}
                    </b>
                    <span className="text-xs text-[var(--color-text-mid)]">
                      {badge(r.status)}
                    </span>
                  </div>
                  <p className="text-[var(--color-text-mid)] mt-1">{r.email}</p>
                  <p className="text-[var(--color-text-mid)] mt-1">
                    理由：{r.reason}
                  </p>
                  {r.status === "pending" && (
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={() => approve(r)}
                        className="px-3 py-1 rounded-full bg-emerald-500 text-white text-xs font-bold"
                      >
                        ✓ 核准（設為開發者）
                      </button>
                      <button
                        onClick={() => reject(r)}
                        className="px-3 py-1 rounded-full bg-red-100 text-red-600 text-xs font-bold"
                      >
                        ✕ 拒絕
                      </button>
                    </div>
                  )}
                </div>
              ))}
              {access.length === 0 && (
                <p className="text-[var(--color-text-mid)] text-sm">無</p>
              )}
            </div>
          </div>

          <div>
            <p className="text-xs font-extrabold text-[var(--color-text-mid)] uppercase tracking-wider mb-2">
              💬 提需求
            </p>
            <div className="flex flex-col gap-2">
              {feature.map((r) => (
                <div
                  key={r.id}
                  className="bg-[var(--color-card-bg)] border border-[var(--color-card-border)] rounded-xl p-3 text-sm"
                >
                  <div className="flex justify-between">
                    <b className="text-[var(--color-text-dark)]">
                      {r.name}
                      {r.contact ? `（${r.contact}）` : ""}
                    </b>
                    <span className="text-xs text-[var(--color-text-mid)]">
                      {badge(r.status)}
                    </span>
                  </div>
                  <p className="text-[var(--color-text-mid)] mt-1">
                    {r.message}
                  </p>
                  {r.status === "pending" && (
                    <button
                      onClick={() => markHandled(r)}
                      className="mt-2 px-3 py-1 rounded-full bg-[var(--color-clay-purple)] text-white text-xs font-bold"
                    >
                      標記已處理
                    </button>
                  )}
                </div>
              ))}
              {feature.length === 0 && (
                <p className="text-[var(--color-text-mid)] text-sm">無</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: `app/admin/page.jsx` 加 tab**

1. import：`import RequestInbox from "@/components/RequestInbox";`
2. 沿用既有 sidebar tab 模式（同 Task 8 of Phase 2 加 FAQ 的方式）：加一顆 tab 鈕 `onClick={() => setActiveTab("inbox")}` label「📥 申請 / 需求」。
3. 內容區加 `{activeTab === "inbox" && <div className="...卡片容器...">{<RequestInbox />}</div>}`（沿用其他 tab 的容器樣式）。

- [ ] **Step 3: build + 視覺實測（controller）+ Commit**

Run: `npm run build` → 成功。Controller：admin → 📥 申請/需求 tab；開發者申請可核准（該 user role→developer）/拒絕；提需求可標記已處理；待處理/全部切換。**需 firestore.rules 已發布（Task 4）才寫得進。**

```bash
git add src/components/RequestInbox.jsx app/admin/page.jsx
git commit -m "feat(admin): 申請/需求統一收件匣（核准設 role / 標記已處理 / 待處理-全部）

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

## Task 11: 整合驗收

- [ ] **Step 1: 全量 build + lint + 斷言**

Run: `npm run build` → 成功；`npm run lint` → 無新錯；`node scripts/__verify-ratelimit.mjs` → `✅`。

- [ ] **Step 2: 對照 spec §8 驗收標準逐項實測（controller，local dev + 連線 Chrome）**

逐項：navbar 文案 + 手機 ☰ 下拉；LoginModal 雙 tab + 註冊→審核中 + 已是開發者；提需求卡（首頁+footer）左 mailto/右表單 + AI 輔助 + 送出→Discord；`/api/request` access 無 token 401 / feature 無 name 400 / 超量 429；admin 收件匣 核准→變 developer / 標記已處理 / 待處理-全部；RWD（手機選單 + 提需求卡疊）。

- [ ] **Step 3: 用 superpowers:finishing-a-development-branch 決定合併（建議開 PR）。**

- [ ] **Step 4: 部署待辦（人工）**

1. merge PR → Vercel deploy **Ready 綠燈**。
2. **Firebase Console 重新發布 `firestore.rules`**（requests update/delete）—— 否則 admin 收件匣核准/標記會 deny。
3. （`GEMINI_API_KEY` / `DISCORD_WEBHOOK_URL` / `FIREBASE_SERVICE_ACCOUNT` 皆已設，無新 env。）
4. **連 live 站驗證**：手機選單、提需求卡+AI+Discord、開發者註冊→收件匣核准→該帳號變 developer。

---

## Self-Review（plan 對照 spec）

- **§1 F1**：Task 7（LoginModal 雙 tab + 申請 + devStatus）+ Task 3（access 分支寫 devStatus）+ Task 9（/access 接同流程）+ Task 8（navbar 文案）。✅
- **§2 F2**：Task 5（RequestCard）+ Task 2（refine-request）+ Task 3（feature 分支）+ Task 6（首頁/footer 接線）+ Task 1（限流）。✅
- **§3 C**：Task 10（RequestInbox + admin tab）+ Task 4（rules update/delete）。✅
- **§4 A**：Task 8（Navbar 手機選單）。✅
- **§5 資料/設定**：devStatus（Task 3/7）、requests.status/name/contact/reason（Task 3/10）、/api/request 改（Task 3）、/api/refine-request（Task 2）、rateLimit（Task 1）、rules（Task 4）。✅
- **Placeholder 掃描**：各 task 附完整碼或精確指令；admin tab 插入沿用 Phase 2 既有模式（grep 定位）。✅
- **型別一致性**：RequestCard POST `{type:'feature',name,contact,message}` ↔ /api/request feature 分支讀同名；LoginModal 申請 POST `{type:'access',reason}` ↔ access 分支讀 reason；RequestInbox 讀 `type/status/name/contact/message/reason/uid/email` ↔ /api/request 寫入同名；rateLimit(key,{limit,windowMs},clock) ↔ 斷言與 caller 一致；devStatus 值 pending/approved/rejected 在 Task 3/7/10 一致。✅

---

## 已知取捨 / backlog

- rate limit 記憶體版（serverless 非全域精確）——擋洗版夠用，嚴格全域需外部 KV（YAGNI）。
- 核准雙寫（user role/devStatus + request.status）非交易性——冪等、admin 重按可修正。
- 首頁 metrics 動態化、/faq 起手內容——backlog。
- Phase 2 `RequestModal.jsx` 於 Task 9 刪除（已無使用者）。
