"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useRef,
} from "react";

const ToastCtx = createContext(null);

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error("useToast 必須在 <ToastProvider> 內使用");
  return ctx;
}

const TYPE_STYLE = {
  error:
    "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-200 border-red-200 dark:border-red-800",
  success:
    "bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-200 border-green-200 dark:border-green-800",
  info: "bg-[var(--color-card-bg)] text-[var(--color-text-dark)] border-[var(--color-card-border)]",
};
const TYPE_ICON = { error: "❌", success: "✅", info: "ℹ️" };
const DURATION = { error: 5000, success: 3500, info: 3500 };
const MAX = 4;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback((message, type = "info") => {
    const id = ++idRef.current;
    setToasts((prev) => [...prev, { id, message, type }].slice(-MAX));
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, DURATION[type] ?? 3500);
    return id;
  }, []);

  const toast = useMemo(
    () => ({
      show,
      error: (m) => show(m, "error"),
      success: (m) => show(m, "success"),
      info: (m) => show(m, "info"),
    }),
    [show],
  );

  return (
    <ToastCtx.Provider value={toast}>
      {children}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[300] flex flex-col items-center gap-2 w-full max-w-sm px-4 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            aria-live={t.type === "error" ? "assertive" : "polite"}
            className={`pointer-events-auto w-full flex items-start gap-2 rounded-xl border px-4 py-3 shadow-lg text-sm font-bold ${TYPE_STYLE[t.type] || TYPE_STYLE.info}`}
          >
            <span aria-hidden="true">
              {TYPE_ICON[t.type] || TYPE_ICON.info}
            </span>
            <span className="flex-1 whitespace-pre-wrap leading-relaxed">
              {t.message}
            </span>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="關閉通知"
              className="opacity-60 hover:opacity-100 text-lg leading-none"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
