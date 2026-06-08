"use client";

import { useEffect, useRef } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * 共用 overlay modal：role=dialog + aria-modal、Esc / 點背景 / X 關閉、focus trap、
 * 開啟移焦 + 關閉還焦、body scroll lock。
 * @param {{
 *   onClose: () => void,
 *   children: React.ReactNode,
 *   labelledBy?: string,
 *   label?: string,
 *   className?: string,
 *   showClose?: boolean,
 *   closeOnBackdrop?: boolean,
 * }} props
 */
export default function Modal({
  onClose,
  children,
  labelledBy,
  label,
  className = "",
  showClose = true,
  closeOnBackdrop = true,
}) {
  const panelRef = useRef(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // mount-once：移焦 + scroll lock + Esc/Tab 監聽 + 卸載還焦（用 ref 讀最新 onClose，避免 churn）
  useEffect(() => {
    const panel = panelRef.current;
    const previouslyFocused = document.activeElement;

    const focusables = panel ? panel.querySelectorAll(FOCUSABLE) : [];
    if (focusables.length > 0) focusables[0].focus();
    else panel?.focus();

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current?.();
        return;
      }
      if (e.key !== "Tab" || !panel) return;
      const items = panel.querySelectorAll(FOCUSABLE);
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);

    if (process.env.NODE_ENV !== "production" && !labelledBy && !label) {
      console.warn("Modal: 請提供 labelledBy 或 label 以利讀屏");
    }

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
      if (typeof previouslyFocused?.focus === "function")
        previouslyFocused.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleBackdrop = (e) => {
    if (closeOnBackdrop && e.target === e.currentTarget) onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={handleBackdrop}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-label={label}
        tabIndex={-1}
        className={`relative bg-[var(--color-card-bg)] rounded-3xl w-full outline-none ${className}`}
      >
        {showClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="關閉"
            className="absolute -right-3 -top-3 flex h-9 w-9 items-center justify-center rounded-2xl border border-[var(--color-card-border)] bg-[var(--color-card-bg)] text-[var(--color-text-mid)] shadow-lg transition hover:text-[var(--color-text-dark)] hover:shadow-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-clay-purple)]/40"
          >
            <svg
              viewBox="0 0 24 24"
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        )}
        {children}
      </div>
    </div>
  );
}
