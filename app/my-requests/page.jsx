"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { getMyRequests } from "@/lib/db";
import RequestCard from "@/components/RequestCard";
import LoginModal from "@/components/LoginModal";

const STATUS = {
  pending: {
    label: "🕓 評估中",
    cls: "bg-[var(--color-card-bg)] border border-[var(--color-card-border)] text-[var(--color-text-mid)]",
  },
  handled: {
    label: "✅ 已處理",
    cls: "bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400",
  },
};

function fmtDate(createdAt) {
  const ms = createdAt?.toMillis?.();
  return ms ? new Date(ms).toLocaleDateString() : "";
}

export default function MyRequestsPage() {
  const { user, loading } = useAuth();
  // reqs===null = 尚未抓取（含 auth 解析中 / 抓取中）；array = 已抓取結果。
  const [reqs, setReqs] = useState(null);
  const [showReq, setShowReq] = useState(false);
  const [showLogin, setShowLogin] = useState(false);

  useEffect(() => {
    if (loading || !user) return; // 等 auth；未登入 → 不抓（reqs 留 null，由 render 判 !user）
    let cancelled = false;
    getMyRequests(user.uid)
      .then((r) => {
        if (!cancelled) setReqs(r);
      })
      .catch((e) => console.error("載入我的需求失敗:", e));
    return () => {
      cancelled = true;
    };
  }, [user, loading]);

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-0 py-10">
      <header className="text-center mb-8">
        <h1 className="text-4xl md:text-5xl font-black text-[var(--color-text-dark)] mb-3">
          我的需求
        </h1>
        <p className="text-[var(--color-text-mid)] font-semibold">
          你提過的需求與處理狀態。
        </p>
      </header>

      {loading ? (
        <p className="text-center text-[var(--color-text-mid)]">載入中…</p>
      ) : !user ? (
        <div className="text-center py-12">
          <p className="text-[var(--color-text-mid)] font-semibold mb-4">
            請先登入查看你的需求。
          </p>
          <button
            onClick={() => setShowLogin(true)}
            className="px-6 py-2.5 rounded-full bg-[var(--color-clay-purple)] text-white font-extrabold text-sm"
          >
            登入👨‍💻 / 註冊🔑
          </button>
        </div>
      ) : reqs === null ? (
        <p className="text-center text-[var(--color-text-mid)]">載入中…</p>
      ) : reqs.length === 0 ? (
        <div className="text-center py-12 bg-[var(--color-card-bg)] border border-dashed border-[var(--color-card-border)] rounded-2xl">
          <p className="text-[var(--color-text-mid)] font-semibold mb-4">
            你還沒提過需求。
          </p>
          <button
            onClick={() => setShowReq(true)}
            className="px-6 py-2.5 rounded-full bg-[var(--color-clay-purple)] text-white font-extrabold text-sm"
          >
            💬 提需求
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {reqs.map((r) => {
            const s = STATUS[r.status] || STATUS.pending;
            return (
              <div
                key={r.id}
                className="bg-[var(--color-card-bg)] border border-[var(--color-card-border)] rounded-2xl p-4"
              >
                <div className="flex items-start justify-between gap-3 mb-1">
                  <span
                    className={`px-2.5 py-1 rounded-full text-xs font-bold flex-shrink-0 ${s.cls}`}
                  >
                    {s.label}
                  </span>
                  <span className="text-xs text-[var(--color-text-mid)] flex-shrink-0">
                    {fmtDate(r.createdAt)}
                  </span>
                </div>
                <p className="text-sm text-[var(--color-text-dark)] whitespace-pre-wrap">
                  {r.message}
                </p>
              </div>
            );
          })}
          <button
            onClick={() => setShowReq(true)}
            className="self-center mt-2 px-5 py-2 rounded-full border border-[var(--color-card-border)] text-sm font-bold text-[var(--color-text-mid)] hover:bg-[var(--color-card-bg)]"
          >
            ＋ 再提一個需求
          </button>
        </div>
      )}

      {showReq && <RequestCard onClose={() => setShowReq(false)} />}
      {showLogin && <LoginModal onClose={() => setShowLogin(false)} />}
    </div>
  );
}
