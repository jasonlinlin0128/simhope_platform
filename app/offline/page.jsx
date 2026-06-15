export const metadata = { title: "離線 · SimHope" };

// root layout 已有 <main>，這裡用 <div> 不巢狀。
export default function Offline() {
  return (
    <div className="flex flex-col items-center justify-center text-center px-6 py-24 min-h-[50vh]">
      <span className="text-6xl mb-4" aria-hidden="true">
        📡
      </span>
      <h1 className="text-3xl font-black text-[var(--color-text-dark)] mb-2">
        你目前離線
      </h1>
      <p className="text-[var(--color-text-mid)] font-semibold">
        連上網路後重新整理即可繼續使用 SimHope。
      </p>
    </div>
  );
}
