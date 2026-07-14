"use client";

import { useCallback, useEffect, useState } from "react";
import { auth } from "@/lib/firebase";
import { AUDIT_ACTIONS } from "@/lib/auditLog.mjs";

const ACTION_LABEL = {
  AUTH_ACTIVATE: "帳號啟用",
  AUTH_LOGIN: "登入",
  AUTH_LOGIN_FAIL: "登入/啟用失敗",
  APP_OPEN: "開啟系統",
  APP_REGISTER: "系統註冊",
  APP_UPDATE: "系統更新",
  APP_STATUS_CHANGE: "狀態變更",
  PERMISSION_CHANGE: "權限變更",
  EMPLOYEE_IMPORT: "名冊匯入",
  EMPLOYEE_DEACTIVATE: "員工停用",
};

const RESULT_STYLE = {
  ok: "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400",
  denied: "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400",
  error: "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400",
};

/** admin 後台「稽核記錄」：登入、啟用、權限變更、系統開啟的 append-only 紀錄。 */
export default function AuditLogViewer() {
  const [logs, setLogs] = useState([]);
  const [action, setAction] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const load = useCallback(async (filter) => {
    setLoading(true);
    setErr("");
    try {
      const idToken = await auth.currentUser.getIdToken();
      const qs = filter ? `?action=${encodeURIComponent(filter)}` : "";
      const res = await fetch(`/api/admin/audit-logs${qs}`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "讀取失敗");
      setLogs(Array.isArray(d.logs) ? d.logs : []);
    } catch (e) {
      setErr(e.message || "讀取失敗");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(action);
  }, [action, load]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-black text-lg text-[var(--color-text-dark)]">
            🧾 稽核記錄
          </h3>
          <p className="text-sm text-[var(--color-text-mid)]">
            登入、帳號啟用、權限變更與系統開啟行為。唯讀、不可竄改，保留 400
            天。
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm font-bold text-[var(--color-text-mid)]">
          篩選
          <select
            value={action}
            onChange={(e) => setAction(e.target.value)}
            className="bg-[var(--color-card-bg)] border border-[var(--color-card-border)] rounded-lg px-3 py-1.5 text-sm font-semibold text-[var(--color-text-dark)]"
          >
            <option value="">全部行為</option>
            {AUDIT_ACTIONS.map((a) => (
              <option key={a} value={a}>
                {ACTION_LABEL[a] ?? a}
              </option>
            ))}
          </select>
        </label>
      </div>

      {err && (
        <div
          role="alert"
          className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl px-4 py-2.5 text-sm font-bold text-red-600 dark:text-red-400"
        >
          {err}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-[var(--color-text-mid)]">讀取中…</p>
      ) : logs.length === 0 ? (
        <p className="text-sm text-[var(--color-text-mid)]">
          目前沒有符合條件的紀錄。
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-bold text-[var(--color-text-mid)] border-b border-[var(--color-card-border)]">
                <th className="py-2 pr-3">時間</th>
                <th className="py-2 pr-3">行為</th>
                <th className="py-2 pr-3">對象</th>
                <th className="py-2 pr-3">執行者</th>
                <th className="py-2 pr-3">結果</th>
                <th className="py-2">來源 IP</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr
                  key={l.id}
                  className="border-b border-[var(--color-card-border)] last:border-0"
                >
                  <td className="py-2 pr-3 whitespace-nowrap text-[var(--color-text-mid)]">
                    {new Date(l.ts).toLocaleString("zh-TW")}
                  </td>
                  <td className="py-2 pr-3 font-bold text-[var(--color-text-dark)]">
                    {ACTION_LABEL[l.action] ?? l.action}
                  </td>
                  <td className="py-2 pr-3 text-[var(--color-text-mid)]">
                    {l.target ?? "—"}
                  </td>
                  <td className="py-2 pr-3 text-[var(--color-text-mid)]">
                    {l.actor_employee_id ?? l.actor_uid ?? "—"}
                  </td>
                  <td className="py-2 pr-3">
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-bold ${RESULT_STYLE[l.result] ?? ""}`}
                    >
                      {l.result}
                    </span>
                  </td>
                  <td className="py-2 text-xs text-[var(--color-text-mid)]">
                    {l.ip ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
