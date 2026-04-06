import Link from 'next/link';

// Helper color map for the icons
const colorMap = {
    c1: 'bg-gradient-to-br from-blue-100 to-blue-200 text-blue-600',
    c2: 'bg-gradient-to-br from-red-100 to-red-200 text-red-600',
    c3: 'bg-gradient-to-br from-purple-100 to-purple-200 text-purple-600',
    c4: 'bg-gradient-to-br from-amber-100 to-amber-200 text-amber-600',
    c5: 'bg-gradient-to-br from-emerald-100 to-emerald-200 text-emerald-600',
    c6: 'bg-gradient-to-br from-pink-100 to-pink-200 text-pink-600',
};

// Map status labels & classes
export const getStatusLabel = (status) => {
    const statuses = {
        live: { label: '使用中', cls: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-200 dark:border-green-700' },
        beta: { label: '測試中', cls: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-700' },
        new: { label: '新上線', cls: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-700' },
        dev: { label: '開發中', cls: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-600' },
        pending: { label: '待驗收', cls: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-700' },
        terminated: { label: '已終止', cls: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-700' },
    };
    return statuses[status] || { label: status, cls: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600' };
};

export default function ToolCard({ tool }) {
    const { id, title, tagline, icon, color, dept, scenarios, status, type, updatedAt } = tool;
    
    // Tag generation logic based on scenario mapping
    const scs = (scenarios && Array.isArray(scenarios)) ? scenarios : [(dept || 'other')];
    
    // Select styling for icon box
    const iconClass = colorMap[color] || colorMap['c1'];
    const sObj = getStatusLabel(status);

    return (
        <Link href={`/tool/${id}`} className="group block bg-[var(--color-card-bg)] rounded-[24px] p-5 shadow-sm border border-[var(--color-card-border)] hover:shadow-lg hover:-translate-y-1 transition-all duration-300 relative overflow-hidden">
            {/* Soft backdrop glow effect on hover */}
            <div className="absolute inset-0 bg-gradient-to-br from-[var(--color-clay-purple)]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
            
            <div className="flex items-center gap-4 mb-3 relative z-10">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-3xl shadow-inner ${iconClass}`}>
                    {icon || '📦'}
                </div>
                <div className="flex-1 min-w-0">
                    <h3 className="font-extrabold text-[1.1rem] text-[var(--color-text-dark)] truncate">{title}</h3>
                    <div className="flex flex-wrap gap-1 mt-1">
                        {scs.slice(0, 2).map((s, idx) => (
                            <span key={idx} className="text-[0.65rem] px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-semibold truncate border border-gray-200/60 dark:border-gray-600">
                                {s}
                            </span>
                        ))}
                    </div>
                </div>
            </div>
            
            <p className="text-[0.9rem] text-[var(--color-text-mid)] font-medium leading-snug line-clamp-2 h-[2.5rem] mb-4 relative z-10">
                {tagline || ''}
            </p>
            
            <div className="flex items-center gap-2 mt-auto text-[0.7rem] font-bold border-t border-gray-100/50 pt-3 relative z-10">
                <span className={`px-2 py-0.5 rounded-md border ${sObj.cls}`}>
                    {sObj.label}
                </span>
                
                {type === 'download' && <span className="bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 px-2 py-0.5 border border-blue-100 dark:border-blue-700 rounded-md" title="需下載至電腦">⬇️ 下載版</span>}
                {type === 'webapp' && <span className="bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-300 px-2 py-0.5 border border-purple-100 dark:border-purple-700 rounded-md" title="可直接在網頁開啟">🌐 網頁版</span>}
                {type === 'showcase' && <span className="bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-300 px-2 py-0.5 border border-amber-100 dark:border-amber-700 rounded-md" title="功能展示/報表">📺 展示</span>}
                
                {updatedAt && (
                    <span className="ml-auto text-gray-400 dark:text-gray-500 font-medium tracking-tighter">
                        {new Date(typeof updatedAt === 'object' ? updatedAt.toDate() : updatedAt).toLocaleDateString()}
                    </span>
                )}
            </div>
        </Link>
    );
}
