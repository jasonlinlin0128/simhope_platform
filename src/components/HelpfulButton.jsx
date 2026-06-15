"use client";

import { useState, useEffect } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { track } from "@/lib/track";

/**
 * 詳情頁「👍 有幫助」。匿名 + localStorage/session 去重；count 讀自公開 analytics/toolHelpful。
 * @param {{ toolId: string }} props
 */
export default function HelpfulButton({ toolId }) {
  const [count, setCount] = useState(null); // null = 載入中
  const [marked, setMarked] = useState(false); // 初值一律 false → SSR/hydration 一致

  useEffect(() => {
    if (!toolId || typeof window === "undefined") return;
    let cancelled = false;
    // async 邊界內 setState（非 effect 同步呼叫）→ 不觸發 set-state-in-effect；
    // 初次 render 已標記態為 false，掛載後才從 localStorage 校正，避免 hydration mismatch。
    (async () => {
      try {
        if (
          localStorage.getItem(`simhope_helpful_${toolId}`) === "1" &&
          !cancelled
        )
          setMarked(true);
      } catch {
        /* 無痕/停用 → 視為未標記 */
      }
      try {
        const s = await getDoc(doc(db, "analytics", "toolHelpful"));
        if (cancelled) return;
        const v = s.exists() ? s.data()[toolId] : 0;
        setCount(typeof v === "number" ? v : 0);
      } catch {
        if (!cancelled) setCount(0);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [toolId]);

  const onClick = () => {
    if (marked) return;
    track("tool_helpful", { toolId });
    try {
      localStorage.setItem(`simhope_helpful_${toolId}`, "1");
    } catch {
      /* 忽略 */
    }
    setMarked(true);
    setCount((c) => (typeof c === "number" ? c + 1 : 1));
  };

  return (
    <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-[var(--color-card-border)] pt-6">
      <span className="text-sm font-bold text-[var(--color-text-mid)]">
        這個工具對你有幫助嗎？
      </span>
      <button
        type="button"
        onClick={onClick}
        disabled={marked}
        className="px-4 py-2 rounded-full bg-[var(--color-clay-purple)] text-white font-extrabold text-sm disabled:opacity-60 disabled:cursor-default"
      >
        👍 {marked ? "已標記有幫助" : "有幫助"}
      </button>
      {typeof count === "number" && count > 0 && (
        <span className="text-sm text-[var(--color-text-mid)]">
          {count} 人覺得有幫助
        </span>
      )}
    </div>
  );
}
