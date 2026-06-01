/** 首頁數字帶 — 接受 stats 陣列 [{value, label}]。 */
export default function MetricsBand({ stats }) {
  return (
    <div className="flex flex-wrap gap-5 justify-center">
      {stats.map((s) => (
        <div
          key={s.label}
          className="bg-white/85 dark:bg-gray-800/85 border-2 border-white/90 dark:border-white/10 backdrop-blur-sm rounded-2xl px-7 py-5 text-center shadow-[var(--shadow-clay)]"
        >
          <div className="text-3xl font-black text-[var(--color-text-dark)]">
            {s.value}
          </div>
          <div className="text-sm font-semibold text-[var(--color-text-mid)] mt-1">
            {s.label}
          </div>
        </div>
      ))}
    </div>
  );
}
