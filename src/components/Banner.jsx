"use client";
import Link from "next/link";

/**
 * 公告條 — variant: 'changelog'（最新更新）。內部站非必要，預設 show=false 可關。
 * 之後要顯示就在 layout 設 <Banner show variant="changelog" text="..." href="/changelog" />。
 */
export default function Banner({
  show = false,
  text = "",
  href,
  variant = "changelog",
}) {
  if (!show || !text) return null;
  const icon = variant === "maintenance" ? "🛠️" : "📌";
  return (
    <div className="w-full bg-[var(--color-clay-purple)]/10 border-b border-[var(--color-clay-purple)]/20 text-center text-sm font-bold text-[var(--color-text-dark)] py-2 px-4">
      <span className="mr-1">{icon}</span>
      {text}
      {href && (
        <Link
          href={href}
          className="ml-2 text-[var(--color-clay-purple)] underline hover:opacity-80"
        >
          查看 →
        </Link>
      )}
    </div>
  );
}
