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

      {err && (
        <p className="text-sm text-red-500 font-bold" role="alert">
          {err}
        </p>
      )}

      {data &&
        (data.total === 0 ? (
          <p
            className="text-[var(--color-text-mid)] font-semibold py-6 text-center"
            aria-live="polite"
          >
            目前沒有待處理需求。
          </p>
        ) : (
          <div className="flex flex-col gap-3" aria-live="polite">
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
