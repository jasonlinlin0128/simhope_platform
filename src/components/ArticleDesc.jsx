"use client";

import { splitMarkdownSections } from "@/lib/article";
import MarkdownContent from "@/components/MarkdownContent";

/**
 * desc 文章式呈現：lead 導言 + 依 ## 細線分隔的編號段落（容器 B）。
 * 無 ## 的短文案 → 只渲染 lead（單段文章 body）。
 * @param {{ desc: string }} props
 */
export default function ArticleDesc({ desc }) {
  if (!desc) return null;
  const { lead, sections } = splitMarkdownSections(desc);

  return (
    <div className="flex flex-col max-w-none">
      {lead && (
        <div className="[&_p]:text-[1.08rem] [&_p]:leading-[1.9] [&_p]:text-[var(--color-text-mid)] mb-2">
          <MarkdownContent>{lead}</MarkdownContent>
        </div>
      )}
      {sections.map((s, i) => (
        <section
          key={i}
          className={`py-6 ${
            i > 0 || lead ? "border-t border-[var(--color-card-border)]" : ""
          }`}
        >
          <div className="text-xs font-extrabold tracking-[0.14em] text-[var(--color-clay-purple)] mb-1">
            {String(i + 1).padStart(2, "0")}
          </div>
          <h3 className="text-lg font-extrabold text-[var(--color-text-dark)] mb-3">
            {s.heading}
          </h3>
          {s.body && <MarkdownContent>{s.body}</MarkdownContent>}
        </section>
      ))}
    </div>
  );
}
