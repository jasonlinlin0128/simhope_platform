"use client";

import MarkdownContent from "@/components/MarkdownContent";

/**
 * 版本歷史顯示（新→舊）。詳情頁「🕒 版本」tab 用。
 * @param {{ versions: object[] }} props
 */
export default function VersionHistory({ versions = [] }) {
  if (!versions.length) {
    return (
      <p className="text-center py-10 text-[var(--color-text-mid)] italic">
        這個工具還沒有版本紀錄。
      </p>
    );
  }

  const newestFirst = [...versions].reverse();
  const latest = newestFirst[0];

  return (
    <div className="flex flex-col gap-6">
      {latest?.date && (
        <p className="text-sm text-[var(--color-text-mid)] font-bold">
          最後更新：{latest.date}
        </p>
      )}
      {newestFirst.map((v, i) => (
        <div
          key={i}
          className="border-l-2 border-[var(--color-clay-purple)]/30 pl-4 flex flex-col gap-2"
        >
          <div className="flex items-center gap-3 flex-wrap">
            <span className="px-3 py-1 rounded-lg bg-[var(--color-clay-purple)]/10 text-[var(--color-clay-purple)] font-black text-sm">
              {v.version || "（未填版號）"}
            </span>
            {v.date && (
              <span className="text-sm text-[var(--color-text-mid)] font-bold">
                {v.date}
              </span>
            )}
            {i === 0 && (
              <span className="text-xs font-bold text-green-600 bg-green-50 dark:bg-green-900/20 rounded-full px-2 py-0.5">
                最新
              </span>
            )}
          </div>
          {v.notes && <MarkdownContent>{v.notes}</MarkdownContent>}
          {v.fileUrl && (
            <a
              href={v.fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="self-start inline-block px-4 py-2 rounded-lg bg-[var(--color-clay-purple)]/10 text-[var(--color-clay-purple)] font-bold text-sm border border-[var(--color-clay-purple)]/30 hover:bg-[var(--color-clay-purple)]/20"
            >
              ⬇️ 下載此版
            </a>
          )}
        </div>
      ))}
    </div>
  );
}
