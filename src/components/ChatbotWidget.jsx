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
