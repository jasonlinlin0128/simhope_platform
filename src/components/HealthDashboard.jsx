"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { getAllTools } from "@/lib/db";
import { pickNumericFields } from "@/lib/numericMap.mjs";
import {
  buildHealthReport,
  STALE_DAYS,
  ZOMBIE_GRACE_DAYS,
  PENDING_STUCK_DAYS,
} from "@/lib/healthFlags.mjs";

// 近 N 天的 daily doc id（UTC YYYYMMDD）。比照 UsageDashboard（v1 刻意各持一份）。
function recentDayIds(n) {
  const ids = [];
  const today = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(today.getTime() - i * 86400000);
    ids.push(d.toISOString().slice(0, 10).replace(/-/g, ""));
  }
  return ids;
}

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
const TH =
  "py-2 px-2 text-right font-bold text-xs text-[var(--color-text-mid)]";
const TD = "py-2 px-2 text-right tabular-nums text-[var(--color-text-dark)]";

function StatusPill({ status }) {
  if (!status) return null;
  return (
    <span
      className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${STATUS_PILL[status] || STATUS_FALLBACK}`}
    >
      {status}
    </span>
  );
}

function ToolNameCell({ id, title, status }) {
  return (
    <td className="py-2 pr-3">
      <Link
        href={`/tool/${id}`}
        className="flex items-center gap-2 flex-wrap hover:underline"
      >
        <span className="font-bold text-[var(--color-text-dark)]">{title}</span>
        <StatusPill status={status} />
      </Link>
    </td>
  );
}

function FlagSection({ icon, title, desc, count, children }) {
  return (
    <div>
      <h3 className="font-extrabold text-[var(--color-text-dark)] flex items-center gap-2">
        <span>
          {icon} {title}
        </span>
        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-[var(--color-card-border)] text-[var(--color-text-mid)]">
          {count}
        </span>
      </h3>
      <p className="text-xs text-[var(--color-text-mid)] mb-2">{desc}</p>
      {count === 0 ? (
        <p className="text-sm font-semibold text-green-600 dark:text-green-400">
          ✓ 沒有問題
        </p>
      ) : (
        <div className="overflow-x-auto">{children}</div>
      )}
    </div>
  );
}

export default function HealthDashboard() {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [vSnap, hSnap, daySnaps, tools] = await Promise.all([
          getDoc(doc(db, "analytics", "toolViews")),
          getDoc(doc(db, "analytics", "toolHelpful")),
          Promise.all(
            recentDayIds(14).map((id) =>
              getDoc(doc(db, "analytics_daily", id)),
            ),
          ),
          getAllTools(),
        ]);

        const viewsMap = pickNumericFields(vSnap.exists() ? vSnap.data() : {});
        const helpfulMap = pickNumericFields(
          hSnap.exists() ? hSnap.data() : {},
        );

        const opensMap = {};
        for (const s of daySnaps) {
          if (!s.exists()) continue;
          const bt = s.data().byTool || {};
          for (const [tid, n] of Object.entries(bt)) {
            opensMap[tid] = (opensMap[tid] || 0) + (n || 0);
          }
        }

        setReport(
          buildHealthReport(tools, {
            viewsMap,
            opensMap,
            helpfulMap,
            nowMs: Date.now(),
          }),
        );
      } catch (e) {
        console.error("HealthDashboard 載入失敗：", e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <p className="text-[var(--color-text-mid)]">載入中…</p>;
  if (!report)
    return (
      <p className="text-[var(--color-text-mid)]">載入失敗，請重整頁面。</p>
    );

  const { staleHot, zombies, stuckPending, orphanKeys, counts } = report;

  return (
    <div className="flex flex-col gap-8">
      <FlagSection
        icon="🔥🕸"
        title="熱門但陳舊"
        count={counts.staleHot}
        desc={`有人在用、但超過 ${STALE_DAYS} 天沒更新 — 優先找人確認還能用。`}
      >
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left text-xs text-[var(--color-text-mid)] border-b border-[var(--color-card-border)]">
              <th scope="col" className="py-2 pr-3 font-bold">
                工具
              </th>
              <th scope="col" className={TH}>
                👁 瀏覽
              </th>
              <th scope="col" className={TH}>
                📂 14d 開啟
              </th>
              <th scope="col" className={TH}>
                沒更新天數
              </th>
            </tr>
          </thead>
          <tbody>
            {staleHot.map((r) => (
              <tr
                key={r.id}
                className="border-b border-[var(--color-card-border)] last:border-0"
              >
                <ToolNameCell id={r.id} title={r.title} status={r.status} />
                <td className={TD}>{r.views.toLocaleString()}</td>
                <td className={TD}>{r.opens.toLocaleString()}</td>
                <td className={TD}>{r.ageDays}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </FlagSection>

      <FlagSection
        icon="🧟"
        title="殭屍工具"
        count={counts.zombies}
        desc={`掛 live 但幾乎沒人用、上架已超過 ${ZOMBIE_GRACE_DAYS} 天 — 考慮推廣或下架。`}
      >
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left text-xs text-[var(--color-text-mid)] border-b border-[var(--color-card-border)]">
              <th scope="col" className="py-2 pr-3 font-bold">
                工具
              </th>
              <th scope="col" className={TH}>
                👁 瀏覽
              </th>
              <th scope="col" className={TH}>
                👍 有幫助
              </th>
              <th scope="col" className={TH}>
                上架天數
              </th>
            </tr>
          </thead>
          <tbody>
            {zombies.map((r) => (
              <tr
                key={r.id}
                className="border-b border-[var(--color-card-border)] last:border-0"
              >
                <ToolNameCell id={r.id} title={r.title} status={r.status} />
                <td className={TD}>{r.views.toLocaleString()}</td>
                <td className={TD}>{r.helpful.toLocaleString()}</td>
                <td className={TD}>{r.ageDays}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </FlagSection>

      <FlagSection
        icon="🐌"
        title="卡關過久"
        count={counts.stuckPending}
        desc={`送審後超過 ${PENDING_STUCK_DAYS} 天還是 pending — 該審核 / 處理。`}
      >
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left text-xs text-[var(--color-text-mid)] border-b border-[var(--color-card-border)]">
              <th scope="col" className="py-2 pr-3 font-bold">
                工具
              </th>
              <th scope="col" className={TH}>
                等待天數
              </th>
            </tr>
          </thead>
          <tbody>
            {stuckPending.map((r) => (
              <tr
                key={r.id}
                className="border-b border-[var(--color-card-border)] last:border-0"
              >
                <ToolNameCell id={r.id} title={r.title} status={r.status} />
                <td className={TD}>{r.ageDays}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </FlagSection>

      <FlagSection
        icon="👻"
        title="孤兒 analytics key"
        count={counts.orphanKeys}
        desc="analytics 殘留、對不到任何現存工具（工具被刪）— 純列出供核對。"
      >
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left text-xs text-[var(--color-text-mid)] border-b border-[var(--color-card-border)]">
              <th scope="col" className="py-2 pr-3 font-bold">
                key
              </th>
              <th scope="col" className={TH}>
                👁 瀏覽
              </th>
              <th scope="col" className={TH}>
                📂 14d 開啟
              </th>
              <th scope="col" className={TH}>
                👍 有幫助
              </th>
            </tr>
          </thead>
          <tbody>
            {orphanKeys.map((r) => (
              <tr
                key={r.key}
                className="border-b border-[var(--color-card-border)] last:border-0"
              >
                <td className="py-2 pr-3 font-mono text-xs text-[var(--color-text-dark)] break-all">
                  {r.key}
                </td>
                <td className={TD}>{r.views.toLocaleString()}</td>
                <td className={TD}>{r.opens.toLocaleString()}</td>
                <td className={TD}>{r.helpful.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </FlagSection>
    </div>
  );
}
