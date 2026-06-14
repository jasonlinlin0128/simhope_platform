"use client";

import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
} from "firebase/firestore";
import { FAQ_CATEGORIES } from "@/lib/faq";
import { useToast } from "@/components/Toast";
import { useConfirm } from "@/components/ConfirmDialog";
import { INPUT_BOX } from "@/lib/uiClasses";

const BLANK = {
  question: "",
  answer: "",
  category: "login",
  order: 0,
  published: true,
};

export default function FaqManager() {
  const [faqs, setFaqs] = useState([]);
  const [editing, setEditing] = useState(null); // {id?, ...fields}
  const [loading, setLoading] = useState(true);
  const toast = useToast();
  const confirm = useConfirm();

  const load = async () => {
    try {
      const snap = await getDocs(collection(db, "faqs"));
      setFaqs(
        snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
      );
    } catch (e) {
      // 不 rethrow：避免 save()/remove() 的 await load() 失敗時誤報「儲存失敗」
      console.error("載入 FAQ 失敗（faqs 規則是否已發布？）:", e);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    if (!editing.question?.trim()) return toast.error("請填問題");
    const payload = {
      question: editing.question.trim(),
      answer: editing.answer || "",
      category: editing.category || "login",
      order: Number(editing.order) || 0,
      published: editing.published !== false,
    };
    try {
      if (editing.id) await updateDoc(doc(db, "faqs", editing.id), payload);
      else await addDoc(collection(db, "faqs"), payload);
      setEditing(null);
      await load();
    } catch (e) {
      toast.error("儲存失敗：" + (e.code || e.message));
    }
  };

  const remove = async (id) => {
    if (!(await confirm({ message: "確定刪除這題？", danger: true }))) return;
    await deleteDoc(doc(db, "faqs", id));
    await load();
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-between items-center">
        <h3 className="font-extrabold text-lg text-[var(--color-text-dark)]">
          FAQ 管理（{faqs.length}）
        </h3>
        <button
          onClick={() => setEditing({ ...BLANK })}
          className="px-4 py-2 rounded-full bg-[var(--color-clay-purple)] text-white font-bold text-sm"
        >
          ＋ 新增題目
        </button>
      </div>

      {editing && (
        <div className="bg-[var(--color-card-bg)] border-2 border-[var(--color-clay-purple)]/40 rounded-2xl p-4 flex flex-col gap-3">
          <input
            value={editing.question}
            onChange={(e) =>
              setEditing({ ...editing, question: e.target.value })
            }
            placeholder="問題"
            className={`${INPUT_BOX} p-2 text-sm font-bold`}
          />
          <textarea
            value={editing.answer}
            onChange={(e) => setEditing({ ...editing, answer: e.target.value })}
            placeholder="答案（支援 markdown）"
            rows={4}
            className={`${INPUT_BOX} p-2 text-sm`}
          />
          <div className="flex gap-2 flex-wrap items-center">
            <select
              value={editing.category}
              onChange={(e) =>
                setEditing({ ...editing, category: e.target.value })
              }
              className={`${INPUT_BOX} p-2 text-sm`}
            >
              {FAQ_CATEGORIES.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.emoji} {c.label}
                </option>
              ))}
            </select>
            <input
              type="number"
              value={editing.order}
              onChange={(e) =>
                setEditing({ ...editing, order: e.target.value })
              }
              placeholder="排序"
              className={`w-20 ${INPUT_BOX} p-2 text-sm`}
            />
            <label className="flex items-center gap-1 text-sm font-bold">
              <input
                type="checkbox"
                checked={editing.published !== false}
                onChange={(e) =>
                  setEditing({ ...editing, published: e.target.checked })
                }
              />{" "}
              發布
            </label>
            <button
              onClick={save}
              className="px-4 py-2 rounded-full bg-[var(--color-clay-purple)] text-white font-bold text-sm"
            >
              儲存
            </button>
            <button
              onClick={() => setEditing(null)}
              className="px-4 py-2 rounded-full border border-gray-300 dark:border-gray-600 font-bold text-sm"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-[var(--color-text-mid)]">載入中…</p>
      ) : (
        <div className="flex flex-col gap-2">
          {faqs.map((f) => {
            const cat = FAQ_CATEGORIES.find((c) => c.key === f.category);
            return (
              <div
                key={f.id}
                className="flex items-center gap-3 bg-[var(--color-card-bg)] border border-[var(--color-card-border)] rounded-xl p-3"
              >
                <span className="text-xs font-bold text-[var(--color-text-mid)] w-10">
                  #{f.order ?? 0}
                </span>
                <span className="text-xs">{cat?.emoji}</span>
                <span className="flex-1 font-bold text-sm text-[var(--color-text-dark)] truncate">
                  {f.question}
                </span>
                {f.published === false && (
                  <span className="text-xs text-gray-400">（未發布）</span>
                )}
                <button
                  onClick={() => setEditing(f)}
                  className="text-xs font-bold text-[var(--color-clay-purple)]"
                >
                  編輯
                </button>
                <button
                  onClick={() => remove(f.id)}
                  className="text-xs font-bold text-red-500"
                >
                  刪除
                </button>
              </div>
            );
          })}
          {faqs.length === 0 && (
            <p className="text-[var(--color-text-mid)] text-sm">還沒有題目。</p>
          )}
        </div>
      )}
    </div>
  );
}
