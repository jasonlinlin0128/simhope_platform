"use client";

import UploadButton from "@/components/UploadButton";
import { blankVersionRow } from "@/lib/versions";

// 哪些 type 的版本要綁下載檔（顯示上傳欄）→ Storage pathPrefix
const FILE_TYPES = { download: "downloads", doc: "docs", skill: "skills" };

/**
 * 版本歷史編輯器（受控）。detail 頁編輯模式與 admin wizard 共用。
 * @param {{ versions: object[], type: string, onChange: (next:object[])=>void, todayYMD: string }} props
 */
export default function VersionEditor({
  versions = [],
  type = "webapp",
  onChange,
  todayYMD,
}) {
  const filePrefix = FILE_TYPES[type]; // undefined = 此 type 不綁檔，不顯示上傳欄

  const setRow = (idx, patch) =>
    onChange(versions.map((v, i) => (i === idx ? { ...v, ...patch } : v)));
  const delRow = (idx) => onChange(versions.filter((_, i) => i !== idx));
  const moveRow = (idx, dir) => {
    const t = idx + dir;
    if (t < 0 || t >= versions.length) return;
    const next = [...versions];
    [next[idx], next[t]] = [next[t], next[idx]];
    onChange(next);
  };
  const addRow = () => onChange([...versions, blankVersionRow(todayYMD)]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h4 className="font-extrabold text-sm text-[var(--color-text-dark)]">
          🕒 版本歷史
        </h4>
        <span className="text-xs text-[var(--color-text-mid)]">
          最後一筆＝目前版（驅動下載與最新版號）
        </span>
      </div>

      {versions.length === 0 && (
        <p className="text-sm text-[var(--color-text-mid)] italic">
          還沒有版本。點下方「＋ 新增版本」加第一版。
        </p>
      )}

      {versions.map((v, idx) => (
        <div
          key={idx}
          className="border border-[var(--color-card-border)] rounded-2xl p-3 flex flex-col gap-2"
        >
          <div className="flex gap-2 items-center flex-wrap">
            <input
              value={v.version || ""}
              onChange={(e) => setRow(idx, { version: e.target.value })}
              placeholder="版本號 v1.0"
              className="w-28 bg-[var(--color-card-bg)] text-[var(--color-text-dark)] border border-[var(--color-card-border)] rounded-lg px-2 py-1.5 text-sm font-bold outline-none focus:border-[var(--color-clay-purple)]"
            />
            <input
              type="date"
              value={v.date || ""}
              onChange={(e) => setRow(idx, { date: e.target.value })}
              className="bg-[var(--color-card-bg)] text-[var(--color-text-dark)] border border-[var(--color-card-border)] rounded-lg px-2 py-1.5 text-sm outline-none focus:border-[var(--color-clay-purple)]"
            />
            {idx === versions.length - 1 && (
              <span className="text-xs font-bold text-[var(--color-clay-purple)] bg-[var(--color-clay-purple)]/10 rounded-full px-2 py-0.5">
                目前版
              </span>
            )}
            <div className="flex gap-1 ml-auto">
              <button
                type="button"
                onClick={() => moveRow(idx, -1)}
                disabled={idx === 0}
                className="w-7 h-7 rounded-lg bg-gray-100 text-gray-500 hover:bg-gray-200 disabled:opacity-25 text-sm"
                title="上移"
                aria-label="上移此版"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => moveRow(idx, 1)}
                disabled={idx === versions.length - 1}
                className="w-7 h-7 rounded-lg bg-gray-100 text-gray-500 hover:bg-gray-200 disabled:opacity-25 text-sm"
                title="下移"
                aria-label="下移此版"
              >
                ↓
              </button>
              <button
                type="button"
                onClick={() => delRow(idx)}
                className="w-7 h-7 rounded-lg bg-red-50 text-red-400 hover:bg-red-100 text-sm"
                title="刪除此版"
                aria-label="刪除此版"
              >
                ✕
              </button>
            </div>
          </div>

          <textarea
            value={v.notes || ""}
            onChange={(e) => setRow(idx, { notes: e.target.value })}
            placeholder="更新說明（支援 markdown）"
            rows={2}
            className="w-full bg-[var(--color-card-bg)] text-[var(--color-text-dark)] border border-[var(--color-card-border)] rounded-lg px-2 py-1.5 text-sm outline-none focus:border-[var(--color-clay-purple)] resize-y"
          />

          {filePrefix && (
            <div className="flex gap-2 items-center">
              <input
                value={v.fileUrl || ""}
                onChange={(e) => setRow(idx, { fileUrl: e.target.value })}
                placeholder="此版下載連結 URL"
                className="flex-1 bg-[var(--color-card-bg)] text-[var(--color-text-dark)] border border-[var(--color-card-border)] rounded-lg px-2 py-1.5 text-sm font-mono outline-none focus:border-[var(--color-clay-purple)]"
              />
              <UploadButton
                pathPrefix={filePrefix}
                accept={type === "skill" ? ".zip,application/zip" : undefined}
                onUploaded={(url) => setRow(idx, { fileUrl: url })}
              />
            </div>
          )}
        </div>
      ))}

      <button
        type="button"
        onClick={addRow}
        className="self-start text-sm font-bold text-[var(--color-clay-purple)] border border-[var(--color-clay-purple)]/30 rounded-full px-3 py-1.5 hover:bg-[var(--color-clay-purple)]/5"
      >
        ＋ 新增版本
      </button>
    </div>
  );
}
