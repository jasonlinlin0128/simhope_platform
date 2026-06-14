"use client";

import { useEffect } from "react";
import Link from "next/link";

/**
 * 路由層 error boundary：server/client component 拋未捕捉錯誤時，顯示友善畫面 + 重試，
 * 取代 Next 預設的整頁崩潰。root layout 已提供 <main>，這裡用 <div>。
 * @param {{ error: Error, reset: () => void }} props
 */
export default function Error({ error, reset }) {
  useEffect(() => {
    console.error("[app/error]", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center text-center px-6 py-24 min-h-[50vh]">
      <span className="text-6xl mb-4" aria-hidden="true">
        😵
      </span>
      <h1 className="text-3xl font-black text-[var(--color-text-dark)] mb-2">
        這個頁面出了點狀況
      </h1>
      <p className="text-[var(--color-text-mid)] font-semibold mb-6">
        暫時載入失敗，請重試；若持續發生，請回首頁或聯絡經企室。
      </p>
      <div className="flex gap-3">
        <button
          onClick={() => reset()}
          className="px-5 py-2.5 rounded-full bg-[var(--color-clay-purple)] text-white font-extrabold text-sm hover:opacity-90 transition"
        >
          重新嘗試
        </button>
        <Link
          href="/"
          className="px-5 py-2.5 rounded-full border-2 border-[var(--color-card-border)] text-[var(--color-text-dark)] font-extrabold text-sm hover:border-[var(--color-clay-purple)] transition"
        >
          回首頁
        </Link>
      </div>
    </div>
  );
}
