"use client";

import { useState } from "react";

const MAILTO = "mailto:jasonlin@simhope.com.tw?subject=AI工具需求";

/** 提需求卡：左 email、右免登入線上表單 + AI 輔助。@param {{onClose:()=>void}} props */
export default function RequestCard({ onClose }) {
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [message, setMessage] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [optimized, setOptimized] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");

  const runAi = async () => {
    if (!message.trim()) return setErr("請先輸入需求，再讓 AI 幫忙");
    setErr("");
    setAiLoading(true);
    setSuggestions([]);
    setOptimized("");
    try {
      const res = await fetch("/api/refine-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: message.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "AI 輔助失敗");
      setOptimized(data.optimized || "");
      setSuggestions(data.suggestions || []);
    } catch (e) {
      setErr(e.message || "AI 輔助失敗，請稍後再試");
    } finally {
      setAiLoading(false);
    }
  };

  const submit = async () => {
    if (!name.trim()) return setErr("請填寫姓名");
    if (!message.trim()) return setErr("請填寫需求內容");
    setErr("");
    setSending(true);
    try {
      const res = await fetch("/api/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "feature",
          name: name.trim(),
          contact: contact.trim(),
          message: message.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "送出失敗");
      setDone(true);
    } catch (e) {
      setErr(e.message || "送出失敗，請稍後再試");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div
        className="bg-[var(--color-card-bg)] rounded-3xl p-6 w-full max-w-2xl shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-black text-lg text-[var(--color-text-dark)]">
            提需求 / 想要的工具
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 text-xl"
          >
            ✕
          </button>
        </div>

        {done ? (
          <div className="text-center py-8">
            <p className="text-3xl mb-2">✅</p>
            <p className="font-bold text-[var(--color-text-dark)]">
              已送出，我們會盡快看！
            </p>
            <button
              onClick={onClose}
              className="mt-4 px-5 py-2 rounded-full bg-[var(--color-clay-purple)] text-white font-bold text-sm"
            >
              關閉
            </button>
          </div>
        ) : (
          <div className="flex flex-col md:flex-row gap-5">
            {/* 左：email */}
            <div className="md:w-44 flex-shrink-0 md:border-r md:border-[var(--color-card-border)] md:pr-5 flex flex-col gap-2">
              <span className="text-xs font-extrabold text-[var(--color-text-mid)] uppercase tracking-wider">
                ✉️ 用 email 寄
              </span>
              <p className="text-sm text-[var(--color-text-mid)] font-semibold">
                習慣寄信？直接寄給經企室（免登入）。
              </p>
              <a
                href={MAILTO}
                className="text-center px-4 py-2.5 rounded-xl border-2 border-[var(--color-card-border)] font-bold text-sm text-[var(--color-text-dark)] hover:border-[var(--color-clay-purple)] transition"
              >
                📧 寄信
              </a>
            </div>

            {/* 右：線上表單 + AI */}
            <div className="flex-1 flex flex-col gap-3">
              <span className="text-xs font-extrabold text-[var(--color-text-mid)] uppercase tracking-wider">
                ✍️ 線上填，AI 幫你寫清楚
              </span>
              <div className="flex gap-2">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="姓名（必填）"
                  maxLength={50}
                  className="flex-1 bg-gray-50 dark:bg-gray-700 p-2 rounded-lg border border-gray-200 dark:border-gray-600 text-sm"
                />
                <input
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  placeholder="聯絡方式（選填：分機/email）"
                  maxLength={100}
                  className="flex-1 bg-gray-50 dark:bg-gray-700 p-2 rounded-lg border border-gray-200 dark:border-gray-600 text-sm"
                />
              </div>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="你想要什麼工具 / 解決什麼問題？"
                rows={4}
                maxLength={1000}
                className="bg-gray-50 dark:bg-gray-700 p-3 rounded-xl border border-gray-200 dark:border-gray-600 text-sm outline-none focus:border-[var(--color-clay-purple)]"
              />

              <div className="flex gap-2">
                <button
                  onClick={runAi}
                  disabled={aiLoading}
                  className="flex-1 py-2 rounded-full border-2 border-[var(--color-clay-purple)]/40 text-[var(--color-clay-purple)] font-extrabold text-sm hover:bg-[var(--color-clay-purple)]/5 disabled:opacity-60"
                >
                  {aiLoading ? "AI 思考中…" : "✨ AI 幫我寫清楚"}
                </button>
                <button
                  onClick={submit}
                  disabled={sending}
                  className="flex-1 py-2 rounded-full bg-[var(--color-clay-purple)] text-white font-extrabold text-sm disabled:opacity-60"
                >
                  {sending ? "送出中…" : "送出"}
                </button>
              </div>

              {(optimized || suggestions.length > 0) && (
                <div className="bg-[var(--color-clay-purple)]/8 border border-[var(--color-clay-purple)]/20 rounded-xl p-3 text-sm flex flex-col gap-2">
                  <span className="font-extrabold text-[var(--color-text-dark)]">
                    ✨ AI 建議
                  </span>
                  {optimized && (
                    <div className="flex flex-col gap-1">
                      <p className="text-[var(--color-text-mid)]">
                        優化版：{optimized}
                      </p>
                      <button
                        onClick={() => {
                          setMessage(optimized);
                        }}
                        className="self-start text-xs font-bold text-[var(--color-clay-purple)] border border-[var(--color-clay-purple)]/30 rounded-full px-3 py-1 hover:bg-[var(--color-clay-purple)]/10"
                      >
                        採用這版
                      </button>
                    </div>
                  )}
                  {suggestions.length > 0 && (
                    <div>
                      <p className="font-bold text-[var(--color-text-mid)]">
                        可以再補充：
                      </p>
                      <ul className="list-disc ml-5 text-[var(--color-text-mid)]">
                        {suggestions.map((s, i) => (
                          <li key={i}>{s}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {err && <p className="text-sm text-red-500 font-bold">{err}</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
