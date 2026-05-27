import Link from 'next/link';

// Helper color map for the icon background
const colorMap = {
    c1: 'bg-gradient-to-br from-blue-100 to-blue-200 text-blue-600',
    c2: 'bg-gradient-to-br from-red-100 to-red-200 text-red-600',
    c3: 'bg-gradient-to-br from-purple-100 to-purple-200 text-purple-600',
    c4: 'bg-gradient-to-br from-amber-100 to-amber-200 text-amber-600',
    c5: 'bg-gradient-to-br from-emerald-100 to-emerald-200 text-emerald-600',
    c6: 'bg-gradient-to-br from-pink-100 to-pink-200 text-pink-600',
};

/**
 * 把狀態代碼轉成顯示用的中文標籤跟對應的 Tailwind class。
 * @param {'live'|'beta'|'new'|'dev'|'pending'|'terminated'} status
 */
export const getStatusLabel = (status) => {
    const statuses = {
        live:       { label: '使用中', cls: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-200 dark:border-green-700' },
        beta:       { label: '測試中', cls: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-700' },
        new:        { label: '新上線', cls: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-700' },
        dev:        { label: '開發中', cls: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-600' },
        pending:    { label: '待驗收', cls: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-700' },
        terminated: { label: '已終止', cls: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-700' },
    };
    return statuses[status] || { label: status, cls: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600' };
};

/**
 * 各「類型」對應的小標籤（卡片左上角顯示）
 */
export const TYPE_BADGES = {
    webapp:   { label: '🌐 網頁應用',     cls: 'bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-700' },
    download: { label: '⬇️ 軟體下載',     cls: 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-700' },
    doc:      { label: '📄 文件 / 表單',  cls: 'bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-700' },
    mcp:      { label: '🔌 AI 連接器',     cls: 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-700' },
    api:      { label: '🧩 API / SDK',    cls: 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-700' },
    showcase: { label: '📺 展示',          cls: 'bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-600' },
};

/**
 * Vercel Marketplace 風的「一鍵動作」按鈕。依 type + status 決定文字、顏色、連結。
 * 回傳 { label, href, cls, disabled } 物件供卡片渲染用。
 * @param {{type:string, status:string, url:string, id:string}} tool
 */
export function getCTA(tool) {
    const { type = 'webapp', status, url, id } = tool;

    // 已終止：紅色，不能點
    if (status === 'terminated') {
        return { label: '⛔ 已終止維護', href: null, cls: 'bg-red-100 text-red-600 cursor-not-allowed', disabled: true };
    }
    // 開發中 / 待驗收：灰色，引導去詳情頁
    if (status === 'dev' || status === 'pending') {
        return { label: '🚧 開發中，敬請期待', href: `/tool/${id}`, cls: 'bg-gray-200 text-gray-500 hover:bg-gray-300', disabled: false };
    }

    // 正常狀態：依 type 給不同 CTA
    const ctaByType = {
        webapp:   { label: '🌐 馬上打開 →',             cls: 'bg-gradient-to-r from-purple-500 to-blue-500 text-white hover:opacity-90' },
        download: { label: '⬇️ 下載安裝檔 →',           cls: 'bg-blue-500 text-white hover:bg-blue-600' },
        doc:      { label: '⬇️ 下載 →',                cls: 'bg-orange-500 text-white hover:bg-orange-600' },
        mcp:      { label: '📦 安裝到 Claude / Cursor →', cls: 'bg-emerald-500 text-white hover:bg-emerald-600' },
        api:      { label: '🔗 看 API 文件 →',          cls: 'bg-amber-500 text-white hover:bg-amber-600' },
        showcase: { label: '👀 看詳情 →',               cls: 'bg-gray-500 text-white hover:bg-gray-600' },
    };
    const base = ctaByType[type] || ctaByType.webapp;

    // 沒有 url → 灰色降級為「看詳情」
    if (!url) {
        return { label: '👀 看詳情 →', href: `/tool/${id}`, cls: 'bg-gray-300 text-gray-700 hover:bg-gray-400', disabled: false };
    }
    return { ...base, href: url, external: type === 'webapp' || type === 'download' || type === 'doc' || type === 'api', disabled: false };
}

/**
 * 工具卡。Vercel Marketplace 風 — 卡片本體連到詳情頁；卡片底部「一鍵動作」按鈕依類型開外連或內頁。
 * @param {{ tool: { id, title, tagline, icon, color, dept, scenarios, status, type, url, updatedAt } }} props
 */
export default function ToolCard({ tool }) {
    const { id, title, tagline, icon, color, dept, scenarios, status, type = 'webapp', updatedAt } = tool;

    const scs = (scenarios && Array.isArray(scenarios)) ? scenarios : [(dept || 'other')];
    const iconClass = colorMap[color] || colorMap['c1'];
    const sObj = getStatusLabel(status);
    const typeBadge = TYPE_BADGES[type] || TYPE_BADGES.webapp;
    const cta = getCTA(tool);

    // CTA 點擊處理：阻止冒泡到卡片連結
    const handleCtaClick = (e) => {
        if (cta.disabled) {
            e.preventDefault();
        }
        // 不要 stopPropagation — 因為卡片本身用 <Link>，CTA 用 <a>，HTML 不允許 nested links，所以已分開
    };

    return (
        <div className="group block bg-[var(--color-card-bg)] rounded-[24px] shadow-sm border border-[var(--color-card-border)] hover:shadow-lg hover:-translate-y-1 transition-all duration-300 relative overflow-hidden flex flex-col">
            {/* 卡片內容區 — 點進去看詳情頁 */}
            <Link href={`/tool/${id}`} className="block p-5 flex-1 relative">
                {/* hover 微光 */}
                <div className="absolute inset-0 bg-gradient-to-br from-[var(--color-clay-purple)]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>

                <div className="flex items-center gap-4 mb-3 relative z-10">
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-3xl shadow-inner ${iconClass}`}>
                        {icon || '📦'}
                    </div>
                    <div className="flex-1 min-w-0">
                        <h3 className="font-extrabold text-[1.1rem] text-[var(--color-text-dark)] truncate">{title}</h3>
                        {/* 類型 badge */}
                        <span className={`inline-block mt-1 text-[0.65rem] px-2 py-0.5 rounded-md font-bold border ${typeBadge.cls}`}>
                            {typeBadge.label}
                        </span>
                    </div>
                </div>

                <p className="text-[0.9rem] text-[var(--color-text-mid)] font-medium leading-snug line-clamp-2 h-[2.5rem] mb-4 relative z-10">
                    {tagline || ''}
                </p>

                {/* 底部 meta — 場景標籤 + 狀態 badge + 更新日 */}
                <div className="flex items-center gap-2 text-[0.7rem] font-bold border-t border-gray-100/50 dark:border-gray-700/50 pt-3 relative z-10 flex-wrap">
                    {scs.slice(0, 2).map((s, idx) => (
                        <span key={idx} className="px-2 py-0.5 rounded-md bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 truncate border border-gray-200/60 dark:border-gray-600">
                            {s}
                        </span>
                    ))}
                    <span className={`px-2 py-0.5 rounded-md border ${sObj.cls}`}>
                        {sObj.label}
                    </span>
                    {updatedAt && (
                        <span className="ml-auto text-gray-400 dark:text-gray-500 font-medium tracking-tighter">
                            {new Date(typeof updatedAt === 'object' ? updatedAt.toDate() : updatedAt).toLocaleDateString()}
                        </span>
                    )}
                </div>
            </Link>

            {/* Vercel Marketplace 風一鍵動作按鈕 */}
            {cta.disabled ? (
                <div className={`block text-center py-3 font-extrabold text-sm ${cta.cls}`}>
                    {cta.label}
                </div>
            ) : cta.external ? (
                <a
                    href={cta.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={handleCtaClick}
                    className={`block text-center py-3 font-extrabold text-sm transition ${cta.cls}`}
                >
                    {cta.label}
                </a>
            ) : (
                <Link
                    href={cta.href}
                    onClick={handleCtaClick}
                    className={`block text-center py-3 font-extrabold text-sm transition ${cta.cls}`}
                >
                    {cta.label}
                </Link>
            )}
        </div>
    );
}
