"use client";

import { useState } from "react";
import { useAuth } from "@/context/AuthContext";

/**
 * text block 的 AI 撰寫面板（受控）。潤飾現有 / 依指示生成 → 預覽 → 採用才覆寫。
 * @param {{ value: string, onAccept: (text:string)=>void, context?: object }} props
 */
export default function AiAssist({ value, onAccept, context = {} }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState("");

  const run = async (mode) => {
    if (!user) {
      setError("請先登入");
      return;
    }
    setLoading(true);
    setError("");
    setPreview(null);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/ai/assist-block", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          mode,
          currentText: value || "",
          instruction,
          sourceUrl,
          context,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "AI 失敗，請稍後再試");
        return;
      }
      setPreview(data.text || "");
    } catch {
      setError("AI 失敗，請稍後再試");
    } finally {
      setLoading(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="self-start text-xs font-bold text-[var(--color-clay-purple)] border border-[var(--color-clay-purple)]/30 rounded-full px-3 py-1.5 hover:bg-[var(--color-clay-purple)]/5"
      >
        ✨ AI 輔助
      </button>
    );
  }

  return (
    <div className="border border-[var(--color-clay-purple)]/30 rounded-xl p-3 flex flex-col gap-2 bg-[var(--color-clay-purple)]/5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-extrabold text-[var(--color-clay-purple)]">
          ✨ AI 輔助撰寫（部落格口吻）
        </span>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setPreview(null);
            setError("");
          }}
          className="text-xs text-[var(--color-text-mid)] hover:text-[var(--color-text-dark)]"
          aria-label="關閉 AI 面板"
        >
          ✕
        </button>
      </div>
      <input
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
        placeholder="要 AI 幫你做什麼？例如：用部落格口吻介紹這個版本"
        className="bg-[var(--color-card-bg)] text-[var(--color-text-dark)] border border-[var(--color-card-border)] rounded-lg px-2 py-1.5 text-sm outline-none focus:border-[var(--color-clay-purple)]"
      />
      <input
        value={sourceUrl}
        onChange={(e) => setSourceUrl(e.target.value)}
        placeholder="可選：貼 GitHub README / 文件連結，AI 會讀內容"
        className="bg-[var(--color-card-bg)] text-[var(--color-text-dark)] border border-[var(--color-card-border)] rounded-lg px-2 py-1.5 text-sm font-mono outline-none focus:border-[var(--color-clay-purple)]"
      />
      <div className="flex gap-2 flex-wrap">
        <button
          type="button"
          disabled={loading}
          onClick={() => run("polish")}
          className="text-xs font-bold rounded-full px-3 py-1.5 bg-[var(--color-clay-purple)]/10 text-[var(--color-clay-purple)] border border-[var(--color-clay-purple)]/30 disabled:opacity-50"
        >
          {loading ? "AI 思考中…" : "✨ 潤飾現有內容"}
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={() => run("generate")}
          className="text-xs font-bold rounded-full px-3 py-1.5 bg-[var(--color-clay-purple)] text-white disabled:opacity-50"
        >
          {loading ? "AI 思考中…" : "✨ 依指示生成"}
        </button>
      </div>
      {error && <p className="text-xs text-red-500 font-bold">{error}</p>}
      {preview !== null && (
        <div className="flex flex-col gap-2">
          <div className="text-xs font-bold text-[var(--color-text-mid)]">
            預覽（按「採用」才會填入）：
          </div>
          <pre className="bg-[var(--color-card-bg)] border border-[var(--color-card-border)] rounded-lg p-2 text-sm whitespace-pre-wrap max-h-48 overflow-y-auto text-[var(--color-text-dark)]">
            {preview}
          </pre>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                onAccept(preview);
                setOpen(false);
                setPreview(null);
              }}
              className="text-xs font-bold rounded-full px-3 py-1.5 bg-green-500 text-white hover:bg-green-600"
            >
              採用
            </button>
            <button
              type="button"
              onClick={() => setPreview(null)}
              className="text-xs font-bold rounded-full px-3 py-1.5 bg-gray-200 text-gray-700 hover:bg-gray-300"
            >
              重來
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
