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
              <div className="px-5 pb-4 pt-1 border-t border-[var(--color-card-border)]">
                <MarkdownContent>{item.a || ""}</MarkdownContent>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
