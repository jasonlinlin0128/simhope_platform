"use client";

import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { normalizeMetrics } from "@/lib/metrics.mjs";
import { getAllTools } from "@/lib/db";

// 近 N 天的 daily doc id（UTC YYYYMMDD）。
function recentDayIds(n) {
  const ids = [];
  const today = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(today.getTime() - i * 86400000);
    ids.push(d.toISOString().slice(0, 10).replace(/-/g, ""));
  }
  return ids;
}

export default function UsageDashboard() {
  const [totals, setTotals] = useState(null);
  const [ranking, setRanking] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        // 1) 累計四數
        const tSnap = await getDoc(doc(db, "analytics", "totals"));
        setTotals(normalizeMetrics(tSnap.exists() ? tSnap.data() : {}));

        // 2) 近 14 天 byTool 彙整 → 工具開啟排名
        const ids = recentDayIds(14);
        const daySnaps = await Promise.all(
          ids.map((id) => getDoc(doc(db, "analytics_daily", id))),
        );
        const byTool = {};
        for (const s of daySnaps) {
          if (!s.exists()) continue;
          const bt = s.data().byTool || {};
          for (const [tid, n] of Object.entries(bt)) {
            byTool[tid] = (byTool[tid] || 0) + (n || 0);
          }
        }
        // 3) join tools 取標題
        const tools = await getAllTools();
        const titleOf = Object.fromEntries(
          tools.map((t) => [t.id, t.title || t.id]),
        );
        const rows = Object.entries(byTool)
          .map(([tid, n]) => ({
            id: tid,
            title: titleOf[tid] || tid,
            opens: n,
          }))
          .sort((a, b) => b.opens - a.opens);
        setRanking(rows);
      } catch (e) {
        console.error("UsageDashboard 載入失敗：", e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <p className="text-[var(--color-text-mid)]">載入中…</p>;

  const cards = [
    { label: "累計工具開啟", value: totals?.toolOpen ?? 0 },
    { label: "詳情頁瀏覽", value: totals?.toolView ?? 0 },
    { label: "搜尋次數", value: totals?.search ?? 0 },
    { label: "需求/申請送出", value: totals?.requestSubmit ?? 0 },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cards.map((c) => (
          <div
            key={c.label}
            className="bg-[var(--color-card-bg)] border border-[var(--color-card-border)] rounded-2xl p-4 text-center"
          >
            <div className="text-2xl font-black text-[var(--color-text-dark)]">
              {c.value.toLocaleString()}
            </div>
            <div className="text-xs font-semibold text-[var(--color-text-mid)] mt-1">
              {c.label}
            </div>
          </div>
        ))}
      </div>

      <div>
        <h3 className="font-extrabold text-[var(--color-text-dark)] mb-2">
          工具開啟排名（近 14 天）
        </h3>
        {ranking.length === 0 ? (
          <p className="text-sm text-[var(--color-text-mid)]">
            近 14 天還沒有工具開啟紀錄。
          </p>
        ) : (
          <div className="flex flex-col gap-1">
            {ranking.map((r, i) => (
              <div
                key={r.id}
                className="flex items-center gap-3 bg-[var(--color-card-bg)] border border-[var(--color-card-border)] rounded-xl px-3 py-2"
              >
                <span className="text-xs font-bold text-[var(--color-text-mid)] w-6">
                  {i + 1}
                </span>
                <span className="flex-1 font-bold text-sm text-[var(--color-text-dark)] truncate">
                  {r.title}
                </span>
                <span className="text-sm font-black text-[var(--color-clay-purple)]">
                  {r.opens.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
