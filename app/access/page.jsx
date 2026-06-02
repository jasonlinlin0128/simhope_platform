"use client";

import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import RequestModal from "@/components/RequestModal";

const ROLES = [
  {
    key: "viewer",
    label: "一般同仁",
    en: "viewer",
    caps: ["瀏覽 / 搜尋 / 使用所有資源"],
  },
  {
    key: "developer",
    label: "開發者",
    en: "developer",
    caps: ["以上全部", "上架自己的工具 / 痛點卡（送審）", "編輯自己上架的內容"],
  },
  {
    key: "admin",
    label: "管理員",
    en: "admin",
    caps: [
      "以上全部",
      "審核上架 · 退回、編輯全站內容",
      "管理 FAQ / 建開發者帳號 / 後台",
    ],
  },
];

const MATRIX = [
  ["瀏覽 / 搜尋 / 使用所有資源", true, true, true],
  ["上架自己的工具 / 痛點卡（送審）", false, true, true],
  ["編輯自己上架的內容", false, true, true],
  ["審核上架 · 退回、編輯全站內容", false, false, true],
  ["管理 FAQ / 建開發者帳號 / 後台", false, false, true],
];

export default function AccessPage() {
  const { user, isAdmin, isDeveloper } = useAuth();
  const [showReq, setShowReq] = useState(false);
  const current = isAdmin
    ? "admin"
    : isDeveloper
      ? "developer"
      : user
        ? "viewer"
        : null;

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-0 py-10">
      <header className="text-center mb-10">
        <h1 className="text-4xl md:text-5xl font-black text-[var(--color-text-dark)] mb-3">
          取用說明 / 權限分級
        </h1>
        <p className="text-[var(--color-text-mid)] font-semibold">
          登入用公司 Google 帳號或 Face
          ID（passkey）。首次登入自動成為「一般同仁」。
          {current && (
            <span className="ml-1">
              你目前：
              <strong className="text-[var(--color-clay-purple)]">
                {ROLES.find((r) => r.key === current)?.label}
              </strong>
              。
            </span>
          )}
        </p>
      </header>

      {/* 三欄角色卡 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
        {ROLES.map((r) => {
          const isCurrent = current === r.key;
          return (
            <div
              key={r.key}
              className={`rounded-3xl p-6 border-2 ${isCurrent ? "border-[var(--color-clay-purple)] bg-[var(--color-clay-purple)]/5" : "border-[var(--color-card-border)] bg-[var(--color-card-bg)]"}`}
            >
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="font-black text-lg text-[var(--color-text-dark)]">
                    {r.label}
                  </h3>
                  <span className="text-xs font-bold text-[var(--color-text-mid)]">
                    {r.en}
                  </span>
                </div>
                {isCurrent && (
                  <span className="text-xs font-extrabold bg-[var(--color-clay-purple)] text-white px-2 py-1 rounded-full">
                    你目前
                  </span>
                )}
              </div>
              <ul className="flex flex-col gap-2 text-sm font-semibold text-[var(--color-text-mid)]">
                {r.caps.map((c) => (
                  <li key={c} className="flex gap-2">
                    <span className="text-[var(--color-clay-purple)]">✓</span>
                    {c}
                  </li>
                ))}
              </ul>
              {r.key === "developer" && current === "viewer" && (
                <button
                  onClick={() => setShowReq(true)}
                  className="mt-5 w-full py-2.5 rounded-full bg-[var(--color-clay-purple)] text-white font-extrabold text-sm"
                >
                  📩 申請成為開發者
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* 對照表 */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse min-w-[480px]">
          <thead>
            <tr className="border-b-2 border-[var(--color-card-border)]">
              <th className="text-left py-3 font-extrabold text-[var(--color-text-dark)]">
                能做什麼
              </th>
              {ROLES.map((r) => (
                <th
                  key={r.key}
                  className="py-3 font-extrabold text-[var(--color-text-dark)] text-center"
                >
                  {r.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MATRIX.map(([cap, ...flags]) => (
              <tr
                key={cap}
                className="border-b border-[var(--color-card-border)]"
              >
                <td className="py-3 font-semibold text-[var(--color-text-mid)]">
                  {cap}
                </td>
                {flags.map((ok, i) => (
                  <td key={i} className="py-3 text-center">
                    {ok ? (
                      <span className="text-[var(--color-clay-purple)] font-black">
                        ✓
                      </span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!user && (
        <p className="text-center text-[var(--color-text-mid)] mt-8 font-semibold">
          登入後即可申請開發者權限。
        </p>
      )}

      {showReq && (
        <RequestModal type="access" onClose={() => setShowReq(false)} />
      )}
    </div>
  );
}
