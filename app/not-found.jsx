import Link from "next/link";

export const metadata = { title: "找不到頁面 · SimHope AI 工具中心" };

/**
 * 全站 404（未匹配路由 / notFound()）。
 * 注意：root layout 已把 children 包在 <main id="main"> 內，這裡用 <div> 不再巢狀 main。
 */
export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center text-center px-6 py-24 min-h-[50vh]">
      <span className="text-6xl mb-4" aria-hidden="true">
        🧭
      </span>
      <h1 className="text-3xl font-black text-[var(--color-text-dark)] mb-2">
        找不到這個頁面
      </h1>
      <p className="text-[var(--color-text-mid)] font-semibold mb-6">
        這個連結可能已失效，或頁面搬家了。
      </p>
      <Link
        href="/"
        className="px-5 py-2.5 rounded-full bg-[var(--color-clay-purple)] text-white font-extrabold text-sm hover:opacity-90 transition"
      >
        回首頁
      </Link>
    </div>
  );
}
