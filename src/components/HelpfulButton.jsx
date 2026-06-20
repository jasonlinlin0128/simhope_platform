"use client";

import { useState, useEffect } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";

/**
 * 詳情頁「👍 有幫助」。**需登入才能按**（防匿名灌水公開 badge）；後端 per-(uid,toolId) 去重。
 * count 讀自公開 analytics/toolHelpful（任何人都看得到數字，但只有登入者能 +1）。
 * @param {{ toolId: string }} props
 */
export default function HelpfulButton({ toolId }) {
  const { user, loading } = useAuth();
  const [count, setCount] = useState(null); // null = 載入中
  const [marked, setMarked] = useState(false); // 初值一律 false → SSR/hydration 一致
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!toolId || typeof window === "undefined") return;
    let cancelled = false;
    // async 邊界內 setState（非 effect 同步呼叫）→ 不觸發 set-state-in-effect；
    // 初次 render 標記態為 false，掛載後才從 localStorage 校正，避免 hydration mismatch。
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

  const canVote = !!user && !marked && !busy;

  const onClick = async () => {
    if (!canVote) return;
    setBusy(true);
    setErr("");
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/tool-helpful", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ toolId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "操作失敗，請稍後再試");
      // counted:true → 首次計入，count++；counted:false → 之前已投過，不重複加但仍標記。
      if (data.counted) setCount((c) => (typeof c === "number" ? c + 1 : 1));
      setMarked(true);
      try {
        localStorage.setItem(`simhope_helpful_${toolId}`, "1");
      } catch {
        /* 忽略 */
      }
    } catch (e) {
      setErr(e.message || "操作失敗，請稍後再試");
    } finally {
      setBusy(false);
    }
  };

  // 按鈕 label：已標記 / 送出中 / 未登入 / 可按
  const label = marked ? "已標記有幫助" : busy ? "送出中…" : "有幫助";

  return (
    <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-[var(--color-card-border)] pt-6">
      <span className="text-sm font-bold text-[var(--color-text-mid)]">
        這個工具對你有幫助嗎？
      </span>
      <button
        type="button"
        onClick={onClick}
        disabled={!canVote}
        className="px-4 py-2 rounded-full bg-[var(--color-clay-purple)] text-white font-extrabold text-sm disabled:opacity-60 disabled:cursor-default"
      >
        👍 {label}
      </button>
      {/* 未登入提示（auth 載入中不顯，避免閃爍） */}
      {!user && !loading && !marked && (
        <span className="text-xs text-[var(--color-text-mid)]">
          登入後可回饋
        </span>
      )}
      {typeof count === "number" && count > 0 && (
        <span className="text-sm text-[var(--color-text-mid)]">
          {count} 人覺得有幫助
        </span>
      )}
      {err && (
        <span className="text-xs text-red-500 font-bold" role="alert">
          {err}
        </span>
      )}
    </div>
  );
}
