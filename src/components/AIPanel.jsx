"use client";

import { useState } from "react";
import { useToast } from "@/components/Toast";

/**
 * Collapsible panel for generating tool listing copy via `/api/generate`.
 * 結構化引導：把單一「一句話」拆成幾個提示欄，組成更明確的 prompt，避免 AI 方向錯誤。
 * @param {{ onGenerate: (prompt: string) => void, isGenerating: boolean }} props
 */
export default function AIPanel({ onGenerate, isGenerating }) {
  const [what, setWhat] = useState(""); // ① 做什麼（必填）
  const [who, setWho] = useState(""); // ② 給誰用 / 情境
  const [pain, setPain] = useState(""); // ③ 痛點 / 改變
  const [features, setFeatures] = useState(""); // ④ 關鍵功能
  const [isOpen, setIsOpen] = useState(false);
  const toast = useToast();

  // 把填寫的欄位組成給 /api/generate 的 prompt（空欄略過）。
  const buildPrompt = () => {
    const parts = [`這個工具：${what.trim()}`];
    if (who.trim()) parts.push(`給誰用 / 使用情境：${who.trim()}`);
    if (pain.trim()) parts.push(`解決的痛點 / 帶來的改變：${pain.trim()}`);
    if (features.trim()) parts.push(`關鍵功能 / 亮點：${features.trim()}`);
    return parts.join("\n");
  };

  const handleSubmit = () => {
    if (!what.trim()) {
      toast.error("請先填①「這工具做什麼」，AI 才有方向");
      return;
    }
    onGenerate(buildPrompt());
  };

  const fieldCls =
    "w-full bg-white/60 dark:bg-gray-800/60 p-3 rounded-xl border border-purple-100 dark:border-purple-900/50 placeholder-purple-300 dark:placeholder-purple-700 text-sm focus:border-purple-300 dark:focus:border-purple-600 focus:ring-2 focus:ring-purple-200 dark:focus:ring-purple-900 outline-none transition-all resize-none";

  return (
    <div className="mb-6">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-gradient-to-r from-purple-100 to-blue-100 dark:from-purple-900/30 dark:to-blue-900/30 text-[var(--color-clay-purple)] font-black text-sm hover:shadow-md transition-all border border-purple-200 dark:border-purple-700"
      >
        🪄 請 AI 幫我填寫
      </button>

      {isOpen && (
        <div className="mt-3 p-5 rounded-2xl bg-gradient-to-br from-purple-50 to-white dark:from-purple-950/30 dark:to-transparent border-2 border-purple-200/60 dark:border-purple-800/50 shadow-inner relative overflow-hidden animate-fade-in-down">
          <div className="flex gap-3 mb-3 items-center">
            <span className="text-2xl animate-bounce">🤖</span>
            <div className="flex-1">
              <h4 className="font-extrabold text-purple-700 dark:text-purple-300 text-sm">
                魔術自動生成器
              </h4>
              <p className="text-xs text-purple-600/80 dark:text-purple-400/80 font-bold">
                填得越具體，AI 生成的文案越準（只有①必填）
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold text-purple-700 dark:text-purple-300">
              ① 這工具做什麼？<span className="text-red-400">*</span>
            </label>
            <textarea
              value={what}
              onChange={(e) => setWhat(e.target.value)}
              placeholder="例如：把泰文即時翻成中文語音的手機小工具"
              className={`${fieldCls} !h-[56px]`}
            />

            <label className="text-xs font-bold text-purple-700 dark:text-purple-300 mt-1">
              ② 給誰用 / 什麼情境？
            </label>
            <input
              value={who}
              onChange={(e) => setWho(e.target.value)}
              placeholder="例如：產線外籍移工跟線長溝通時"
              className={fieldCls}
            />

            <label className="text-xs font-bold text-purple-700 dark:text-purple-300 mt-1">
              ③ 解決什麼痛點 / 帶來什麼改變？
            </label>
            <input
              value={pain}
              onChange={(e) => setPain(e.target.value)}
              placeholder="例如：原本要打字翻譯，現在直接講就好"
              className={fieldCls}
            />

            <label className="text-xs font-bold text-purple-700 dark:text-purple-300 mt-1">
              ④ 關鍵功能 / 亮點（選填）
            </label>
            <input
              value={features}
              onChange={(e) => setFeatures(e.target.value)}
              placeholder="例如：離線可用、支援台語"
              className={fieldCls}
            />
          </div>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={isGenerating}
            className="mt-3 w-full py-3 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-500 text-white font-extrabold text-sm shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all relative overflow-hidden"
          >
            {isGenerating ? (
              <span className="flex items-center justify-center gap-2">
                <svg
                  className="animate-spin h-4 w-4 text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                AI 文案撰寫中... 勿離開畫面
              </span>
            ) : (
              "✨ 魔術生成"
            )}
          </button>

          {isGenerating && (
            <div className="absolute inset-0 bg-white/40 dark:bg-gray-900/50 backdrop-blur-[2px] z-10 flex items-center justify-center"></div>
          )}
        </div>
      )}
    </div>
  );
}
