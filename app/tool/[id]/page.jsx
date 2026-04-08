'use client';

import { useState, useEffect, use } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import AIPanel from '@/components/AIPanel';
import { getStatusLabel } from '@/components/ToolCard';

// ─── Block type definitions ────────────────────────────────────────────────
const BLOCK_DEFS = {
    text:    { label: '📝 文字段落',  badge: 'bg-gray-100 text-gray-600 border-gray-200' },
    steps:   { label: '📋 步驟清單',  badge: 'bg-purple-50 text-purple-700 border-purple-200' },
    image:   { label: '🖼️ 圖片',      badge: 'bg-blue-50 text-blue-600 border-blue-200' },
    video:   { label: '▶️ 影片',      badge: 'bg-red-50 text-red-600 border-red-200' },
    tip:     { label: '💡 提示框',    badge: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
    warning: { label: '⚠️ 注意事項',  badge: 'bg-orange-50 text-orange-700 border-orange-200' },
};

// ─── Simple markdown renderer (text blocks only) ───────────────────────────
function renderInline(text) {
    return text
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/`(.+?)`/g, '<code class="bg-gray-100 dark:bg-gray-700 px-1 py-0.5 rounded text-[0.85em]">$1</code>');
}

function renderMarkdown(text) {
    if (!text) return '';
    const lines = text.split('\n');
    const out = [];
    let inList = false;

    for (const line of lines) {
        if (/^## (.+)/.test(line)) {
            if (inList) { out.push('</ul>'); inList = false; }
            out.push(`<h2 class="text-xl font-black mt-6 mb-2 text-[var(--color-text-dark)]">${renderInline(line.slice(3))}</h2>`);
        } else if (/^### (.+)/.test(line)) {
            if (inList) { out.push('</ul>'); inList = false; }
            out.push(`<h3 class="text-lg font-extrabold mt-4 mb-1 text-[var(--color-text-dark)]">${renderInline(line.slice(4))}</h3>`);
        } else if (/^- (.+)/.test(line)) {
            if (!inList) { out.push('<ul class="list-disc ml-5 flex flex-col gap-1">'); inList = true; }
            out.push(`<li class="font-bold text-[var(--color-text-dark)]">${renderInline(line.slice(2))}</li>`);
        } else if (line.trim() === '') {
            if (inList) { out.push('</ul>'); inList = false; }
            out.push('<div class="h-2"></div>');
        } else {
            if (inList) { out.push('</ul>'); inList = false; }
            out.push(`<p class="font-bold text-[var(--color-text-dark)] leading-relaxed">${renderInline(line)}</p>`);
        }
    }
    if (inList) out.push('</ul>');
    return out.join('');
}

// ─── YouTube ID extractor ──────────────────────────────────────────────────
function getYouTubeId(url) {
    if (!url) return null;
    const m = url.match(/(?:youtu\.be\/|youtube\.com(?:\/embed\/|\/v\/|\/watch\?v=|\/watch\?.+&v=))([\w-]{11})/);
    return m ? m[1] : null;
}

// ─── View-mode block renderer ──────────────────────────────────────────────
function BlockView({ block }) {
    const { type, content, caption } = block;

    if (type === 'image') {
        if (!content) return null;
        return (
            <figure className="my-1">
                <img
                    src={content} alt={caption || ''}
                    className="w-full rounded-2xl border border-[var(--color-card-border)] shadow-sm object-contain max-h-[500px]"
                    onError={e => { e.target.style.display = 'none'; }}
                />
                {caption && <figcaption className="text-center text-sm text-[var(--color-text-mid)] font-bold mt-2">{caption}</figcaption>}
            </figure>
        );
    }

    if (type === 'video') {
        const vid = getYouTubeId(content);
        if (!vid) return <p className="text-[var(--color-text-mid)] text-sm font-bold italic">（影片連結無效，請確認 YouTube URL）</p>;
        return (
            <div className="relative w-full rounded-2xl overflow-hidden shadow-sm" style={{ paddingTop: '56.25%' }}>
                <iframe
                    className="absolute inset-0 w-full h-full"
                    src={`https://www.youtube.com/embed/${vid}`}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                />
            </div>
        );
    }

    if (type === 'tip') {
        return (
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-2xl p-5 flex gap-3">
                <span className="text-xl flex-shrink-0">💡</span>
                <div className="text-sm font-bold text-yellow-900 dark:text-yellow-200 whitespace-pre-wrap leading-relaxed">{content}</div>
            </div>
        );
    }

    if (type === 'warning') {
        return (
            <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700 rounded-2xl p-5 flex gap-3">
                <span className="text-xl flex-shrink-0">⚠️</span>
                <div className="text-sm font-bold text-orange-900 dark:text-orange-200 whitespace-pre-wrap leading-relaxed">{content}</div>
            </div>
        );
    }

    if (type === 'steps') {
        const lines = (content || '').split('\n').filter(Boolean);
        return (
            <ol className="flex flex-col gap-3">
                {lines.map((line, i) => (
                    <li key={i} className="flex gap-3 items-start">
                        <span className="flex-shrink-0 w-7 h-7 rounded-full bg-[var(--color-clay-purple)] text-white text-sm font-black flex items-center justify-center mt-0.5">{i + 1}</span>
                        <span className="font-bold text-[var(--color-text-dark)] leading-relaxed pt-0.5">{line}</span>
                    </li>
                ))}
            </ol>
        );
    }

    // Default: text with markdown
    return (
        <div
            className="flex flex-col gap-1"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
        />
    );
}

// ─── Edit-mode block editor ────────────────────────────────────────────────
function BlockEditor({ block, idx, total, onChange, onDelete, onMove }) {
    const def = BLOCK_DEFS[block.type] || BLOCK_DEFS.text;
    const vid = block.type === 'video' ? getYouTubeId(block.content) : null;

    return (
        <div className="border-2 border-dashed border-[var(--color-clay-purple)]/40 rounded-2xl p-4 flex flex-col gap-3">
            {/* Header: type selector + controls */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
                <select
                    value={block.type}
                    onChange={e => onChange({ ...block, type: e.target.value })}
                    className={`text-xs font-bold border rounded-full px-3 py-1 outline-none cursor-pointer ${def.badge}`}
                    style={{ backgroundColor: 'transparent' }}
                >
                    {Object.entries(BLOCK_DEFS).map(([key, val]) => (
                        <option key={key} value={key} className="text-gray-800 bg-white">{val.label}</option>
                    ))}
                </select>
                <div className="flex gap-1">
                    <button
                        onClick={() => onMove(idx, -1)} disabled={idx === 0}
                        className="w-7 h-7 rounded-lg bg-gray-100 text-gray-500 hover:bg-gray-200 disabled:opacity-25 text-sm transition-all"
                        title="上移"
                    >↑</button>
                    <button
                        onClick={() => onMove(idx, 1)} disabled={idx === total - 1}
                        className="w-7 h-7 rounded-lg bg-gray-100 text-gray-500 hover:bg-gray-200 disabled:opacity-25 text-sm transition-all"
                        title="下移"
                    >↓</button>
                    <button
                        onClick={onDelete}
                        className="w-7 h-7 rounded-lg bg-red-50 text-red-400 hover:bg-red-100 text-sm transition-all"
                        title="刪除此 block"
                    >✕</button>
                </div>
            </div>

            {/* Content input: varies by type */}
            {block.type === 'image' && (
                <div className="flex flex-col gap-2">
                    <input
                        value={block.content || ''}
                        onChange={e => onChange({ ...block, content: e.target.value })}
                        placeholder="貼上圖片 URL（https://...）"
                        className="w-full bg-[var(--color-card-bg)] text-[var(--color-text-dark)] border border-[var(--color-card-border)] rounded-xl px-3 py-2 text-sm outline-none focus:border-[var(--color-clay-purple)]"
                    />
                    <input
                        value={block.caption || ''}
                        onChange={e => onChange({ ...block, caption: e.target.value })}
                        placeholder="圖片說明文字（選填）"
                        className="w-full bg-[var(--color-card-bg)] text-[var(--color-text-mid)] border border-[var(--color-card-border)] rounded-xl px-3 py-2 text-sm outline-none focus:border-[var(--color-clay-purple)]"
                    />
                    {block.content && (
                        <img
                            src={block.content} alt=""
                            className="w-full rounded-xl border border-[var(--color-card-border)] max-h-48 object-contain mt-1"
                            onError={e => { e.target.style.display = 'none'; }}
                        />
                    )}
                </div>
            )}

            {block.type === 'video' && (
                <div className="flex flex-col gap-2">
                    <input
                        value={block.content || ''}
                        onChange={e => onChange({ ...block, content: e.target.value })}
                        placeholder="貼上 YouTube 連結（https://youtube.com/watch?v=...）"
                        className="w-full bg-[var(--color-card-bg)] text-[var(--color-text-dark)] border border-[var(--color-card-border)] rounded-xl px-3 py-2 text-sm outline-none focus:border-[var(--color-clay-purple)]"
                    />
                    {vid && (
                        <div className="relative w-full rounded-xl overflow-hidden" style={{ paddingTop: '40%' }}>
                            <iframe
                                className="absolute inset-0 w-full h-full"
                                src={`https://www.youtube.com/embed/${vid}`}
                                allowFullScreen
                            />
                        </div>
                    )}
                    {block.content && !vid && (
                        <p className="text-xs text-red-500 font-bold">⚠️ 無法辨識 YouTube 連結，請確認格式</p>
                    )}
                </div>
            )}

            {block.type === 'steps' && (
                <div className="flex flex-col gap-1">
                    <p className="text-xs font-bold text-[var(--color-text-mid)]">每行一個步驟，會自動加上圓形編號</p>
                    <textarea
                        value={block.content || ''}
                        onChange={e => onChange({ ...block, content: e.target.value })}
                        placeholder={'打開工具\n選擇目標檔案\n點擊「執行」按鈕\n完成！'}
                        rows={4}
                        className="w-full bg-[var(--color-card-bg)] text-[var(--color-text-dark)] border border-[var(--color-card-border)] rounded-xl px-3 py-2 text-sm outline-none focus:border-[var(--color-clay-purple)] resize-y"
                    />
                </div>
            )}

            {(block.type === 'text' || block.type === 'tip' || block.type === 'warning') && (
                <div className="flex flex-col gap-1">
                    {block.type === 'text' && (
                        <p className="text-xs font-bold text-[var(--color-text-mid)]">支援 **粗體**、*斜體*、## 標題、- 清單、`程式碼`</p>
                    )}
                    <textarea
                        value={block.content || ''}
                        onChange={e => onChange({ ...block, content: e.target.value })}
                        placeholder={
                            block.type === 'tip' ? '輸入提示內容...' :
                            block.type === 'warning' ? '輸入注意事項...' :
                            '輸入說明文字...'
                        }
                        rows={block.type === 'text' ? 5 : 3}
                        className="w-full bg-[var(--color-card-bg)] text-[var(--color-text-dark)] border border-[var(--color-card-border)] rounded-xl px-3 py-2 text-sm outline-none focus:border-[var(--color-clay-purple)] resize-y"
                    />
                </div>
            )}
        </div>
    );
}

// ─── Main page component ───────────────────────────────────────────────────
export default function ToolDetail({ params }) {
    const { id } = use(params);
    const { user, isAdmin, loading: authLoading } = useAuth();
    const router = useRouter();

    const [tool, setTool] = useState(null);
    const [loading, setLoading] = useState(true);
    const [isEditMode, setIsEditMode] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    const [localBlocks, setLocalBlocks] = useState([]);
    const [localExtras, setLocalExtras] = useState({ url: '', type: 'webapp' });

    useEffect(() => {
        if (!authLoading) fetchTool();
    }, [id, authLoading]);

    const fetchTool = async () => {
        try {
            const docSnap = await getDoc(doc(db, 'tools', id));
            if (!docSnap.exists()) { router.push('/'); return; }
            const data = docSnap.data();
            const isPublic = ['live', 'beta', 'new'].includes(data.status) || data.approval === 'approved';
            const isOwner = user && data.authorUid === user.uid;
            if (!isPublic && !isOwner && !isAdmin) { router.push('/'); return; }
            setTool(data);
            setLocalBlocks(data.blog?.blocks || []);
            setLocalExtras({ url: data.url || '', type: data.type || 'webapp' });
        } catch (e) { console.error(e); }
        setLoading(false);
    };

    const isAuthor = tool && user && tool.authorUid === user.uid;
    const canEdit = isAdmin || isAuthor;

    // ── Block operations ──
    const updateBlock = (idx, updated) => setLocalBlocks(bs => bs.map((b, i) => i === idx ? updated : b));
    const deleteBlock = (idx) => setLocalBlocks(bs => bs.filter((_, i) => i !== idx));
    const moveBlock = (idx, dir) => {
        const bs = [...localBlocks];
        const target = idx + dir;
        if (target < 0 || target >= bs.length) return;
        [bs[idx], bs[target]] = [bs[target], bs[idx]];
        setLocalBlocks(bs);
    };
    const addBlock = (type) => setLocalBlocks(bs => [...bs, { type, content: '', caption: '' }]);

    // ── Save ──
    const handleSave = async () => {
        if (!canEdit) return;
        setIsSaving(true);
        try {
            await updateDoc(doc(db, 'tools', id), {
                blog: { ...tool.blog, blocks: localBlocks },
                url: localExtras.url,
                type: localExtras.type,
                updatedAt: new Date()
            });
            alert('儲存成功！');
            setIsEditMode(false);
            fetchTool();
        } catch (error) {
            console.error(error);
            alert('儲存失敗：' + (error.code === 'permission-denied' ? '你沒有權限編輯此工具' : error.message));
        }
        setIsSaving(false);
    };

    if (loading || authLoading) return <p className="text-center py-20 text-[var(--color-text-mid)]">載入中...</p>;
    if (!tool) return null;

    return (
        <div>
            {/* ── Edit topbar ── */}
            {canEdit && (
                <div className="bg-[var(--color-clay-purple)]/10 border border-[var(--color-clay-purple)]/20 p-4 rounded-2xl mb-8 flex justify-between items-center flex-wrap gap-3">
                    <div>
                        <span className="font-extrabold text-[var(--color-clay-purple)] flex items-center gap-2">
                            <span className="text-xl">🛠️</span> 編輯模式（你是{isAdmin ? '管理員' : '作者'}）
                        </span>
                        <p className="text-sm font-bold text-[var(--color-text-mid)] mt-0.5">可新增圖片、影片、步驟清單等 block，儲存後立即生效。</p>
                    </div>
                    <div className="flex gap-3">
                        {!isEditMode ? (
                            <button onClick={() => setIsEditMode(true)} className="px-5 py-2.5 rounded-full bg-[var(--color-card-bg)] font-extrabold text-[var(--color-clay-purple)] shadow-sm border border-[var(--color-clay-purple)] hover:shadow-md transition-all">
                                ✏️ 進入編輯
                            </button>
                        ) : (
                            <>
                                <button onClick={() => { setIsEditMode(false); setLocalBlocks(tool.blog?.blocks || []); }} className="px-5 py-2.5 rounded-full bg-[var(--color-card-bg)] font-extrabold text-[var(--color-text-mid)] border border-[var(--color-card-border)] transition-all">
                                    取消
                                </button>
                                <button onClick={handleSave} disabled={isSaving} className="px-5 py-2.5 rounded-full bg-[var(--color-clay-purple)] text-white font-extrabold shadow-md hover:shadow-lg disabled:opacity-60 transition-all">
                                    {isSaving ? '儲存中...' : '💾 儲存變更'}
                                </button>
                            </>
                        )}
                    </div>
                </div>
            )}

            <div className="flex flex-col lg:flex-row gap-8">
                {/* ── SIDEBAR ── */}
                <aside className="lg:w-80 flex-shrink-0 bg-[var(--color-card-bg)] rounded-[32px] p-8 shadow-sm border border-[var(--color-card-border)] h-fit sticky top-24">
                    <div className="text-center mb-6">
                        <div className="w-20 h-20 mx-auto rounded-[24px] bg-gradient-to-br from-blue-100 to-blue-200 flex items-center justify-center text-4xl shadow-inner mb-4">
                            {tool.icon || '📦'}
                        </div>
                        <h1 className="text-2xl font-black text-[var(--color-text-dark)]">{tool.title}</h1>
                        <p className="text-[var(--color-text-mid)] font-bold mt-2 text-sm">{tool.tagline}</p>
                    </div>

                    <div className="flex justify-center mb-6">
                        <span className={`px-4 py-1.5 rounded-lg border text-sm font-bold ${getStatusLabel(tool.status).cls}`}>
                            {getStatusLabel(tool.status).label}
                        </span>
                    </div>

                    {isEditMode ? (
                        <div className="bg-[var(--color-card-bg)] rounded-2xl p-5 border border-[var(--color-card-border)] mt-4 flex flex-col gap-4">
                            <h4 className="font-extrabold text-[0.8rem] text-[var(--color-text-mid)] uppercase tracking-widest">🛠️ 連結與平台類型</h4>
                            <div className="flex flex-col gap-2">
                                {[['webapp', '🌐 網頁版'], ['download', '⬇️ 下載版 (.exe)']].map(([val, lbl]) => (
                                    <label key={val} className="flex items-center gap-2 text-sm font-bold text-[var(--color-text-dark)] cursor-pointer">
                                        <input type="radio" value={val} checked={localExtras.type === val} onChange={e => setLocalExtras({ ...localExtras, type: e.target.value })} />
                                        {lbl}
                                    </label>
                                ))}
                            </div>
                            <input
                                value={localExtras.url}
                                onChange={e => setLocalExtras({ ...localExtras, url: e.target.value })}
                                placeholder={localExtras.type === 'webapp' ? 'https://...' : 'Google Drive 共享連結'}
                                className="w-full bg-[var(--color-card-bg)] text-[var(--color-text-dark)] border border-[var(--color-card-border)] rounded-lg p-2 text-sm outline-none focus:border-[var(--color-clay-purple)]"
                            />
                        </div>
                    ) : (() => {
                        const url = tool.type === 'download'
                            ? (tool.url || tool.versions?.at(-1)?.fileUrl || '')
                            : tool.url;
                        if (!url) return null;
                        return (
                            <div className="mt-6 pt-6 border-t border-[var(--color-card-border)] flex justify-center">
                                <a
                                    href={url} target="_blank" rel="noopener noreferrer"
                                    className={`w-full text-center px-6 py-4 rounded-xl font-extrabold shadow-md hover:shadow-lg transition-all ${
                                        tool.type === 'download'
                                            ? 'bg-blue-50 text-blue-600 border border-blue-200'
                                            : 'text-white bg-gradient-to-r from-[var(--color-clay-purple)] to-[var(--color-clay-blue)]'
                                    }`}
                                >
                                    {tool.type === 'download' ? '⬇️ 點此下載軟體' : '🌐 前往網頁工具'}
                                </a>
                            </div>
                        );
                    })()}
                </aside>

                {/* ── MAIN CONTENT ── */}
                <main className="flex-1 bg-[var(--color-card-bg)] rounded-[32px] p-8 md:p-12 shadow-sm border border-[var(--color-card-border)] min-w-0">
                    <h2 className="text-2xl font-black text-[var(--color-text-dark)] mb-8 flex items-center gap-3 border-b-2 border-[var(--color-card-border)] pb-4">
                        <span className="text-[var(--color-clay-purple)]">📄</span> 工具說明書
                    </h2>

                    <div className="flex flex-col gap-6">
                        {isEditMode ? (
                            <>
                                {localBlocks.length === 0 && (
                                    <div className="text-center py-10 border-2 border-dashed border-[var(--color-clay-purple)]/30 rounded-2xl text-[var(--color-text-mid)]">
                                        <p className="font-bold text-lg mb-1">說明書還是空的</p>
                                        <p className="text-sm font-bold">用下方按鈕新增第一個 block</p>
                                    </div>
                                )}

                                {localBlocks.map((block, idx) => (
                                    <BlockEditor
                                        key={idx}
                                        block={block}
                                        idx={idx}
                                        total={localBlocks.length}
                                        onChange={(updated) => updateBlock(idx, updated)}
                                        onDelete={() => deleteBlock(idx)}
                                        onMove={moveBlock}
                                    />
                                ))}

                                {/* Add block controls */}
                                <div className="flex flex-wrap gap-2 pt-2 border-t-2 border-dashed border-[var(--color-clay-purple)]/20">
                                    <p className="w-full text-xs font-bold text-[var(--color-text-mid)] mb-1">＋ 新增 Block：</p>
                                    {Object.entries(BLOCK_DEFS).map(([key, def]) => (
                                        <button
                                            key={key}
                                            onClick={() => addBlock(key)}
                                            className={`text-xs font-bold border rounded-full px-3 py-1.5 hover:opacity-80 transition-all ${def.badge}`}
                                        >
                                            {def.label}
                                        </button>
                                    ))}
                                </div>
                            </>
                        ) : localBlocks.length > 0 ? (
                            localBlocks.map((block, idx) => (
                                <BlockView key={idx} block={block} />
                            ))
                        ) : (
                            <p className="whitespace-pre-wrap leading-relaxed font-bold text-[var(--color-text-dark)]">
                                {tool.blog?.summary || tool.desc || ''}
                            </p>
                        )}
                    </div>
                </main>
            </div>
        </div>
    );
}
