"use client";

import { useState } from "react";
import MarkdownContent from "@/components/MarkdownContent";

function Section({ heading, items }) {
  return (
    <div className="mt-2">
      <p className="text-xs font-extrabold text-[var(--color-text-mid)] uppercase tracking-wider mb-1">
        {heading}
      </p>
      <MarkdownContent>
        {items.map((it) => `- ${it}`).join("\n")}
      </MarkdownContent>
    </div>
  );
}

function VersionCard({ v }) {
  const [showTech, setShowTech] = useState(false);
  return (
    <div className="relative pl-8 pb-8">
      {/* rail dot */}
      <span className="absolute left-0 top-1.5 w-3 h-3 rounded-full bg-[var(--color-clay-purple)] ring-4 ring-[var(--color-clay-purple)]/15" />
      <div className="flex items-baseline gap-3 flex-wrap mb-1">
        <span className="font-extrabold text-lg text-[var(--color-text-dark)]">
          v{v.version}
        </span>
        <span className="text-sm font-bold text-[var(--color-text-mid)]">
          {v.date}
        </span>
      </div>
      {v.summary && (
        <p className="text-[var(--color-text-mid)] font-normal leading-relaxed">
          {v.summary}
        </p>
      )}
      {v.userSections.map((s) => (
        <Section key={s.heading} heading={s.heading} items={s.items} />
      ))}
      {v.techSections.length > 0 && (
        <>
          <button
            onClick={() => setShowTech((x) => !x)}
            className="mt-3 text-xs font-extrabold text-[var(--color-clay-purple)] hover:opacity-80"
          >
            {showTech ? "▾ 收起技術細節" : "▸ 技術細節"}
          </button>
          {showTech &&
            v.techSections.map((s) => (
              <Section key={s.heading} heading={s.heading} items={s.items} />
            ))}
        </>
      )}
    </div>
  );
}

/** 左側時間軸。versions 由 server component 解析後傳入。 */
export default function ChangelogTimeline({ versions }) {
  return (
    <div className="relative border-l-2 border-[var(--color-clay-purple)]/25 ml-1.5">
      {versions.map((v) => (
        <VersionCard key={v.version} v={v} />
      ))}
    </div>
  );
}
