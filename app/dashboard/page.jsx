'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import AIPanel from '@/components/AIPanel';
import ToolCard from '@/components/ToolCard';
import { db, auth } from '@/lib/firebase';
import { collection, query, where, getDocs, setDoc, doc, serverTimestamp } from 'firebase/firestore';

// 5 種類型 + 「適合什麼情況」說明（給非技術同仁看得懂）
const TYPE_OPTIONS = [
    {
        key: 'webapp',
        emoji: '🌐',
        label: '網頁應用',
        helper: '同仁點連結就能用，不用安裝。AI Studio / Gemini Canvas / Vercel 上的工具都算這類。',
        urlPlaceholder: 'https://aistudio.google.com/apps/... 或 https://xxx.vercel.app',
        accent: 'border-purple-300 hover:border-purple-500 hover:bg-purple-50',
        activeAccent: 'border-purple-500 bg-purple-50',
    },
    {
        key: 'download',
        emoji: '⬇️',
        label: '軟體下載',
        helper: '同仁要下載安裝檔（.exe / .msi）到電腦執行。內網用、需要存取本機檔案的選這個。',
        urlPlaceholder: 'Google Drive 共享連結或檔案直連網址',
        accent: 'border-gray-200 hover:border-blue-300 hover:bg-blue-50',
        activeAccent: 'border-blue-500 bg-blue-50',
    },
    {
        key: 'doc',
        emoji: '📄',
        label: '文件 / 表單',
        helper: 'PDF / Word / Excel 等可下載的檔案。ISO 表單、SOP、規格書、Notion 匯出文件都算這類。',
        urlPlaceholder: 'Google Drive 共享連結或檔案直連網址',
        accent: 'border-gray-200 hover:border-orange-300 hover:bg-orange-50',
        activeAccent: 'border-orange-500 bg-orange-50',
    },
    {
        key: 'mcp',
        emoji: '🔌',
        label: 'AI 連接器（MCP）',
        helper: '把資料或能力包成 AI 可呼叫的接口。同仁裝一次以後 Claude / Cursor 就能直接幫他查/操作這份資源。',
        urlPlaceholder: 'GitHub repo 連結（其他細節經企室審核時補）',
        accent: 'border-gray-200 hover:border-emerald-300 hover:bg-emerald-50',
        activeAccent: 'border-emerald-500 bg-emerald-50',
    },
    {
        key: 'api',
        emoji: '🧩',
        label: 'API / SDK',
        helper: '給工程師用程式接的接口（REST API / Python 套件 / JS library）。一般同仁用不到。',
        urlPlaceholder: 'GitHub repo 或 API 文件連結',
        accent: 'border-gray-200 hover:border-amber-300 hover:bg-amber-50',
        activeAccent: 'border-amber-500 bg-amber-50',
    },
];

export default function Dashboard() {
    const { user, loading: authLoading } = useAuth();
    const router = useRouter();

    const [myTools, setMyTools] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isGenerating, setIsGenerating] = useState(false);

    // 4 欄表單 state
    const [formData, setFormData] = useState({
        title: '',
        tagline: '',
        url: '',
        type: 'webapp',
    });

    useEffect(() => {
        if (!authLoading && !user) {
            router.push('/');
        } else if (user) {
            fetchMyTools();
        }
    }, [user, authLoading, router]);

    const fetchMyTools = async () => {
        setLoading(true);
        try {
            const q = query(collection(db, 'tools'), where('authorUid', '==', user.uid));
            const snap = await getDocs(q);
            setMyTools(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        } catch (error) {
            console.error("Failed to load tools", error);
        }
        setLoading(false);
    };

    // AI 文案生成 — 只填 title + tagline（其他細節經企室審核時補）
    const handleGenerate = async (prompt) => {
        setIsGenerating(true);
        try {
            const idToken = await auth.currentUser.getIdToken();
            const res = await fetch('/api/generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`,
                },
                body: JSON.stringify({ prompt }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || 'API 呼叫失敗');
            }
            const result = await res.json();
            setFormData(prev => ({
                ...prev,
                title: result.title || prev.title,
                tagline: result.tagline || prev.tagline,
            }));
            alert('✨ 文案生成完成！其他欄位請手動填，送出後經企室審核時會補完細節。');
        } catch (err) {
            console.error(err);
            alert('AI 生成失敗，請稍後再試');
        } finally {
            setIsGenerating(false);
        }
    };

    const handleFormSubmit = async (e) => {
        e.preventDefault();
        try {
            const id = 't_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);

            // 提交資料：4 個必填 + 系統 metadata；
            // 部門 / folder / scenarios / blog / icon / steps 等細節由 admin 審核時補
            const toolData = {
                title: formData.title,
                tagline: formData.tagline,
                url: formData.url,
                type: formData.type,
                status: 'pending',
                authorUid: user.uid,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                // 預設值（讓詳情頁/卡片不會壞）
                icon: '📦',
                color: 'c' + (Math.floor(Math.random() * 6) + 1),
                desc: '',
                typeData: {},
                blog: { summary: '', blocks: [] },
                files: [],
                versions: [],
            };

            await setDoc(doc(db, 'tools', id), toolData);
            alert('已送出！經企室審核後會跟你討論細節（截圖、使用步驟、適用部門、進階安裝方式等），通過後上架。');
            setFormData({ title: '', tagline: '', url: '', type: 'webapp' });
            fetchMyTools();
        } catch (error) {
            console.error(error);
            alert(error.code === 'permission-denied'
                ? '儲存失敗：你不是開發者帳號，無法提交工具。請聯絡管理員開通。'
                : '儲存失敗，請稍後再試');
        }
    };

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    if (authLoading || loading) return <p className="text-center py-20 text-gray-400">載入中，請稍候…</p>;

    const currentType = TYPE_OPTIONS.find(t => t.key === formData.type) || TYPE_OPTIONS[0];

    return (
        <div className="px-4 md:px-0 flex flex-col gap-10">
            <div className="flex justify-between items-end border-b-2 border-gray-100 dark:border-gray-700 pb-4">
                <div>
                    <h2 className="text-3xl font-black text-[var(--color-text-dark)]">你好, {user?.displayName} 👋</h2>
                    <p className="text-[var(--color-text-mid)] font-bold mt-2">歡迎來到開發者儀表板</p>
                </div>
            </div>

            <div className="flex flex-col lg:flex-row gap-8">
                {/* Submit New Tool Form */}
                <div className="lg:w-1/2">
                    <div className="bg-[var(--color-card-bg)] p-6 md:p-8 rounded-[24px] shadow-sm border border-[var(--color-card-border)]">
                        <h3 className="font-extrabold text-xl mb-1 text-[var(--color-text-dark)] flex items-center gap-2">
                            <span className="text-2xl">🚀</span> 上架一個工具
                        </h3>
                        <p className="text-sm text-[var(--color-text-mid)] mb-6">
                            填這 <strong>4 個</strong>就好，其他細節（截圖、步驟、適用部門等）經企室審核時跟你討論補。
                        </p>

                        <AIPanel onGenerate={handleGenerate} isGenerating={isGenerating} />

                        <form onSubmit={handleFormSubmit} className="flex flex-col gap-5 mt-4">

                            {/* ① 名字 */}
                            <div>
                                <label className="block text-xs font-extrabold text-[var(--color-text-mid)] mb-2">① 工具名字</label>
                                <input
                                    name="title" value={formData.title} onChange={handleInputChange} required
                                    placeholder="例：ISO 表單查詢 MCP"
                                    className="w-full bg-gray-50 dark:bg-gray-700 p-3 rounded-xl border border-gray-200 dark:border-gray-600 text-sm outline-none focus:border-[var(--color-clay-purple)] transition-all"
                                />
                            </div>

                            {/* ② Tagline */}
                            <div>
                                <label className="block text-xs font-extrabold text-[var(--color-text-mid)] mb-2">② 一句話介紹（tagline）</label>
                                <input
                                    name="tagline" value={formData.tagline} onChange={handleInputChange} required
                                    placeholder="例：把 ISO 表單接到 Claude/Cursor 裡，AI 直接查條文跟填單"
                                    className="w-full bg-gray-50 dark:bg-gray-700 p-3 rounded-xl border border-gray-200 dark:border-gray-600 text-sm outline-none focus:border-[var(--color-clay-purple)] transition-all"
                                />
                            </div>

                            {/* ③ 主連結 */}
                            <div>
                                <label className="block text-xs font-extrabold text-[var(--color-text-mid)] mb-2">③ 主連結</label>
                                <input
                                    name="url" value={formData.url} onChange={handleInputChange} required
                                    placeholder={currentType.urlPlaceholder}
                                    className="w-full bg-gray-50 dark:bg-gray-700 p-3 rounded-xl border border-gray-200 dark:border-gray-600 text-sm outline-none focus:border-[var(--color-clay-purple)] transition-all"
                                />
                                <p className="text-xs text-gray-400 mt-1.5">不知道放什麼？貼 GitHub repo 連結就好，其他細節經企室審核時補。</p>
                            </div>

                            {/* ④ 類型 radio + 說明 */}
                            <div>
                                <label className="block text-xs font-extrabold text-[var(--color-text-mid)] mb-3">④ 類型（這是什麼樣的東西？）</label>
                                <div className="grid grid-cols-1 gap-2">
                                    {TYPE_OPTIONS.map(opt => {
                                        const isActive = formData.type === opt.key;
                                        return (
                                            <label
                                                key={opt.key}
                                                className={`flex gap-3 items-start cursor-pointer rounded-xl p-3 border-2 transition ${isActive ? opt.activeAccent : opt.accent}`}
                                            >
                                                <input
                                                    type="radio" name="type" value={opt.key}
                                                    checked={isActive} onChange={handleInputChange}
                                                    className="mt-1 accent-[var(--color-clay-purple)] w-4 h-4 flex-shrink-0"
                                                />
                                                <div className="flex-1">
                                                    <div className="font-extrabold text-sm text-[var(--color-text-dark)]">
                                                        {opt.emoji} {opt.label}
                                                    </div>
                                                    <div className="text-xs text-[var(--color-text-mid)] mt-0.5 leading-snug">
                                                        {opt.helper}
                                                    </div>
                                                </div>
                                            </label>
                                        );
                                    })}
                                </div>
                            </div>

                            <button type="submit" className="mt-2 px-6 py-4 rounded-xl bg-gradient-to-br from-[var(--color-clay-purple)] to-[var(--color-clay-blue)] text-white font-extrabold text-base shadow-md hover:-translate-y-0.5 hover:shadow-lg transition-all">
                                📤 送出，等審核
                            </button>

                            <p className="text-center text-xs text-gray-400">
                                送出後經企室會跟你討論截圖、使用步驟、進階安裝方式、適用部門等細節。
                            </p>
                        </form>
                    </div>
                </div>

                {/* My Tools List */}
                <div className="lg:w-1/2">
                    <h3 className="font-extrabold text-xl mb-6 text-[var(--color-text-dark)] flex items-center gap-2">
                        <span className="text-2xl">🧰</span> 我提交的工具 ({myTools.length})
                    </h3>

                    {myTools.length === 0 ? (
                        <div className="bg-gray-50 dark:bg-gray-800 rounded-[24px] p-10 h-[300px] border-2 border-dashed border-gray-200 dark:border-gray-700 flex flex-col items-center justify-center text-center">
                            <span className="text-4xl mb-4 grayscale opacity-50">📦</span>
                            <h4 className="font-bold text-gray-400">你還沒有提交任何工具</h4>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-4">
                            {myTools.map(t => (
                                <div key={t.id} className="flex flex-col gap-1.5">
                                    <ToolCard tool={t} />
                                    <Link href={`/tool/${t.id}`} className="text-center py-1.5 rounded-xl bg-[var(--color-clay-purple)]/10 text-[var(--color-clay-purple)] text-xs font-bold border border-[var(--color-clay-purple)]/20 hover:bg-[var(--color-clay-purple)] hover:text-white transition-all">
                                        ✏️ 前往編輯此工具
                                    </Link>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
