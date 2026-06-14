"use client";

import { useState, useEffect, useCallback } from "react";
import { db } from "@/lib/firebase";
import {
  collection,
  getDocs,
  doc,
  updateDoc,
  setDoc,
  serverTimestamp,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  Timestamp,
} from "firebase/firestore";
import { useToast } from "@/components/Toast";
import { INPUT_BOX } from "@/lib/uiClasses";
import { notifyUidForHandled } from "@/lib/requestNotify.mjs";

const PAGE_SIZE = 50;
// 結案後保留 180 天，過後由 Firestore TTL policy（欄位 expireAt）自動清除。
const RETENTION_MS = 180 * 24 * 60 * 60 * 1000;
const newExpireAt = () => Timestamp.fromMillis(Date.now() + RETENTION_MS);

export default function RequestInbox() {
  const [reqs, setReqs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [cursor, setCursor] = useState(null); // 最後一筆 doc snapshot（分頁游標）
  const toast = useToast();
  const [hasMore, setHasMore] = useState(false);
  const [filter, setFilter] = useState("pending"); // pending | all

  // 取一頁：pending 時在 query 層過濾 where(status==pending)，分頁就在「已過濾集合」上翻
  // → 待審項目永不因排在第一頁之後而消失（修 audit #1）。all 時不加 where（如原本）。
  // pending+orderBy(createdAt) 需複合索引（firestore.indexes.json：status ASC + createdAt DESC）。
  const fetchPage = useCallback(async (after, statusFilter) => {
    const coll = collection(db, "requests");
    const constraints = [orderBy("createdAt", "desc")];
    if (statusFilter === "pending")
      constraints.unshift(where("status", "==", "pending"));
    if (after) constraints.push(startAfter(after));
    constraints.push(limit(PAGE_SIZE));
    const snap = await getDocs(query(coll, ...constraints));
    return {
      rows: snap.docs.map((d) => ({ id: d.id, ...d.data() })),
      last: snap.docs[snap.docs.length - 1] || null,
      full: snap.docs.length === PAGE_SIZE, // 滿頁才可能有下一頁
    };
  }, []);

  const load = useCallback(
    async (statusFilter) => {
      setLoading(true);
      try {
        const { rows, last, full } = await fetchPage(null, statusFilter);
        setReqs(rows);
        setCursor(last);
        setHasMore(full);
      } catch (e) {
        console.error("載入 requests 失敗（rules 已發布？索引已建？）:", e);
      } finally {
        setLoading(false);
      }
    },
    [fetchPage],
  );

  const loadMore = async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const { rows, last, full } = await fetchPage(cursor, filter);
      setReqs((prev) => [...prev, ...rows]);
      setCursor(last);
      setHasMore(full);
    } catch (e) {
      console.error("載入更多 requests 失敗:", e);
    } finally {
      setLoadingMore(false);
    }
  };

  // filter 變就從第一頁重新載入（pending/all 是不同 query），不再只 client 重濾。
  useEffect(() => {
    load(filter);
  }, [load, filter]);

  // 本地更新單筆狀態（毋需重抓整頁、保留已載入頁、即時反應）。
  const setStatus = (id, status) =>
    setReqs((rs) => rs.map((x) => (x.id === id ? { ...x, status } : x)));

  const approve = async (r) => {
    if (!r.uid) return;
    try {
      await updateDoc(doc(db, "users", r.uid), {
        role: "developer",
        devStatus: "approved",
      });
      await updateDoc(doc(db, "requests", r.id), {
        status: "approved",
        expireAt: newExpireAt(),
      });
      setStatus(r.id, "approved");
    } catch (e) {
      toast.error("核准失敗：" + (e.code || e.message));
    }
  };
  const reject = async (r) => {
    try {
      if (r.uid)
        await updateDoc(doc(db, "users", r.uid), { devStatus: "rejected" });
      await updateDoc(doc(db, "requests", r.id), {
        status: "rejected",
        expireAt: newExpireAt(),
      });
      setStatus(r.id, "rejected");
    } catch (e) {
      toast.error("操作失敗：" + (e.code || e.message));
    }
  };
  const markHandled = async (r) => {
    try {
      await updateDoc(doc(db, "requests", r.id), {
        status: "handled",
        handledAt: serverTimestamp(),
        expireAt: newExpireAt(),
      });
      // 站內未讀通知：標記提需求者 profile（匿名請求無 uid → 跳過；失敗不擋主流程）
      const uid = notifyUidForHandled(r);
      if (uid) {
        try {
          await setDoc(
            doc(db, "users", uid),
            { unreadHandledRequest: true },
            { merge: true },
          );
        } catch (e2) {
          console.error("標記未讀失敗（不擋主流程）：", e2);
        }
      }
      setStatus(r.id, "handled");
    } catch (e) {
      toast.error("操作失敗：" + (e.code || e.message));
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
          申請 / 需求（{shown.length}
          {hasMore ? "+" : ""}）
        </h3>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className={`${INPUT_BOX} p-2 text-sm`}
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
                        className="px-3 py-1 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-xs font-bold"
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

          {hasMore && (
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="self-center mt-1 px-4 py-1.5 rounded-full border border-[var(--color-card-border)] text-sm text-[var(--color-text-mid)] hover:bg-[var(--color-card-bg)] disabled:opacity-50"
            >
              {loadingMore ? "載入中…" : "載入更多（較舊）"}
            </button>
          )}
        </>
      )}
    </div>
  );
}
