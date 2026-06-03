"use client";

import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, getDocs, doc, updateDoc } from "firebase/firestore";

export default function RequestInbox() {
  const [reqs, setReqs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("pending"); // pending | all

  const load = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, "requests"));
      setReqs(
        snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort(
            (a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0),
          ),
      );
    } catch (e) {
      console.error("載入 requests 失敗（rules 是否已發布？）:", e);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);

  const approve = async (r) => {
    if (!r.uid) return;
    try {
      await updateDoc(doc(db, "users", r.uid), {
        role: "developer",
        devStatus: "approved",
      });
      await updateDoc(doc(db, "requests", r.id), { status: "approved" });
      await load();
    } catch (e) {
      alert("核准失敗：" + (e.code || e.message));
    }
  };
  const reject = async (r) => {
    try {
      if (r.uid)
        await updateDoc(doc(db, "users", r.uid), { devStatus: "rejected" });
      await updateDoc(doc(db, "requests", r.id), { status: "rejected" });
      await load();
    } catch (e) {
      alert("操作失敗：" + (e.code || e.message));
    }
  };
  const markHandled = async (r) => {
    try {
      await updateDoc(doc(db, "requests", r.id), { status: "handled" });
      await load();
    } catch (e) {
      alert("操作失敗：" + (e.code || e.message));
    }
  };

  const shown = reqs.filter((r) =>
    filter === "pending" ? r.status === "pending" : true,
  );
  const access = shown.filter((r) => r.type === "access");
  const feature = shown.filter((r) => r.type === "feature");

  const badge = (s) =>
    ({
      pending: "🕓 待處理",
      approved: "✅ 已核准",
      rejected: "✕ 已拒絕",
      handled: "✅ 已處理",
    })[s] || s;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex justify-between items-center">
        <h3 className="font-extrabold text-lg text-[var(--color-text-dark)]">
          申請 / 需求（{shown.length}）
        </h3>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="bg-gray-50 dark:bg-gray-700 p-2 rounded-lg border border-gray-200 dark:border-gray-600 text-sm"
        >
          <option value="pending">待處理</option>
          <option value="all">全部</option>
        </select>
      </div>

      {loading ? (
        <p className="text-[var(--color-text-mid)]">載入中…</p>
      ) : (
        <>
          <div>
            <p className="text-xs font-extrabold text-[var(--color-text-mid)] uppercase tracking-wider mb-2">
              🔑 開發者申請
            </p>
            <div className="flex flex-col gap-2">
              {access.map((r) => (
                <div
                  key={r.id}
                  className="bg-[var(--color-card-bg)] border border-[var(--color-card-border)] rounded-xl p-3 text-sm"
                >
                  <div className="flex justify-between">
                    <b className="text-[var(--color-text-dark)]">
                      {r.name || r.email || r.uid}
                    </b>
                    <span className="text-xs text-[var(--color-text-mid)]">
                      {badge(r.status)}
                    </span>
                  </div>
                  <p className="text-[var(--color-text-mid)] mt-1">{r.email}</p>
                  <p className="text-[var(--color-text-mid)] mt-1">
                    理由：{r.reason}
                  </p>
                  {r.status === "pending" && (
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={() => approve(r)}
                        className="px-3 py-1 rounded-full bg-emerald-500 text-white text-xs font-bold"
                      >
                        ✓ 核准（設為開發者）
                      </button>
                      <button
                        onClick={() => reject(r)}
                        className="px-3 py-1 rounded-full bg-red-100 text-red-600 text-xs font-bold"
                      >
                        ✕ 拒絕
                      </button>
                    </div>
                  )}
                </div>
              ))}
              {access.length === 0 && (
                <p className="text-[var(--color-text-mid)] text-sm">無</p>
              )}
            </div>
          </div>

          <div>
            <p className="text-xs font-extrabold text-[var(--color-text-mid)] uppercase tracking-wider mb-2">
              💬 提需求
            </p>
            <div className="flex flex-col gap-2">
              {feature.map((r) => (
                <div
                  key={r.id}
                  className="bg-[var(--color-card-bg)] border border-[var(--color-card-border)] rounded-xl p-3 text-sm"
                >
                  <div className="flex justify-between">
                    <b className="text-[var(--color-text-dark)]">
                      {r.name}
                      {r.contact ? `（${r.contact}）` : ""}
                    </b>
                    <span className="text-xs text-[var(--color-text-mid)]">
                      {badge(r.status)}
                    </span>
                  </div>
                  <p className="text-[var(--color-text-mid)] mt-1">
                    {r.message}
                  </p>
                  {r.status === "pending" && (
                    <button
                      onClick={() => markHandled(r)}
                      className="mt-2 px-3 py-1 rounded-full bg-[var(--color-clay-purple)] text-white text-xs font-bold"
                    >
                      標記已處理
                    </button>
                  )}
                </div>
              ))}
              {feature.length === 0 && (
                <p className="text-[var(--color-text-mid)] text-sm">無</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
