'use client';

import { useState, useEffect, use } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import AIPanel from '@/components/AIPanel';
import { getStatusLabel } from '@/components/ToolCard';

export default function ToolDetail({ params }) {
    const { id } = use(params);
    const { user, isAdmin, loading: authLoading } = useAuth();
    const router = useRouter();

    const [tool, setTool] = useState(null);
    const [loading, setLoading] = useState(true);
    const [isEditMode, setIsEditMode] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // Edit states
    const [localBlocks, setLocalBlocks] = useState([]);
    const [localExtras, setLocalExtras] = useState({ url: '', type: 'webapp' });

    useEffect(() => {
        if (!authLoading) fetchTool();
    }, [id, authLoading]);

    const fetchTool = async () => {
        try {
            const docSnap = await getDoc(doc(db, 'tools', id));
            if (!docSnap.exists()) {
                router.push('/');
                return;
            }
            const data = docSnap.data();
            const isPublic = ['live', 'beta', 'new'].includes(data.status) || data.approval === 'approved';
            const isOwner = user && (data.authorUid === user.uid);
            if (!isPublic && !isOwner && !isAdmin) {
                router.push('/');
                return;
            }
            setTool(data);
            setLocalBlocks(data.blog?.blocks || []);
            setLocalExtras({ url: data.url || '', type: data.type || 'webapp' });
        } catch (error) {
            console.error(error);
        }
        setLoading(false);
    };

    const isAuthor = tool && user && tool.authorUid === user.uid;
    const canEdit = isAdmin || isAuthor;

    const handleSave = async () => {
        if (!canEdit) return; // double-check before writing
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

    const handleAIGenerate = async (prompt) => {
        // Simple mock of AI placing text into blog for now (MVP for migration)
        alert('AI 生成整合功能將取代原本的內容，MVP 演示直接保存。請見 AIPanel 邏輯。');
    };

    const updateBlockContent = (idx, content) => {
        const newBlocks = [...localBlocks];
        newBlocks[idx].content = content;
        setLocalBlocks(newBlocks);
    };

    if (loading || authLoading) return <p className="text-center py-20">載入中...</p>;
    if (!tool) return null;

    return (
        <div>
            {/* Topbar logic */}
            {canEdit && (
                <div className="bg-[var(--color-clay-purple)]/10 border border-[var(--color-clay-purple)]/20 p-4 rounded-2xl mb-8 flex justify-between items-center">
                    <div>
                        <span className="font-extrabold text-[var(--color-clay-purple)] flex items-center gap-2">
                            <span className="text-xl">🛠️</span> 編輯模式 (你是{isAdmin ? '管理員' : '作者'})
                        </span>
                        <p className="text-sm font-bold text-gray-500">可以隨時點擊右邊按鈕修改內容並儲存。</p>
                    </div>
                    <div className="flex gap-4">
                        {!isEditMode ? (
                            <button onClick={() => setIsEditMode(true)} className="px-5 py-2.5 rounded-full bg-white font-extrabold text-[var(--color-clay-purple)] shadow-sm border border-[var(--color-clay-purple)] hover:shadow-md transition-all">
                                ✏️ 進入編輯
                            </button>
                        ) : (
                            <>
                                <button onClick={() => setIsEditMode(false)} className="px-5 py-2.5 rounded-full bg-gray-100 font-extrabold text-gray-600 border border-gray-200">
                                    取消
                                </button>
                                <button onClick={handleSave} disabled={isSaving} className="px-5 py-2.5 rounded-full bg-[var(--color-clay-purple)] text-white font-extrabold shadow-md hover:shadow-lg transition-all">
                                    {isSaving ? '儲存中...' : '💾 儲存變更'}
                                </button>
                            </>
                        )}
                    </div>
                </div>
            )}

            {isEditMode && <AIPanel onGenerate={handleAIGenerate} />}

            <div className="flex flex-col lg:flex-row gap-8">
                {/* SIDEBAR */}
                <aside className="lg:w-80 flex-shrink-0 bg-[var(--color-card-bg)] rounded-[32px] p-8 shadow-sm border border-[var(--color-card-border)] h-fit sticky top-24">
                    <div className="text-center mb-6">
                        <div className="w-20 h-20 mx-auto rounded-[24px] bg-gradient-to-br from-blue-100 to-blue-200 flex items-center justify-center text-4xl shadow-inner mb-4">
                            {tool.icon || '📦'}
                        </div>
                        <h1 className="text-2xl font-black text-[var(--color-text-dark)]">{tool.title}</h1>
                        <p className="text-gray-500 font-bold mt-2 text-sm">{tool.tagline}</p>
                    </div>

                    <div className="flex justify-center mb-6">
                        <span className={`px-4 py-1.5 rounded-lg border text-sm font-bold ${getStatusLabel(tool.status).cls}`}>
                            {getStatusLabel(tool.status).label}
                        </span>
                    </div>

                    {isEditMode ? (
                        <div className="bg-[var(--color-card-bg)] rounded-2xl p-5 border border-[var(--color-card-border)] mt-6 flex flex-col gap-4">
                            <h4 className="font-extrabold text-[0.8rem] text-[var(--color-text-mid)] uppercase tracking-widest">🛠️ 編輯連結與平台</h4>

                            <div className="flex flex-col gap-2">
                                <label className="flex items-center gap-2 text-sm font-bold text-[var(--color-text-dark)]">
                                    <input type="radio" value="webapp" checked={localExtras.type === 'webapp'} onChange={e => setLocalExtras({...localExtras, type: e.target.value})} />
                                    🌐 網頁版
                                </label>
                                <label className="flex items-center gap-2 text-sm font-bold text-[var(--color-text-dark)]">
                                    <input type="radio" value="download" checked={localExtras.type === 'download'} onChange={e => setLocalExtras({...localExtras, type: e.target.value})} />
                                    ⬇️ 下載版 (.exe)
                                </label>
                            </div>

                            <input
                                value={localExtras.url} onChange={e => setLocalExtras({...localExtras, url: e.target.value})}
                                placeholder={localExtras.type === 'webapp' ? '輸入 https:// 網址' : '輸入 Google Drive 共享連結'}
                                className="w-full bg-[var(--color-card-bg)] text-[var(--color-text-dark)] border border-[var(--color-card-border)] rounded-lg p-2 text-sm outline-none focus:border-[var(--color-clay-purple)]"
                            />
                        </div>
                    ) : (() => {
                        const downloadUrl = tool.type === 'download'
                            ? (tool.url || tool.versions?.at(-1)?.fileUrl || tool.files?.[0]?.path || '')
                            : tool.url;
                        return downloadUrl ? (
                            <div className="mt-8 pt-6 border-t border-gray-100 flex justify-center">
                                {tool.type === 'download' ? (
                                    <a href={downloadUrl} target="_blank" rel="noopener noreferrer" className="w-full text-center px-6 py-4 rounded-xl font-extrabold shadow-md bg-blue-50 text-blue-600 border border-blue-200 hover:shadow-lg transition-all">
                                        ⬇️ 點此下載軟體
                                    </a>
                                ) : (
                                    <a href={downloadUrl} target="_blank" rel="noopener noreferrer" className="w-full text-center px-6 py-4 rounded-xl font-extrabold shadow-md text-white bg-gradient-to-r from-[var(--color-clay-purple)] to-[var(--color-clay-blue)] hover:shadow-lg transition-all">
                                        🌐 前往網頁工具
                                    </a>
                                )}
                            </div>
                        ) : null;
                    })()}
                </aside>

                {/* MAIN CONTENT */}
                <main className="flex-1 bg-[var(--color-card-bg)] rounded-[32px] p-8 md:p-12 shadow-sm border border-[var(--color-card-border)] prose prose-lg prose-headings:font-black prose-p:font-bold prose-p:text-[var(--color-text-mid)] max-w-none">
                    <h2 className="text-3xl mb-8 flex items-center gap-3 border-b-2 border-gray-100 pb-4">
                        <span className="text-[var(--color-clay-purple)]">📄</span> 工具說明書
                    </h2>
                    
                    <div className="flex flex-col gap-6">
                        {isEditMode ? (
                            <>
                                {localBlocks.map((block, idx) => (
                                    <textarea
                                        key={idx}
                                        value={block.content}
                                        onChange={(e) => updateBlockContent(idx, e.target.value)}
                                        className="w-full border-2 border-dashed border-gray-300 rounded-2xl p-6 min-h-[150px] outline-none focus:border-[var(--color-clay-purple)] bg-gray-50/50"
                                    />
                                ))}
                                {localBlocks.length === 0 && (
                                    <textarea
                                        placeholder="輸入工具說明內容..."
                                        onChange={(e) => setLocalBlocks([{ type: 'text', content: e.target.value }])}
                                        className="w-full border-2 border-dashed border-gray-300 rounded-2xl p-6 min-h-[150px] outline-none focus:border-[var(--color-clay-purple)] bg-gray-50/50"
                                    />
                                )}
                            </>
                        ) : localBlocks.length > 0 ? (
                            localBlocks.map((block, idx) => (
                                <div key={idx} className="whitespace-pre-wrap leading-relaxed">
                                    {block.content}
                                </div>
                            ))
                        ) : (
                            <p className="whitespace-pre-wrap leading-relaxed text-gray-600">
                                {tool.blog?.summary || tool.desc || ''}
                            </p>
                        )}
                    </div>
                </main>
            </div>
        </div>
    );
}
