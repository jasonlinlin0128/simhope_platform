"use client";

import { useState, useEffect } from "react";
import {
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";
import Link from "next/link";
import { db, auth } from "@/lib/firebase";
import { DEPTS } from "@/lib/db";
import { CATEGORIES, CATEGORY_ORDER, TYPES } from "@/lib/taxonomy";
import VersionEditor from "@/components/VersionEditor";
import { DANGER_BTN } from "@/lib/uiClasses";

const COLOR_OPTIONS = [
  {
    key: "c1",
    cls: "bg-gradient-to-br from-blue-100 to-blue-200 dark:from-blue-900/40 dark:to-blue-800/30",
    textCls: "text-blue-700",
  },
  {
    key: "c2",
    cls: "bg-gradient-to-br from-red-100 to-red-200 dark:from-red-900/40 dark:to-red-800/30",
    textCls: "text-red-700",
  },
  {
    key: "c3",
    cls: "bg-gradient-to-br from-purple-100 to-purple-200 dark:from-purple-900/40 dark:to-purple-800/30",
    textCls: "text-purple-700",
  },
  {
    key: "c4",
    cls: "bg-gradient-to-br from-amber-100 to-amber-200 dark:from-amber-900/40 dark:to-amber-800/30",
    textCls: "text-amber-700",
  },
  {
    key: "c5",
    cls: "bg-gradient-to-br from-emerald-100 to-emerald-200 dark:from-emerald-900/40 dark:to-emerald-800/30",
    textCls: "text-emerald-700",
  },
  {
    key: "c6",
    cls: "bg-gradient-to-br from-pink-100 to-pink-200 dark:from-pink-900/40 dark:to-pink-800/30",
    textCls: "text-pink-700",
  },
];

/**
 * 審核 wizard — 3 step：
 * 1. 看作者提交資料（唯讀）
 * 2. 補完細節（typeData / dept / folder / scenarios / desc / blog.summary / icon / color）
 * 3. 預覽 + 上架 / 退回 / 存草稿
 */
export default function ReviewToolWizard({ tool, onClose, onSaved }) {
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);

  // 把作者 uid 解析成「名字（email）」顯示（原本直接印 uid 像亂碼）。
  const [authorLabel, setAuthorLabel] = useState(tool.authorUid || "(無)");
  useEffect(() => {
    const uid = tool.authorUid;
    if (!uid) return;
    let active = true;
    getDoc(doc(db, "users", uid))
      .then((snap) => {
        if (!active) return;
        const u = snap.data() || {};
        const name = u.name || u.displayName || "";
        const email = u.email || "";
        setAuthorLabel(
          name && email ? `${name}（${email}）` : name || email || uid,
        );
      })
      .catch(() => {
        /* 讀不到就保留 uid */
      });
    return () => {
      active = false;
    };
  }, [tool.authorUid]);

  // form state — 初始化從 tool 既有資料
  const [form, setForm] = useState({
    title: tool.title || "",
    tagline: tool.tagline || "",
    url: tool.url || "",
    type: tool.type || "webapp",
    category: tool.category || "tool",
    icon: tool.icon || "📦",
    color: tool.color || "c1",
    dept: tool.dept || "other",
    folder: tool.folder || "未分類專案",
    scenarios: Array.isArray(tool.scenarios) ? tool.scenarios.join(", ") : "",
    tags: Array.isArray(tool.tags) ? tool.tags.join(", ") : "",
    desc: tool.desc || "",
    blogSummary: tool.blog?.summary || "",
    // typeData 動態欄位
    typeData: { ...(tool.typeData || {}) },
    versions: Array.isArray(tool.versions) ? tool.versions : [],
    status: tool.status || "pending",
  });

  const todayYMD = new Date().toISOString().slice(0, 10);

  const update = (patch) => setForm((prev) => ({ ...prev, ...patch }));
  const updateTd = (patch) =>
    setForm((prev) => ({ ...prev, typeData: { ...prev.typeData, ...patch } }));

  // AI 預填：讀 GitHub README → Gemini 生成 desc / scenarios / tags / icon / typeData
  const [enriching, setEnriching] = useState(false);
  const handleEnrich = async () => {
    setEnriching(true);
    try {
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch("/api/admin/enrich-tool", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          url: form.url,
          title: form.title,
          tagline: form.tagline,
          type: form.type,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "AI 預填失敗");
      }
      const r = await res.json();
      // 只覆蓋 AI 有回傳的欄位，保留 admin 已手動填的
      setForm((prev) => ({
        ...prev,
        desc: r.desc || prev.desc,
        icon: r.icon || prev.icon,
        scenarios:
          Array.isArray(r.scenarios) && r.scenarios.length
            ? r.scenarios.join(", ")
            : prev.scenarios,
        tags:
          Array.isArray(r.tags) && r.tags.length
            ? r.tags.join(", ")
            : prev.tags,
        typeData: (() => {
          // version/fileUrl/skillZipUrl 已移轉到 versions[]，AI 預填不再寫回
          const { version, fileUrl, skillZipUrl, ...rest } = r.typeData || {};
          return { ...prev.typeData, ...rest };
        })(),
      }));
      alert(
        r._readmeFound
          ? "✨ AI 已讀取 GitHub README 並填入建議內容，請確認後再調整。"
          : "✨ AI 已依名稱與介紹生成建議（沒抓到 README），請確認後再調整。",
      );
    } catch (err) {
      console.error(err);
      alert("AI 預填失敗：" + err.message);
    } finally {
      setEnriching(false);
    }
  };

  // 儲存到 Firestore（不改 status，只更新欄位）
  const handleSaveOnly = async (newStatus) => {
    setSaving(true);
    try {
      const payload = {
        title: form.title,
        tagline: form.tagline,
        url: form.url,
        type: form.type,
        category: form.category,
        icon: form.icon,
        color: form.color,
        dept: form.dept,
        folder: form.folder,
        scenarios: form.scenarios
          .split(/[,，]/)
          .map((s) => s.trim())
          .filter(Boolean),
        tags: form.tags
          .split(/[,，]/)
          .map((s) => s.trim())
          .filter(Boolean),
        desc: form.desc,
        typeData: form.typeData,
        versions: form.versions,
        blog: { ...(tool.blog || {}), summary: form.blogSummary },
        updatedAt: serverTimestamp(),
      };
      if (newStatus) {
        payload.status = newStatus;
      }
      await updateDoc(doc(db, "tools", tool.id), payload);
      onSaved?.();
    } catch (err) {
      console.error(err);
      alert("儲存失敗：" + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleReject = async () => {
    if (!confirm("確定打回票？工具會被刪除，作者要重新提交。")) return;
    try {
      await deleteDoc(doc(db, "tools", tool.id));
      onSaved?.();
    } catch (err) {
      console.error(err);
      alert("刪除失敗：" + err.message);
    }
  };

  return (
    <div className="bg-[var(--color-card-bg)] rounded-3xl shadow-lg border-2 border-[var(--color-clay-purple)]/30 p-6 md:p-8">
      {/* Header */}
      <div className="flex justify-between items-start mb-6 pb-4 border-b border-gray-100 dark:border-gray-700">
        <div>
          <h3 className="text-2xl font-black text-[var(--color-text-dark)] flex items-center gap-2">
            🔍 審核 wizard —{" "}
            <span className="text-[var(--color-clay-purple)]">
              {tool.title}
            </span>
          </h3>
          <p className="text-sm text-[var(--color-text-mid)] mt-1">
            作者：
            <b className="text-[var(--color-text-dark)]">{authorLabel}</b> ·
            狀態：{tool.status}
          </p>
          <p
            className="text-[10px] text-[var(--color-text-mid)]/50 mt-0.5 font-mono"
            title="工具文件 ID（除錯/支援用）"
          >
            ID: {tool.id}
          </p>
        </div>
        <button
          onClick={onClose}
          className="px-4 py-2 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-bold text-sm hover:bg-gray-200 dark:hover:bg-gray-600"
        >
          ✕ 關閉
        </button>
      </div>

      {/* Step indicator */}
      <div className="flex gap-2 mb-6">
        {[
          { n: 1, label: "看作者提交" },
          { n: 2, label: "補完細節" },
          { n: 3, label: "預覽 + 上架" },
        ].map((s) => (
          <button
            key={s.n}
            onClick={() => setStep(s.n)}
            className={`flex-1 py-2 rounded-xl font-extrabold text-sm transition ${
              step === s.n
                ? "bg-[var(--color-clay-purple)] text-white shadow"
                : "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600"
            }`}
          >
            Step {s.n} — {s.label}
          </button>
        ))}
      </div>

      {/* === Step 1: 作者提交（唯讀） === */}
      {step === 1 && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FieldRow label="① 工具名字" value={tool.title} />
            <FieldRow
              label="④ 類型"
              value={TYPES[tool.type]?.label || tool.type}
            />
          </div>
          <FieldRow label="② 一句話介紹" value={tool.tagline} />
          <FieldRow label="③ 主連結" value={tool.url || "(無)"} mono />
          <div className="text-xs text-[var(--color-text-mid)] italic mt-2">
            提交時間：
            {tool.createdAt?.toDate
              ? tool.createdAt.toDate().toLocaleString()
              : "(無)"}
          </div>
          <div className="flex justify-end mt-4">
            <button
              onClick={() => setStep(2)}
              className="px-6 py-3 rounded-xl bg-[var(--color-clay-purple)] text-white font-extrabold shadow hover:-translate-y-0.5 transition"
            >
              進入下一步 →
            </button>
          </div>
        </div>
      )}

      {/* === Step 2: 補完細節 === */}
      {step === 2 && (
        <div className="flex flex-col gap-5">
          {/* AI 預填 */}
          <div className="flex items-center justify-between gap-3 p-4 rounded-2xl bg-gradient-to-br from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20 border border-purple-100 dark:border-purple-800/40">
            <div>
              <div className="font-extrabold text-sm text-[var(--color-text-dark)]">
                ✨ AI 幫我補完
              </div>
              <div className="text-xs text-[var(--color-text-mid)] mt-0.5">
                讀主連結的 GitHub README，自動生成
                desc（Before/After）、適用場景、標籤、icon、typeData。會覆蓋對應欄位。
              </div>
            </div>
            <button
              onClick={handleEnrich}
              disabled={enriching}
              className="px-4 py-2.5 rounded-xl bg-gradient-to-br from-purple-500 to-blue-500 text-white font-extrabold text-xs whitespace-nowrap shadow disabled:opacity-50"
            >
              {enriching ? "生成中…" : "✨ AI 補完"}
            </button>
          </div>

          {/* 4 個原始欄位（仍可修） */}
          <div className="grid grid-cols-1 md:grid-cols-[80px_1fr] gap-3">
            <FormField label="Emoji">
              <input
                value={form.icon}
                onChange={(e) => update({ icon: e.target.value })}
                className="w-full bg-gray-50 dark:bg-gray-700 p-2 rounded-lg border border-gray-200 dark:border-gray-600 text-xl text-center outline-none focus:border-[var(--color-clay-purple)]"
              />
            </FormField>
            <FormField label="工具名字">
              <input
                value={form.title}
                onChange={(e) => update({ title: e.target.value })}
                className="w-full bg-gray-50 dark:bg-gray-700 p-2 rounded-lg border border-gray-200 dark:border-gray-600 text-sm outline-none focus:border-[var(--color-clay-purple)]"
              />
            </FormField>
          </div>
          <FormField label="一句話介紹 (tagline)">
            <input
              value={form.tagline}
              onChange={(e) => update({ tagline: e.target.value })}
              className="w-full bg-gray-50 dark:bg-gray-700 p-2 rounded-lg border border-gray-200 dark:border-gray-600 text-sm outline-none focus:border-[var(--color-clay-purple)]"
            />
          </FormField>
          <FormField label="類別（目錄分類，使用者看的）">
            <select
              value={form.category}
              onChange={(e) => update({ category: e.target.value })}
              className="w-full bg-gray-50 dark:bg-gray-700 p-2 rounded-lg border border-gray-200 dark:border-gray-600 text-sm"
            >
              {CATEGORY_ORDER.map((k) => (
                <option key={k} value={k}>
                  {CATEGORIES[k].emoji} {CATEGORIES[k].label}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="類型">
            <select
              value={form.type}
              onChange={(e) => update({ type: e.target.value })}
              className="w-full bg-gray-50 dark:bg-gray-700 p-2 rounded-lg border border-gray-200 dark:border-gray-600 text-sm"
            >
              {Object.entries(TYPES)
                .filter(([k]) => k !== "showcase")
                .map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
            </select>
          </FormField>
          <FormField label="主連結 (url)">
            <input
              value={form.url}
              onChange={(e) => update({ url: e.target.value })}
              placeholder="https://..."
              className="w-full bg-gray-50 dark:bg-gray-700 p-2 rounded-lg border border-gray-200 dark:border-gray-600 text-sm font-mono"
            />
          </FormField>

          {/* desc Pattern C */}
          <FormField label="desc — 詳細說明 (Pattern C：Before/After)">
            <textarea
              value={form.desc}
              onChange={(e) => update({ desc: e.target.value })}
              rows={5}
              placeholder="**Before**：原本的狀況...&#10;**After**：用這個工具後..."
              className="w-full bg-gray-50 dark:bg-gray-700 p-3 rounded-lg border border-gray-200 dark:border-gray-600 text-sm font-mono resize-y"
            />
          </FormField>

          {/* typeData — 依 type 不同 */}
          <div className="bg-[var(--color-card-bg)]/50 border border-dashed border-[var(--color-clay-purple)]/30 rounded-2xl p-4">
            <h4 className="font-extrabold text-sm text-[var(--color-text-dark)] mb-3">
              🔧 類型專屬欄位 (typeData) — 依目前類型 [{TYPES[form.type]?.label}
              ]
            </h4>
            <TypeDataEditor
              type={form.type}
              td={form.typeData}
              updateTd={updateTd}
            />
          </div>

          {/* 版本歷史（單一真相 versions[]，與詳情頁同一編輯器） */}
          <div className="bg-[var(--color-card-bg)]/50 border border-dashed border-[var(--color-clay-purple)]/30 rounded-2xl p-4">
            <VersionEditor
              versions={form.versions}
              type={form.type}
              onChange={(next) => update({ versions: next })}
              todayYMD={todayYMD}
            />
          </div>

          {/* admin enrichment */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="主責部門">
              <select
                value={form.dept}
                onChange={(e) => update({ dept: e.target.value })}
                className="w-full bg-gray-50 dark:bg-gray-700 p-2 rounded-lg border border-gray-200 dark:border-gray-600 text-sm"
              >
                {Object.entries(DEPTS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="專案目錄 (folder)">
              <input
                value={form.folder}
                onChange={(e) => update({ folder: e.target.value })}
                placeholder="例：日報表專案"
                className="w-full bg-gray-50 dark:bg-gray-700 p-2 rounded-lg border border-gray-200 dark:border-gray-600 text-sm"
              />
            </FormField>
          </div>
          <FormField label="適用場景 (用逗號分隔)">
            <input
              value={form.scenarios}
              onChange={(e) => update({ scenarios: e.target.value })}
              placeholder="生產現場, 工時統計"
              className="w-full bg-gray-50 dark:bg-gray-700 p-2 rounded-lg border border-gray-200 dark:border-gray-600 text-sm"
            />
          </FormField>
          <FormField label="標籤 tags (用逗號分隔)">
            <input
              value={form.tags}
              onChange={(e) => update({ tags: e.target.value })}
              placeholder="AI, RAG, Teams"
              className="w-full bg-gray-50 dark:bg-gray-700 p-2 rounded-lg border border-gray-200 dark:border-gray-600 text-sm"
            />
          </FormField>

          {/* color */}
          <FormField label="卡片底色">
            <div className="flex gap-2 flex-wrap">
              {COLOR_OPTIONS.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => update({ color: c.key })}
                  className={`w-10 h-10 rounded-xl ${c.cls} ${form.color === c.key ? "ring-2 ring-[var(--color-clay-purple)] ring-offset-2" : ""}`}
                  aria-label={c.key}
                >
                  {form.color === c.key && (
                    <span className="text-white font-black">✓</span>
                  )}
                </button>
              ))}
            </div>
          </FormField>

          <FormField label="blog.summary（詳情頁短摘要，選填）">
            <textarea
              value={form.blogSummary}
              onChange={(e) => update({ blogSummary: e.target.value })}
              rows={2}
              className="w-full bg-gray-50 dark:bg-gray-700 p-2 rounded-lg border border-gray-200 dark:border-gray-600 text-sm"
            />
            <p className="text-xs text-gray-400 mt-1">
              註：詳細說明的 block editor（圖文/影音步驟）請到「詳情頁 →
              編輯」加
            </p>
          </FormField>

          <div className="flex justify-between mt-4">
            <button
              onClick={() => setStep(1)}
              className="px-5 py-2.5 rounded-xl bg-gray-100 dark:bg-gray-700 text-[var(--color-text-mid)] font-bold"
            >
              ← 上一步
            </button>
            <div className="flex gap-2">
              <button
                onClick={() => handleSaveOnly()}
                disabled={saving}
                className="px-5 py-2.5 rounded-xl bg-white dark:bg-gray-800 text-[var(--color-clay-purple)] font-extrabold border-2 border-[var(--color-clay-purple)] disabled:opacity-50"
              >
                💾 暫存
              </button>
              <button
                onClick={() => setStep(3)}
                className="px-6 py-2.5 rounded-xl bg-[var(--color-clay-purple)] text-white font-extrabold shadow"
              >
                預覽 + 上架 →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* === Step 3: 預覽 + 上架 === */}
      {step === 3 && (
        <div className="flex flex-col gap-5">
          <div className="bg-blue-50/50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-2xl p-4">
            <p className="text-sm font-bold text-blue-800 dark:text-blue-200">
              ✨ 已套用以下變更（尚未寫入 Firestore，按下方按鈕才會生效）
            </p>
          </div>

          {/* mini preview card */}
          <div className="bg-[var(--color-card-bg)] rounded-2xl border border-[var(--color-card-border)] p-5 max-w-sm shadow">
            <div className="flex items-center gap-3 mb-2">
              <div
                className={`w-12 h-12 rounded-2xl ${COLOR_OPTIONS.find((c) => c.key === form.color)?.cls || "bg-gray-100 dark:bg-gray-700"} flex items-center justify-center text-2xl`}
              >
                {form.icon}
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="font-extrabold text-sm truncate">
                  {form.title}
                </h4>
                <span className="text-[0.65rem] inline-block px-1.5 py-0.5 rounded font-bold bg-gray-100 dark:bg-gray-700">
                  {TYPES[form.type]?.label}
                </span>
              </div>
            </div>
            <p className="text-xs text-[var(--color-text-mid)] line-clamp-2">
              {form.tagline}
            </p>
          </div>

          <Link
            href={`/tool/${tool.id}`}
            target="_blank"
            className="inline-block w-fit px-5 py-2 rounded-lg bg-gray-100 dark:bg-gray-700 text-[var(--color-text-mid)] font-bold text-sm border border-gray-300 dark:border-gray-600 hover:bg-gray-200 dark:hover:bg-gray-600"
          >
            👀 在新分頁開詳情頁
          </Link>

          <div className="bg-[var(--color-card-bg)]/50 border border-dashed border-gray-300 dark:border-gray-600 rounded-2xl p-4">
            <h4 className="font-extrabold text-sm mb-3">設定上架狀態</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {[
                {
                  val: "live",
                  label: "🟢 使用中",
                  cls: "bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-300 dark:border-green-700",
                },
                {
                  val: "beta",
                  label: "🟠 測試中",
                  cls: "bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 border-orange-300 dark:border-orange-700",
                },
                {
                  val: "new",
                  label: "🌟 新上線",
                  cls: "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700",
                },
                {
                  val: "dev",
                  label: "🔨 開發中",
                  cls: "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600",
                },
              ].map((s) => (
                <button
                  key={s.val}
                  onClick={() => update({ status: s.val })}
                  className={`px-3 py-2 rounded-lg border-2 font-bold text-sm transition ${form.status === s.val ? s.cls + " ring-2 ring-[var(--color-clay-purple)]" : "bg-white dark:bg-gray-800 text-gray-400 border-gray-200 dark:border-gray-600"}`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-between gap-3 mt-4 flex-wrap">
            <button
              onClick={() => setStep(2)}
              className="px-5 py-2.5 rounded-xl bg-gray-100 dark:bg-gray-700 text-[var(--color-text-mid)] font-bold"
            >
              ← 上一步
            </button>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={handleReject}
                disabled={saving}
                className={`${DANGER_BTN} px-5 py-2.5 rounded-xl font-bold disabled:opacity-50`}
              >
                🗑️ 退回（刪除）
              </button>
              <button
                onClick={() => handleSaveOnly("pending")}
                disabled={saving}
                className="px-5 py-2.5 rounded-xl bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300 font-bold border-2 border-yellow-300 dark:border-yellow-700 disabled:opacity-50"
              >
                💾 先存草稿 (pending)
              </button>
              <button
                onClick={() => handleSaveOnly(form.status)}
                disabled={saving}
                className="px-6 py-2.5 rounded-xl bg-gradient-to-br from-[var(--color-clay-purple)] to-[var(--color-clay-blue)] text-white font-extrabold shadow disabled:opacity-50"
              >
                {saving ? "上架中..." : `🚀 上架 (status: ${form.status})`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Helper components ──────────────────────────────────────────────────────

function FieldRow({ label, value, mono }) {
  return (
    <div>
      <label className="text-xs font-extrabold text-[var(--color-text-mid)] uppercase tracking-wider">
        {label}
      </label>
      <p
        className={`mt-1 text-[var(--color-text-dark)] ${mono ? "font-mono text-sm break-all" : "font-bold"}`}
      >
        {value || "(未填)"}
      </p>
    </div>
  );
}

function FormField({ label, children }) {
  return (
    <div>
      <label className="block text-xs font-extrabold text-[var(--color-text-mid)] mb-1">
        {label}
      </label>
      {children}
    </div>
  );
}

function TypeDataEditor({ type, td, updateTd }) {
  if (type === "webapp") {
    return (
      <p className="text-sm text-[var(--color-text-mid)] italic">
        webapp 類型不需要額外 typeData，main url 就夠。
      </p>
    );
  }

  if (type === "download") {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <FormField label="platform">
          <select
            value={td.platform || ""}
            onChange={(e) => updateTd({ platform: e.target.value })}
            className="w-full bg-gray-50 dark:bg-gray-700 p-2 rounded-lg border border-gray-200 dark:border-gray-600 text-sm"
          >
            <option value="">(無)</option>
            <option value="windows">Windows</option>
            <option value="mac">Mac</option>
            <option value="linux">Linux</option>
            <option value="crossplatform">Cross-platform</option>
          </select>
        </FormField>
        <FormField label="fileName">
          <input
            value={td.fileName || ""}
            onChange={(e) => updateTd({ fileName: e.target.value })}
            placeholder="installer.exe"
            className="w-full bg-gray-50 dark:bg-gray-700 p-2 rounded-lg border border-gray-200 dark:border-gray-600 text-sm font-mono"
          />
        </FormField>
      </div>
    );
  }

  if (type === "doc") {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <FormField label="fileType">
          <select
            value={td.fileType || ""}
            onChange={(e) => updateTd({ fileType: e.target.value })}
            className="w-full bg-gray-50 dark:bg-gray-700 p-2 rounded-lg border border-gray-200 dark:border-gray-600 text-sm"
          >
            <option value="">(無)</option>
            <option value="pdf">PDF</option>
            <option value="docx">Word (.docx)</option>
            <option value="xlsx">Excel (.xlsx)</option>
            <option value="zip">ZIP</option>
            <option value="other">其他</option>
          </select>
        </FormField>
        <FormField label="fileName">
          <input
            value={td.fileName || ""}
            onChange={(e) => updateTd({ fileName: e.target.value })}
            placeholder="表單名.docx"
            className="w-full bg-gray-50 dark:bg-gray-700 p-2 rounded-lg border border-gray-200 dark:border-gray-600 text-sm font-mono"
          />
        </FormField>
      </div>
    );
  }

  if (type === "mcp") {
    return (
      <div className="flex flex-col gap-3">
        <FormField label="mcpbUrl (.mcpb 一鍵安裝包連結)">
          <input
            value={td.mcpbUrl || ""}
            onChange={(e) => updateTd({ mcpbUrl: e.target.value })}
            placeholder="https://.../iso-form.mcpb"
            className="w-full bg-gray-50 dark:bg-gray-700 p-2 rounded-lg border border-gray-200 dark:border-gray-600 text-sm font-mono"
          />
        </FormField>
        <FormField label="npmPackage">
          <input
            value={td.npmPackage || ""}
            onChange={(e) => updateTd({ npmPackage: e.target.value })}
            placeholder="@simhope/iso-form-mcp 或 github:simhope/iso-form-mcp"
            className="w-full bg-gray-50 dark:bg-gray-700 p-2 rounded-lg border border-gray-200 dark:border-gray-600 text-sm font-mono"
          />
        </FormField>
        <FormField label="repoUrl">
          <input
            value={td.repoUrl || ""}
            onChange={(e) => updateTd({ repoUrl: e.target.value })}
            placeholder="https://github.com/simhope/..."
            className="w-full bg-gray-50 dark:bg-gray-700 p-2 rounded-lg border border-gray-200 dark:border-gray-600 text-sm font-mono"
          />
        </FormField>
        <FormField label="configSnippet（給 Cursor / VSCode 貼到 mcp config 的 JSON）">
          <textarea
            value={td.configSnippet || ""}
            onChange={(e) => updateTd({ configSnippet: e.target.value })}
            rows={6}
            placeholder='{&#10;  "mcpServers": {&#10;    "iso-form": { "command": "npx", "args": ["-y", "github:simhope/iso-form-mcp"] }&#10;  }&#10;}'
            className="w-full bg-gray-900 text-gray-100 p-3 rounded-lg border border-gray-700 text-xs font-mono resize-y"
          />
        </FormField>
      </div>
    );
  }

  if (type === "api") {
    return (
      <div className="flex flex-col gap-3">
        <FormField label="endpoint">
          <input
            value={td.endpoint || ""}
            onChange={(e) => updateTd({ endpoint: e.target.value })}
            placeholder="https://api.simhope.local/..."
            className="w-full bg-gray-50 dark:bg-gray-700 p-2 rounded-lg border border-gray-200 dark:border-gray-600 text-sm font-mono"
          />
        </FormField>
        <FormField label="docsUrl">
          <input
            value={td.docsUrl || ""}
            onChange={(e) => updateTd({ docsUrl: e.target.value })}
            placeholder="https://docs.simhope.local/..."
            className="w-full bg-gray-50 dark:bg-gray-700 p-2 rounded-lg border border-gray-200 dark:border-gray-600 text-sm font-mono"
          />
        </FormField>
        <FormField label="sdkPackage (optional)">
          <input
            value={td.sdkPackage || ""}
            onChange={(e) => updateTd({ sdkPackage: e.target.value })}
            placeholder="@simhope/translate-sdk"
            className="w-full bg-gray-50 dark:bg-gray-700 p-2 rounded-lg border border-gray-200 dark:border-gray-600 text-sm font-mono"
          />
        </FormField>
      </div>
    );
  }

  if (type === "embedded") {
    return (
      <div className="flex flex-col gap-3">
        <FormField label="location（部署地點 — 哪台電腦 / 哪個設備 / 哪個區域）">
          <input
            value={td.location || ""}
            onChange={(e) => updateTd({ location: e.target.value })}
            placeholder="例：機敏辦公室影印機旁的專用電腦 / 加工部 3 號機台電腦"
            className="w-full bg-gray-50 dark:bg-gray-700 p-2 rounded-lg border border-gray-200 dark:border-gray-600 text-sm"
          />
        </FormField>
        <FormField label="accessNote（怎麼使用 / 找誰開通）">
          <textarea
            value={td.accessNote || ""}
            onChange={(e) => updateTd({ accessNote: e.target.value })}
            rows={3}
            placeholder="例：直接到該台電腦操作即可；需要權限請找 MIS。"
            className="w-full bg-gray-50 dark:bg-gray-700 p-2 rounded-lg border border-gray-200 dark:border-gray-600 text-sm resize-y"
          />
        </FormField>
        <FormField label="contact（負責窗口，選填）">
          <input
            value={td.contact || ""}
            onChange={(e) => updateTd({ contact: e.target.value })}
            placeholder="例：經企室 Jason / MIS 團隊"
            className="w-full bg-gray-50 dark:bg-gray-700 p-2 rounded-lg border border-gray-200 dark:border-gray-600 text-sm"
          />
        </FormField>
      </div>
    );
  }

  if (type === "skill") {
    return (
      <div className="flex flex-col gap-3">
        <FormField label="installPath">
          <input
            value={td.installPath || ""}
            onChange={(e) => updateTd({ installPath: e.target.value })}
            placeholder="~/.claude/skills/"
            className="w-full bg-gray-50 dark:bg-gray-700 p-2 rounded-lg border border-gray-200 dark:border-gray-600 text-sm font-mono"
          />
        </FormField>
      </div>
    );
  }

  return null;
}
