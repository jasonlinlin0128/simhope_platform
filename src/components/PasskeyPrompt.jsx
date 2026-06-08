"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { passkeySupported, registerPasskey, listPasskeys } from "@/lib/passkey";
import Modal from "@/components/Modal";
import { useToast } from "@/components/Toast";

const DISMISS_KEY = "passkeyPromptDismissed";

/**
 * 首登提示：登入後若（瀏覽器支援 + 該使用者沒有 passkey + 沒按過「不再提示」）
 * 彈一次「要不要設定 Face ID 快速登入？」
 */
export default function PasskeyPrompt() {
  const { user, loading } = useAuth();
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (loading || !user) return;
    if (typeof window === "undefined") return;
    if (localStorage.getItem(DISMISS_KEY)) return;
    if (!passkeySupported()) return;
    let cancelled = false;
    (async () => {
      try {
        const keys = await listPasskeys();
        if (!cancelled && keys.length === 0) setShow(true);
      } catch {
        /* 靜默 */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, loading]);

  if (!show) return null;

  const dismiss = (remember) => {
    if (remember && typeof window !== "undefined")
      localStorage.setItem(DISMISS_KEY, "1");
    setShow(false);
  };

  const handleSetup = async () => {
    setBusy(true);
    try {
      await registerPasskey("我的裝置");
      setDone(true);
      if (typeof window !== "undefined") localStorage.setItem(DISMISS_KEY, "1");
      setTimeout(() => setShow(false), 1500);
    } catch (e) {
      // 失敗就讓使用者關掉，不強迫
      toast.error(
        "設定失敗：" +
          (e?.name === "NotAllowedError"
            ? "已取消或逾時"
            : e?.message || "未知錯誤"),
      );
      setBusy(false);
    }
  };

  return (
    <Modal
      onClose={() => dismiss(false)}
      labelledBy="pk-title"
      showClose={false}
      className="max-w-sm p-8 flex flex-col gap-4 text-center shadow-2xl border border-[var(--color-card-border)]"
    >
      <div className="text-5xl">🔐</div>
      {done ? (
        <>
          <h2
            id="pk-title"
            className="text-xl font-black text-[var(--color-text-dark)]"
          >
            設定完成！
          </h2>
          <p className="text-sm text-[var(--color-text-mid)]">
            下次登入可直接用 Face ID / 指紋。
          </p>
        </>
      ) : (
        <>
          <h2
            id="pk-title"
            className="text-xl font-black text-[var(--color-text-dark)]"
          >
            要不要設定 Face ID 快速登入？
          </h2>
          <p className="text-sm text-[var(--color-text-mid)] leading-relaxed">
            在這台裝置註冊一次，之後登入免打密碼、免選 Google 帳號，直接用 Face
            ID / 指紋進來。
          </p>
          <button
            onClick={handleSetup}
            disabled={busy}
            className="w-full py-3 rounded-xl bg-gradient-to-br from-[var(--color-clay-purple)] to-[var(--color-clay-blue)] text-white font-extrabold text-sm shadow hover:-translate-y-0.5 transition disabled:opacity-60"
          >
            {busy ? "設定中…" : "🔐 馬上設定"}
          </button>
          <div className="flex gap-2">
            <button
              onClick={() => dismiss(false)}
              className="flex-1 py-2 rounded-xl bg-gray-100 dark:bg-gray-700 text-[var(--color-text-mid)] font-bold text-sm"
            >
              稍後再說
            </button>
            <button
              onClick={() => dismiss(true)}
              className="flex-1 py-2 rounded-xl bg-gray-100 dark:bg-gray-700 text-[var(--color-text-mid)] font-bold text-sm"
            >
              不再提示
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
