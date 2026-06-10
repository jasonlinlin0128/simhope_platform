"use client";

import { useAuth } from "@/context/AuthContext";
import { devCtaState } from "@/lib/devStatus.mjs";

/**
 * /access 開發者角色卡的 CTA：依使用者 role + devStatus 顯示
 * 申請鈕 / 審核中 / 未通過(+重新申請) / 不顯示。
 * @param {{ onApply: () => void }} props  onApply：開 LoginModal 申請流程
 */
export default function DevStatusCTA({ onApply }) {
  const { user, isAdmin, isDeveloper, profile } = useAuth();
  if (!user) return null; // 未登入：頁面別處已有「登入後即可申請」

  const role = isAdmin ? "admin" : isDeveloper ? "developer" : "viewer";
  const state = devCtaState(role, profile?.devStatus);

  if (state === "none") return null;

  if (state === "apply") {
    return (
      <button
        onClick={onApply}
        className="mt-5 w-full py-2.5 rounded-full bg-[var(--color-clay-purple)] text-white font-extrabold text-sm"
      >
        📩 申請成為開發者
      </button>
    );
  }

  if (state === "pending") {
    return (
      <div className="mt-5 w-full py-2.5 px-3 rounded-2xl bg-[var(--color-card-bg)] border border-[var(--color-card-border)] text-center text-sm font-bold text-[var(--color-text-mid)]">
        🕓 申請審核中，佳賢跟他的代理人評估後會通知你
      </div>
    );
  }

  // state === "rejected"
  return (
    <div className="mt-5 w-full flex flex-col gap-2">
      <div className="py-2.5 px-3 rounded-2xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-center text-sm font-bold text-red-600 dark:text-red-400">
        ✕ 申請未通過
      </div>
      <p className="text-xs text-center text-[var(--color-text-mid)]">
        如需重新申請請聯絡佳賢
      </p>
      <button
        onClick={onApply}
        className="w-full py-2.5 rounded-full bg-[var(--color-clay-purple)] text-white font-extrabold text-sm"
      >
        📩 重新申請
      </button>
    </div>
  );
}
