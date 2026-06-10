"use client";

import { useState } from "react";
import MarkdownContent from "@/components/MarkdownContent";

/**
 * 共用 accordion — /faq 頁與工具詳情頁的 faq block 都用這顆。
 * @param {{ items: {q: string, a: string}[] }} props  a 支援 markdown
 */
export default function Accordion({ items = [] }) {
  const [openIdx, setOpenIdx] = useState(null);
  if (!items.length) return null;
  return (
    <div className="flex flex-col gap-2">
      {items.map((item, i) => {
        const open = openIdx === i;
        return (
          <div
            key={i}
            className="border border-[var(--color-card-border)] rounded-2xl bg-[var(--color-card-bg)] overflow-hidden"
          >
            <button
              onClick={() => setOpenIdx(open ? null : i)}
              className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left font-extrabold text-[var(--color-text-dark)] hover:bg-[var(--color-clay-purple)]/5 transition-colors"
              aria-expanded={open}
            >
              <span>{item.q}</span>
              <span
                className={`flex-shrink-0 text-[var(--color-clay-purple)] transition-transform ${open ? "rotate-90" : ""}`}
              >
                ▸
              </span>
            </button>
            {open && (
              /* Q&A 內文走 /docs、/changelog 的閱讀風格（text-mid + leading-relaxed），
                 蓋掉 MarkdownContent 的文章級樣式（那套是詳情頁長文用的，對 accordion 太大太鬆） */
              <div className="px-5 pb-4 pt-2 border-t border-[var(--color-card-border)] [&_p]:text-[var(--color-text-mid)] [&_p]:text-base [&_p]:leading-relaxed [&_p]:mb-3 [&_p:last-child]:mb-0 [&_li]:text-[var(--color-text-mid)] [&_li]:text-base [&_li]:leading-relaxed [&_ul]:my-2 [&_ul:last-child]:mb-0 [&_ol]:my-2 [&_ol:last-child]:mb-0 [&_strong]:text-inherit">
                <MarkdownContent>{item.a || ""}</MarkdownContent>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
