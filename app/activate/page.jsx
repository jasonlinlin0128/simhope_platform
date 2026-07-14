"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithCustomToken } from "firebase/auth";
import { auth } from "@/lib/firebase";

const FIELD =
  "w-full px-4 py-2.5 rounded-xl border border-[var(--color-card-border)] bg-[var(--color-card-bg)] text-[var(--color-text-dark)] font-semibold text-sm outline-none focus:border-[var(--color-clay-purple)]";

/**
 * 首次啟用頁：員編＋統編（一次性驗證）→ 設定個人密碼 → 直接登入。
 * 之後的日常登入改用「員編＋個人密碼」或 Google / passkey。
 */
export default function ActivatePage() {
  const router = useRouter();
  const [employeeId, setEmployeeId] = useState("");
  const [taxId, setTaxId] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("兩次輸入的密碼不一致");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employee_id: employeeId.trim(),
          tax_id: taxId.trim(),
          new_password: password,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "啟用失敗，請稍後再試");
      await signInWithCustomToken(auth, data.customToken);
      router.push("/");
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  return (
    <main className="max-w-md mx-auto px-4 py-12">
      <h1 className="text-2xl font-extrabold text-[var(--color-text-dark)] mb-2">
        帳號首次啟用
      </h1>
      <p className="text-sm text-[var(--color-text-mid)] mb-8">
        輸入員工編號與公司統編完成身分確認，並設定你的個人密碼。啟用後請改用
        「員編＋個人密碼」登入（統編僅此一次使用，之後不再需要）。
      </p>

      {error && (
        <div
          role="alert"
          className="mb-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl px-4 py-2.5 text-sm font-bold text-red-600 dark:text-red-400"
        >
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <label
          className="text-xs font-bold text-[var(--color-text-mid)]"
          htmlFor="employee-id"
        >
          員工編號
        </label>
        <input
          id="employee-id"
          className={FIELD}
          value={employeeId}
          onChange={(e) => setEmployeeId(e.target.value)}
          autoComplete="username"
          required
        />
        <label
          className="text-xs font-bold text-[var(--color-text-mid)]"
          htmlFor="tax-id"
        >
          公司統一編號
        </label>
        <input
          id="tax-id"
          className={FIELD}
          value={taxId}
          onChange={(e) => setTaxId(e.target.value)}
          inputMode="numeric"
          required
        />
        <label
          className="text-xs font-bold text-[var(--color-text-mid)]"
          htmlFor="new-password"
        >
          設定個人密碼（至少 10 字元，不可為純數字或包含員編）
        </label>
        <input
          id="new-password"
          type="password"
          className={FIELD}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          minLength={10}
          required
        />
        <label
          className="text-xs font-bold text-[var(--color-text-mid)]"
          htmlFor="confirm-password"
        >
          再次輸入密碼
        </label>
        <input
          id="confirm-password"
          type="password"
          className={FIELD}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          minLength={10}
          required
        />
        <button
          type="submit"
          disabled={loading}
          className="mt-2 w-full py-3 rounded-xl bg-gradient-to-br from-[var(--color-clay-purple)] to-[var(--color-clay-blue)] text-white font-extrabold text-sm shadow-md hover:-translate-y-0.5 transition-all disabled:opacity-60"
        >
          {loading ? "啟用中…" : "啟用並登入"}
        </button>
      </form>
    </main>
  );
}
