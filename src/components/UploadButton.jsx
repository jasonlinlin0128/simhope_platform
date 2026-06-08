"use client";

import { useRef, useState } from "react";
import { STORAGE_ENABLED, uploadToolFile } from "@/lib/storage";
import { useToast } from "@/components/Toast";

/**
 * 上傳按鈕 — 受 STORAGE_ENABLED feature flag 控制。
 * flag 關時不渲染任何東西（使用者只看到旁邊的貼 URL 欄位，行為不變）。
 * flag 開時顯示「📤 上傳」，選檔 → 上傳到 Firebase Storage → onUploaded(downloadUrl)。
 *
 * @param {{ pathPrefix: string, accept?: string, onUploaded: (url:string)=>void, label?: string }} props
 */
export default function UploadButton({
  pathPrefix,
  accept,
  onUploaded,
  label = "📤 上傳",
}) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  if (!STORAGE_ENABLED) return null;

  const handleChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const url = await uploadToolFile(file, pathPrefix);
      onUploaded(url);
    } catch (err) {
      console.error(err);
      toast.error("上傳失敗：" + err.message);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={handleChange}
        className="hidden"
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="px-3 py-2 rounded-lg bg-[var(--color-clay-purple)]/10 text-[var(--color-clay-purple)] font-bold text-xs border border-[var(--color-clay-purple)]/30 hover:bg-[var(--color-clay-purple)]/20 disabled:opacity-50 whitespace-nowrap"
      >
        {busy ? "上傳中…" : label}
      </button>
    </>
  );
}
