"use client";

import { useState, useEffect, useMemo } from "react";
import { getFaqs } from "@/lib/db";
import { FAQ_CATEGORIES } from "@/lib/faq";
import Accordion from "@/components/Accordion";

export default function FaqPage() {
  const [faqs, setFaqs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getFaqs()
      .then(setFaqs)
      .catch((e) => console.error("載入 FAQ 失敗:", e))
      .finally(() => setLoading(false));
  }, []);

  const grouped = useMemo(() => {
    const m = {};
    for (const c of FAQ_CATEGORIES) {
      const items = faqs
        .filter((f) => f.category === c.key)
        .map((f) => ({ q: f.question, a: f.answer }));
      if (items.length) m[c.key] = items;
    }
    return m;
  }, [faqs]);

  const activeCats = FAQ_CATEGORIES.filter((c) => grouped[c.key]);

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-0 py-10">
      <header className="text-center mb-8">
        <h1 className="text-4xl md:text-5xl font-black text-[var(--color-text-dark)] mb-3">
          常見問題
        </h1>
        <p className="text-[var(--color-text-mid)] font-semibold">
          找不到答案？到取用說明的「提需求」聯絡我們。
        </p>
      </header>

      {/* 分類 chip 跳轉 */}
      {activeCats.length > 0 && (
        <nav className="sticky top-20 z-10 flex flex-wrap gap-2 justify-center mb-8 py-2 bg-[var(--color-bg)]/80 backdrop-blur-sm">
          {activeCats.map((c) => (
            <a
              key={c.key}
              href={`#${c.key}`}
              className="text-xs font-extrabold px-3 py-1.5 rounded-full bg-[var(--color-card-bg)] border border-[var(--color-card-border)] hover:border-[var(--color-clay-purple)] transition"
            >
              {c.emoji} {c.label}
            </a>
          ))}
        </nav>
      )}

      {loading ? (
        <p className="text-center py-16 text-[var(--color-text-mid)]">
          載入中…
        </p>
      ) : activeCats.length === 0 ? (
        <p className="text-center py-16 text-[var(--color-text-mid)]">
          目前還沒有常見問題。
        </p>
      ) : (
        <div className="flex flex-col gap-10">
          {activeCats.map((c) => (
            <section key={c.key} id={c.key} className="scroll-mt-32">
              <h2 className="text-xl font-black text-[var(--color-text-dark)] mb-4">
                {c.emoji} {c.label}
              </h2>
              <Accordion items={grouped[c.key]} />
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
