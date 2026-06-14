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
