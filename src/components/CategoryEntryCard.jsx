import Link from "next/link";

/** 首頁 5 類別入口卡 — icon + 標題 + 數量 + 描述，點擊去 /hub?cat= */
export default function CategoryEntryCard({ category, count }) {
  return (
    <Link
      href={`/hub?cat=${category.key}`}
      className="group block bg-[var(--color-card-bg)] rounded-[24px] p-6 shadow-sm border border-[var(--color-card-border)] hover:shadow-lg hover:-translate-y-1 transition-all duration-300"
    >
      <div className="flex items-center gap-3 mb-2">
        <div className="w-12 h-12 rounded-2xl bg-[var(--color-clay-purple)]/10 flex items-center justify-center text-2xl">
          {category.emoji}
        </div>
        <div>
          <h3 className="font-extrabold text-lg text-[var(--color-text-dark)]">
            {category.label}
          </h3>
          <span className="text-xs font-bold text-[var(--color-text-mid)]">
            {count} 個項目
          </span>
        </div>
      </div>
      <p className="text-sm text-[var(--color-text-mid)] font-medium leading-snug">
        {category.desc}
      </p>
      <span className="inline-block mt-3 text-sm font-extrabold text-[var(--color-clay-purple)] group-hover:translate-x-1 transition-transform">
        瀏覽 →
      </span>
    </Link>
  );
}
