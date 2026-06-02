"use client";

import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { auth } from "@/lib/firebase";

const TITLES = {
  access: "申請成為開發者",
  feature: "提需求 / 想要的工具",
};

/** 共用申請/提需求表單。@param {{type:'access'|'feature', onClose:()=>void}} props */
export default function RequestModal({ type = "feature", onClose }) {
  const { user, profile } = useAuth();
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    if (!user) return setErr("請先登入");
    if (!message.trim()) return setErr("請填寫留言");
    setSending(true);
    setErr("");
    try {
      const token = await auth.currentUser.getIdToken();
      const res = await fetch("/api/request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          type,
          message: message.trim(),
          name: profile?.displayName || user.displayName || "",
          email: user.email || "",
        }),
      });
      if (!res.ok)
        throw new Error(
          (await res.json().catch(() => ({}))).error || "送出失敗",
        );
      setDone(true);
    } catch (e) {
      setErr(e.message || "送出失敗，請稍後再試");
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="bg-[var(--color-card-bg)] rounded-3xl p-6 w-full max-w-md shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-black text-lg text-[var(--color-text-dark)]">
            {TITLES[type]}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 text-xl"
          >
            ✕
          </button>
        </div>
        {done ? (
          <div className="text-center py-6">
            <p className="text-2xl mb-2">✅</p>
            <p className="font-bold text-[var(--color-text-dark)]">
              已送出，我們會盡快回覆你！
            </p>
            <button
              onClick={onClose}
              className="mt-4 px-5 py-2 rounded-full bg-[var(--color-clay-purple)] text-white font-bold text-sm"
            >
              關閉
            </button>
          </div>
        ) : !user ? (
          <p className="text-[var(--color-text-mid)] font-semibold py-6 text-center">
            請先登入再送出申請。
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-[var(--color-text-mid)] font-semibold">
              以 <strong>{user.email || profile?.displayName}</strong>{" "}
              身份送出。
            </p>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={
                type === "access"
                  ? "想上架什麼？為什麼需要開發者權限？"
                  : "你想要什麼工具 / 功能？解決什麼問題？"
              }
              rows={4}
              className="bg-gray-50 dark:bg-gray-700 p-3 rounded-xl border border-gray-200 dark:border-gray-600 text-sm outline-none focus:border-[var(--color-clay-purple)]"
            />
            {err && <p className="text-sm text-red-500 font-bold">{err}</p>}
            <button
              onClick={submit}
              disabled={sending}
              className="px-5 py-2.5 rounded-full bg-[var(--color-clay-purple)] text-white font-extrabold disabled:opacity-60"
            >
              {sending ? "送出中…" : "📩 送出"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
