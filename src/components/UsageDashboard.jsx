"use client";

import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { normalizeMetrics } from "@/lib/metrics.mjs";
import { getAllTools } from "@/lib/db";
import { buildToolSignalRows, sortToolSignalRows } from "@/lib/toolSignals.mjs";
import { pickNumericFields } from "@/lib/numericMap.mjs";

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

// status pill 配色（深色相容）。未知 status → fallback 灰。
const STATUS_PILL = {
  live: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  beta: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  new: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  dev: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  pending: "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300",
  terminated: "bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300",
};
const STATUS_FALLBACK =
  "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300";

// 可排序欄位（順序＝表格資料欄順序）。
const SORT_COLS = [
  { key: "views", label: "👁 瀏覽" },
  { key: "opens", label: "📂 開啟" },
  { key: "helpful", label: "👍 有幫助" },
];

export default function UsageDashboard() {
  const [totals, setTotals] = useState(null);
  const [rows, setRows] = useState([]);
  const [sortKey, setSortKey] = useState("views");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [tSnap, vSnap, hSnap, daySnaps, tools] = await Promise.all([
          getDoc(doc(db, "analytics", "totals")),
          getDoc(doc(db, "analytics", "toolViews")),
          getDoc(doc(db, "analytics", "toolHelpful")),
          Promise.all(
            recentDayIds(14).map((id) =>
              getDoc(doc(db, "analytics_daily", id)),
            ),
          ),
          getAllTools(),
        ]);

        setTotals(normalizeMetrics(tSnap.exists() ? tSnap.data() : {}));

        const viewsMap = pickNumericFields(vSnap.exists() ? vSnap.data() : {});
        const helpfulMap = pickNumericFields(
          hSnap.exists() ? hSnap.data() : {},
        );

        // 近 14 天 byTool 加總 → opensMap。
        const opensMap = {};
        for (const s of daySnaps) {
          if (!s.exists()) continue;
          const bt = s.data().byTool || {};
          for (const [tid, n] of Object.entries(bt)) {
            opensMap[tid] = (opensMap[tid] || 0) + (n || 0);
          }
        }

        setRows(buildToolSignalRows(tools, { viewsMap, opensMap, helpfulMap }));
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

  const sorted = sortToolSignalRows(rows, sortKey);

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
        <h3 className="font-extrabold text-[var(--color-text-dark)]">
          工具訊號總表
        </h3>
        <p className="text-xs text-[var(--color-text-mid)] mb-2">
          瀏覽・有幫助為全期；開啟為近 14 天。點欄位標題可排序。
        </p>
        {sorted.length === 0 ? (
          <p className="text-sm text-[var(--color-text-mid)]">
            目前沒有工具資料。
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-left text-xs text-[var(--color-text-mid)] border-b border-[var(--color-card-border)]">
                  <th scope="col" className="py-2 pr-3 font-bold">
                    工具
                  </th>
                  {SORT_COLS.map((col) => (
                    <th
                      key={col.key}
                      scope="col"
                      aria-sort={sortKey === col.key ? "descending" : "none"}
                      className="py-2 px-2 text-right"
                    >
                      <button
                        type="button"
                        onClick={() => setSortKey(col.key)}
                        aria-pressed={sortKey === col.key}
                        className={`font-bold transition ${
                          sortKey === col.key
                            ? "text-[var(--color-clay-purple)]"
                            : "text-[var(--color-text-mid)] hover:text-[var(--color-text-dark)]"
                        }`}
                      >
                        {col.label}
                        {sortKey === col.key ? " ▼" : ""}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-[var(--color-card-border)] last:border-0"
                  >
                    <td className="py-2 pr-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-[var(--color-text-dark)]">
                          {r.title}
                        </span>
                        {r.status && (
                          <span
                            className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                              STATUS_PILL[r.status] || STATUS_FALLBACK
                            }`}
                          >
                            {r.status}
                          </span>
                        )}
                        {r.type && (
                          <span className="text-[10px] text-[var(--color-text-mid)] flex-shrink-0">
                            {r.type}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums text-[var(--color-text-dark)]">
                      {r.views.toLocaleString()}
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums text-[var(--color-text-dark)]">
                      {r.opens.toLocaleString()}
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums text-[var(--color-text-dark)]">
                      {r.helpful.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
