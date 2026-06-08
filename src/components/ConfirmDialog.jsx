"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
} from "react";
import Modal from "@/components/Modal";
import { MUTED_BTN } from "@/lib/uiClasses";

const ConfirmCtx = createContext(null);

export function useConfirm() {
  const ctx = useContext(ConfirmCtx);
  if (!ctx) throw new Error("useConfirm 必須在 <ConfirmProvider> 內使用");
  return ctx;
}

export function ConfirmProvider({ children }) {
  const [opts, setOpts] = useState(null);
  const resolveRef = useRef(null);

  const confirm = useCallback((options) => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setOpts({
        title: "確認",
        confirmText: "確定",
        cancelText: "取消",
        danger: false,
        ...options,
      });
    });
  }, []);

  const finish = useCallback((result) => {
    resolveRef.current?.(result);
    resolveRef.current = null;
    setOpts(null);
  }, []);

  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      {opts && (
        <Modal
          onClose={() => finish(false)}
          labelledBy="confirm-title"
          showClose={false}
          className="max-w-sm p-6 flex flex-col gap-4 shadow-2xl border border-[var(--color-card-border)]"
        >
          <h3
            id="confirm-title"
            className="font-black text-lg text-[var(--color-text-dark)]"
          >
            {opts.title}
          </h3>
          <p className="text-sm font-semibold text-[var(--color-text-mid)] whitespace-pre-wrap leading-relaxed">
            {opts.message}
          </p>
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => finish(false)}
              className={`${MUTED_BTN} px-4 py-2 rounded-xl font-bold text-sm`}
            >
              {opts.cancelText}
            </button>
            <button
              type="button"
              onClick={() => finish(true)}
              className={`px-4 py-2 rounded-xl font-extrabold text-sm text-white ${opts.danger ? "bg-red-500 hover:bg-red-600" : "bg-[var(--color-clay-purple)] hover:opacity-90"}`}
            >
              {opts.confirmText}
            </button>
          </div>
        </Modal>
      )}
    </ConfirmCtx.Provider>
  );
}
