# ChatbotWidget 誠實化 — 實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把假 AI 對話浮鈕換成誠實的「需要幫忙?」面板，導流到 /hub（找工具）+ RequestCard（提需求）。

**Architecture:** 重寫單檔 `src/components/ChatbotWidget.jsx`；layout 掛載不變；提需求重用 `RequestCard`（`<Modal>`，#25）。無 API/rules/migration。

**Tech Stack:** Next.js 16 + React 19 client component。import 別名 `@/* → src/*`。

**設計來源：** [spec](../specs/2026-06-08-chatbot-honesty-design.md)。

**驗證慣例：** `npm run lint` 基準 5 problems 不增；commit Conventional + 結尾 `Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>`。

---

## Task 1: 重寫 `src/components/ChatbotWidget.jsx`

**Files:**

- Modify (整檔取代): `src/components/ChatbotWidget.jsx`

- [ ] **Step 1: 以下列內容整檔覆寫**

```jsx
"use client";

import { useState } from "react";
import Link from "next/link";
import RequestCard from "@/components/RequestCard";

/**
 * 右下角浮動「需要幫忙?」入口（誠實版，不假裝 AI 對話）。
 * 兩個真實動作：找現有工具（/hub）、提需求給經企室（RequestCard）。
 */
export default function ChatbotWidget() {
  const [open, setOpen] = useState(false);
  const [showReq, setShowReq] = useState(false);

  return (
    <>
      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
        {/* 面板 */}
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
                  找現成工具，或把需求告訴經企室
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

            <div className="p-4 flex flex-col gap-2">
              <Link
                href="/hub"
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 px-4 py-3 rounded-xl border border-[var(--color-card-border)] bg-[var(--color-card-bg)] hover:border-[var(--color-clay-purple)] transition font-bold text-sm text-[var(--color-text-dark)]"
              >
                <span className="text-xl">🔍</span>
                <span className="flex flex-col">
                  找現有工具
                  <span className="text-xs font-semibold text-[var(--color-text-mid)]">
                    到資源中心搜尋
                  </span>
                </span>
              </Link>
              <button
                type="button"
                onClick={() => {
                  setShowReq(true);
                  setOpen(false);
                }}
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

- [ ] **Step 2: lint**

Run: `npm run lint` → 維持 5 problems（無新增）。

- [ ] **Step 3: grep 確認假對話歸零**

Run: `grep -nE "建置中|輸入中|setTimeout|messages" src/components/ChatbotWidget.jsx`
Expected: 無輸出（假對話 / 假延遲 / 訊息陣列全移除）。

- [ ] **Step 4: commit**

```bash
git add src/components/ChatbotWidget.jsx
git commit -m "fix(ui): ChatbotWidget 誠實化 — 拔假對話、改導流面板 (audit #16)

移除 input/假打字/固定「建置中」回覆/「AI 小幫手」框架；浮鈕改「需要幫忙?」
面板，兩動作導流 /hub（找工具）+ RequestCard（提需求）。重用 #25 <Modal>。

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

## Task 2: build + E2E 驗證

**Files:** 無（驗證）

- [ ] **Step 1: build**

Run: `npm run build` → 綠。

- [ ] **Step 2: 起 dev server**

背景 `npm run dev`，等 `Ready`（localhost:3000）。若 port 占用先 `taskkill //PID <pid> //F`（netstat :3000）。

- [ ] **Step 3: playwright E2E（公開、免登入）**

navigate `http://localhost:3000`（resize 1280×900）。用 browser_evaluate / browser_click：

1. 點右下浮鈕（`button[aria-label="需要幫忙?"]`）→ 面板出現。
2. evaluate 確認面板**無** `textarea`、無「輸入中」、無「建置中」字樣；有「找現有工具」「提需求給經企室」兩動作。
3. 點「找現有工具」→ URL 變 `/hub`。
4. 回首頁、再開浮鈕 → 點「提需求給經企室」→ `[role="dialog"]`（RequestCard）出現、浮動面板關閉。
5. （手機 RWD 留 Jason：小螢幕浮鈕/面板不擋內容。）

- [ ] **Step 4: 停 dev server**

`taskkill //PID <pid> //F`（netstat :3000）。

---

## 完成後

- 推 `feature-chatbot-honesty` → 開 PR（base main；body：行為前後對比、E2E 結果、待 Jason 正式站點按 + 手機 RWD）。
- 獨立 reviewer subagent → CI/Vercel 綠 → 等 Jason merge。

---

## Self-Review（plan vs spec）

- **Spec coverage**：§3 架構→T1（單檔重寫）；§4 行為（state/浮鈕圖示💬/面板兩動作/刪假對話/RequestCard 接線）→T1 完整碼；§6 測試→T1 Step3 grep + T2 E2E。✓
- **Placeholder scan**：完整元件碼、exact grep/E2E 步驟；無 TBD。✓
- **一致性**：`open`/`showReq` state、`RequestCard onClose`、import `@/components/RequestCard` + `next/link` 一致；浮鈕與面板皆 💬、aria-label「需要幫忙?」一致。✓
