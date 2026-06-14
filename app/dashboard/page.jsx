"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import AIPanel from "@/components/AIPanel";
import ToolCard from "@/components/ToolCard";
import PasskeyManager from "@/components/PasskeyManager";
import { useToast } from "@/components/Toast";
import { db, auth } from "@/lib/firebase";
import { CATEGORIES } from "@/lib/taxonomy";
import {
  collection,
  query,
  where,
  getDocs,
  setDoc,
  doc,
  serverTimestamp,
} from "firebase/firestore";

// 5 大類別 + 「適合什麼情況」說明（給非技術同仁看得懂）
const CATEGORY_OPTIONS = [
  {
    key: "tool",
    emoji: "🧰",
    label: "工具",
    helper: "單點 AI 小工具，同仁點連結或下載就能用。",
    urlPlaceholder: "https://... 或 GitHub repo 連結",
  },
  {
    key: "platform",
    emoji: "🏢",
    label: "平臺",
    helper: "較大型、多功能、長期維運的系統或應用。",
    urlPlaceholder: "https://平臺網址",
  },
  {
    key: "project",
    emoji: "📁",
    label: "專案",
    helper: "單一、時限性的案子（例：某個補助案），展示進度與成果。",
    urlPlaceholder: "參考連結（可留空）",
  },
  {
    key: "mcp",
    emoji: "🔌",
    label: "MCP",
    helper: "給 AI agent 串接的連接器，裝一次 Claude/Cursor 就能用。",
    urlPlaceholder: "GitHub repo 連結",
  },
  {
    key: "skill",
    emoji: "🧠",
    label: "Skill",
    helper: "Agent skill，下載 .zip 裝到 ~/.claude/skills/。",
    urlPlaceholder: "GitHub repo 連結（zip 審核時上傳）",
  },
];

export default function Dashboard() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const toast = useToast();

  const [myTools, setMyTools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 4 欄表單 state
  const [formData, setFormData] = useState({
    title: "",
    tagline: "",
    url: "",
    category: "tool",
  });

  const fetchMyTools = useCallback(async () => {
    setLoading(true);
    try {
      const q = query(
        collection(db, "tools"),
        where("authorUid", "==", user.uid),
      );
      const snap = await getDocs(q);
      setMyTools(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (error) {
      console.error("Failed to load tools", error);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/");
    } else if (user) {
      fetchMyTools();
    }
  }, [user, authLoading, router, fetchMyTools]);

  // AI 文案生成 — 只填 title + tagline（其他細節經企室審核時補）
  const handleGenerate = async (prompt) => {
    setIsGenerating(true);
    try {
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ prompt }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "API 呼叫失敗");
      }
      const result = await res.json();
      setFormData((prev) => ({
        ...prev,
        title: result.title || prev.title,
        tagline: result.tagline || prev.tagline,
      }));
      toast.success(
        "✨ 文案生成完成！其他欄位請手動填，送出後經企室審核時會補完細節。",
      );
    } catch (err) {
      console.error(err);
      toast.error("AI 生成失敗，請稍後再試");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const id =
        "t_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7);

      // 提交資料：4 個必填 + 系統 metadata；
      // 部門 / folder / scenarios / blog / icon / steps 等細節由 admin 審核時補
      const toolData = {
        title: formData.title,
        tagline: formData.tagline,
        url: formData.url,
        category: formData.category,
        type: CATEGORIES[formData.category]?.defaultType || "webapp",
        status: "pending",
        authorUid: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        // 預設值（讓詳情頁/卡片不會壞）
        icon: "📦",
        color: "c" + (Math.floor(Math.random() * 6) + 1),
        desc: "",
        typeData: {},
        blog: { summary: "", blocks: [] },
        files: [],
        versions: [],
      };

      await setDoc(doc(db, "tools", id), toolData);
      toast.success(
        "已送出！經企室審核後會跟你討論細節（截圖、使用步驟、適用部門、進階安裝方式等），通過後上架。",
      );
      setFormData({ title: "", tagline: "", url: "", category: "tool" });
      fetchMyTools();
    } catch (error) {
      console.error(error);
      toast.error(
        error.code === "permission-denied"
          ? "儲存失敗：你不是開發者帳號，無法提交工具。請聯絡管理員開通。"
          : "儲存失敗，請稍後再試",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  if (authLoading || loading)
    return <p className="text-center py-20 text-gray-400">載入中，請稍候…</p>;

  const currentCategory =
    CATEGORY_OPTIONS.find((c) => c.key === formData.category) ||
    CATEGORY_OPTIONS[0];

  return (
    <div className="px-4 md:px-0 flex flex-col gap-10">
      <div className="flex justify-between items-end border-b-2 border-[var(--color-card-border)] pb-4">
        <div>
          <h2 className="text-3xl font-black text-[var(--color-text-dark)]">
            你好, {user?.displayName} 👋
          </h2>
          <p className="text-[var(--color-text-mid)] font-bold mt-2">
            歡迎來到開發者儀表板
          </p>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Submit New Tool Form */}
        <div className="lg:w-1/2">
          <div className="bg-[var(--color-card-bg)] p-6 md:p-8 rounded-[24px] shadow-sm border border-[var(--color-card-border)]">
            <h3 className="font-extrabold text-xl mb-1 text-[var(--color-text-dark)] flex items-center gap-2">
              <span className="text-2xl">🚀</span> 上架一個工具
            </h3>
            <p className="text-sm text-[var(--color-text-mid)] mb-6">
              填這 <strong>4 個</strong>
              就好，其他細節（截圖、步驟、適用部門等）經企室審核時跟你討論補。
            </p>

            <AIPanel onGenerate={handleGenerate} isGenerating={isGenerating} />

            <form
              onSubmit={handleFormSubmit}
              className="flex flex-col gap-5 mt-4"
            >
              {/* ① 名字 */}
              <div>
                <label
                  htmlFor="dash-title"
                  className="block text-xs font-extrabold text-[var(--color-text-mid)] mb-2"
                >
                  ① 工具名字
                </label>
                <input
                  id="dash-title"
                  name="title"
                  value={formData.title}
                  onChange={handleInputChange}
                  required
                  placeholder="例：ISO 表單查詢 MCP"
                  className="w-full bg-gray-50 dark:bg-gray-700 p-3 rounded-xl border border-gray-200 dark:border-gray-600 text-sm outline-none focus:border-[var(--color-clay-purple)] transition-all"
                />
              </div>

              {/* ② Tagline */}
              <div>
                <label
                  htmlFor="dash-tagline"
                  className="block text-xs font-extrabold text-[var(--color-text-mid)] mb-2"
                >
                  ② 一句話介紹（tagline）
                </label>
                <input
                  id="dash-tagline"
                  name="tagline"
                  value={formData.tagline}
                  onChange={handleInputChange}
                  required
                  placeholder="例：把 ISO 表單接到 Claude/Cursor 裡，AI 直接查條文跟填單"
                  className="w-full bg-gray-50 dark:bg-gray-700 p-3 rounded-xl border border-gray-200 dark:border-gray-600 text-sm outline-none focus:border-[var(--color-clay-purple)] transition-all"
                />
              </div>

              {/* ③ 主連結 */}
              <div>
                <label
                  htmlFor="dash-url"
                  className="block text-xs font-extrabold text-[var(--color-text-mid)] mb-2"
                >
                  ③ 主連結
                  {["project", "skill", "platform"].includes(
                    formData.category,
                  ) && (
                    <span className="text-gray-500 dark:text-gray-400 font-normal">
                      （可留空）
                    </span>
                  )}
                </label>
                <input
                  id="dash-url"
                  name="url"
                  value={formData.url}
                  onChange={handleInputChange}
                  aria-describedby="dash-url-help"
                  required={
                    !["project", "skill", "platform"].includes(
                      formData.category,
                    )
                  }
                  placeholder={currentCategory.urlPlaceholder}
                  className="w-full bg-gray-50 dark:bg-gray-700 p-3 rounded-xl border border-gray-200 dark:border-gray-600 text-sm outline-none focus:border-[var(--color-clay-purple)] transition-all"
                />
                <p
                  id="dash-url-help"
                  className="text-xs text-gray-500 dark:text-gray-400 mt-1.5"
                >
                  不知道放什麼？貼 GitHub repo
                  連結就好，其他細節經企室審核時補。
                </p>
              </div>

              {/* ④ 類別 radio + 說明 */}
              <div>
                <label className="block text-xs font-extrabold text-[var(--color-text-mid)] mb-3">
                  ④ 類別（這是什麼樣的東西？）
                </label>
                <div className="grid grid-cols-1 gap-2">
                  {CATEGORY_OPTIONS.map((opt) => {
                    const isActive = formData.category === opt.key;
                    return (
                      <label
                        key={opt.key}
                        className={`flex gap-3 items-start cursor-pointer rounded-xl p-3 border-2 transition ${isActive ? "border-[var(--color-clay-purple)] bg-[var(--color-clay-purple)]/5" : "border-gray-200 dark:border-gray-600 hover:border-[var(--color-clay-purple)]/40"}`}
                      >
                        <input
                          type="radio"
                          name="category"
                          value={opt.key}
                          checked={isActive}
                          onChange={handleInputChange}
                          className="mt-1 accent-[var(--color-clay-purple)] w-4 h-4 flex-shrink-0"
                        />
                        <div className="flex-1">
                          <div className="font-extrabold text-sm text-[var(--color-text-dark)]">
                            {opt.emoji} {opt.label}
                          </div>
                          <div className="text-xs text-[var(--color-text-mid)] mt-0.5 leading-snug">
                            {opt.helper}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="mt-2 px-6 py-4 rounded-xl bg-gradient-to-br from-[var(--color-clay-purple)] to-[var(--color-clay-blue)] text-white font-extrabold text-base shadow-md hover:-translate-y-0.5 hover:shadow-lg transition-all disabled:opacity-60 disabled:cursor-not-allowed disabled:translate-y-0"
              >
                {isSubmitting ? "送出中…" : "📤 送出，等審核"}
              </button>

              <p className="text-center text-xs text-gray-500 dark:text-gray-400">
                送出後經企室會跟你討論截圖、使用步驟、進階安裝方式、適用部門等細節。
              </p>
            </form>
          </div>
        </div>

        {/* My Tools List */}
        <div className="lg:w-1/2">
          <h3 className="font-extrabold text-xl mb-6 text-[var(--color-text-dark)] flex items-center gap-2">
            <span className="text-2xl">🧰</span> 我提交的工具 ({myTools.length})
          </h3>

          {myTools.length === 0 ? (
            <div className="bg-gray-50 dark:bg-gray-800 rounded-[24px] p-10 h-[300px] border-2 border-dashed border-gray-200 dark:border-gray-700 flex flex-col items-center justify-center text-center">
              <span className="text-4xl mb-4 grayscale opacity-50">📦</span>
              <h4 className="font-bold text-gray-500 dark:text-gray-400">
                你還沒有提交任何工具
              </h4>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-4">
              {myTools.map((t) => (
                <div key={t.id} className="flex flex-col gap-1.5">
                  <ToolCard tool={t} />
                  <Link
                    href={`/tool/${t.id}`}
                    className="text-center py-1.5 rounded-xl bg-[var(--color-clay-purple)]/10 text-[var(--color-clay-purple)] text-xs font-bold border border-[var(--color-clay-purple)]/20 hover:bg-[var(--color-clay-purple)] hover:text-white transition-all"
                  >
                    ✏️ 前往編輯此工具
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 安全設定 — passkey / Face ID */}
      <div>
        <h3 className="font-extrabold text-xl mb-4 text-[var(--color-text-dark)] flex items-center gap-2">
          <span className="text-2xl">🛡️</span> 安全設定
        </h3>
        <PasskeyManager />
      </div>
    </div>
  );
}
