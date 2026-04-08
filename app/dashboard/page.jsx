'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import AIPanel from '@/components/AIPanel';
import ToolCard from '@/components/ToolCard';
import { db, auth } from '@/lib/firebase';
import { collection, query, where, getDocs, setDoc, doc, serverTimestamp } from 'firebase/firestore';
import { DEPTS } from '@/lib/db';

export default function Dashboard() {
    const { user, loading: authLoading } = useAuth();
    const router = useRouter();
    
    const [myTools, setMyTools] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isGenerating, setIsGenerating] = useState(false);

    // Form states
    const [formData, setFormData] = useState({
        title: '', tagline: '', icon: '📦',
        desc: '', dept: 'other', folder: '',
        type: 'webapp', url: '',
        s1: '', s2: '', s3: '',
        tags: '' // comma-separated strings
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

    const handleGenerate = async (prompt) => {
        setIsGenerating(true);
        try {
            const idToken = await auth.currentUser.getIdToken();
            const res = await fetch('/api/generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`
                },
                body: JSON.stringify({ prompt })
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || 'API 呼叫失敗');
            }
            const result = await res.json();

            // Typewriter effect function wrapper (mocked for React via simple state update for now,
            // to implement real typewriter requires complex state queueing, doing direct set for MVP)
            setFormData(prev => ({
                ...prev,
                title: result.title || prev.title,
                tagline: result.tagline || prev.tagline,
                desc: result.desc || prev.desc,
                icon: result.icon || prev.icon,
                dept: result.dept && DEPTS[result.dept] ? result.dept : prev.dept,
                s1: result.s1 || prev.s1,
                s2: result.s2 || prev.s2,
                s3: result.s3 || prev.s3,
                tags: (result.tags || []).join(', ')
            }));

            alert('✨ 魔法生成完成！');
        } catch (err) {
            console.error(err);
            alert('生成失敗：' + err.message);
        } finally {
            setIsGenerating(false);
        }
    };

    const handleFormSubmit = async (e) => {
        e.preventDefault();
        try {
            const id = 't_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
            
            const steps = [formData.s1, formData.s2, formData.s3].filter(Boolean);
            const tags = formData.tags.split(/[,，]/).map(s => s.trim()).filter(Boolean);
            const scenarios = [DEPTS[formData.dept]?.label.replace(/^.*? /, '') || '其他'];
            
            const toolData = {
                title: formData.title,
                tagline: formData.tagline,
                desc: formData.desc,
                dept: formData.dept,
                folder: formData.folder || '未分類專案',
                type: formData.type,
                url: formData.url,
                icon: formData.icon,
                steps, tags, scenarios,
                status: 'pending',
                authorUid: user.uid,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                color: 'c' + (Math.floor(Math.random() * 6) + 1),
                blog: { blocks: [] },
                versions: [],
                files: []
            };

            await setDoc(doc(db, 'tools', id), toolData);
            
            alert('送出成功！請等待管理員審核。');
            setFormData({
                title: '', tagline: '', icon: '📦', desc: '', dept: 'other', 
                folder: '', type: 'webapp', url: '', s1: '', s2: '', s3: '', tags: ''
            }); // Reset form
            fetchMyTools(); // Refresh
        } catch (error) {
            console.error(error);
            alert('儲存失敗');
        }
    };

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    if (authLoading || loading) return <p className="text-center py-20 text-gray-400">載入中...</p>;

    return (
        <div className="px-4 md:px-0 flex flex-col gap-10">
            <div className="flex justify-between items-end border-b-2 border-gray-100 pb-4">
                <div>
                    <h2 className="text-3xl font-black">你好, {user?.displayName} 👋</h2>
                    <p className="text-[var(--color-text-mid)] font-bold mt-2">歡迎來到開發者儀表板</p>
                </div>
            </div>

            <div className="flex flex-col lg:flex-row gap-8">
                {/* Submit New Tool Form */}
                <div className="lg:w-1/2">
                    <div className="bg-white p-6 md:p-8 rounded-[24px] shadow-sm border border-gray-200">
                        <h3 className="font-extrabold text-xl mb-4 text-[var(--color-text-dark)] flex items-center gap-2">
                            <span className="text-2xl">🚀</span> 提交新工具
                        </h3>
                        <p className="text-[0.85rem] text-[var(--color-text-mid)] font-bold mb-6">
                            請詳細填寫工具資訊，提交後將進入「審核」階段。
                        </p>

                        <AIPanel onGenerate={handleGenerate} isGenerating={isGenerating} />

                        <form onSubmit={handleFormSubmit} className="flex flex-col gap-5">
                            <div className="flex gap-4">
                                <div className="w-[80px]">
                                    <label className="block text-xs font-bold text-gray-500 mb-2">Emoji</label>
                                    <input 
                                        name="icon" value={formData.icon} onChange={handleInputChange} required
                                        className="w-full bg-gray-50 p-3 rounded-xl border border-gray-200 text-xl text-center outline-none focus:border-[var(--color-clay-purple)] transition-all"
                                    />
                                </div>
                                <div className="flex-1">
                                    <label className="block text-xs font-bold text-gray-500 mb-2">工具名稱</label>
                                    <input 
                                        name="title" value={formData.title} onChange={handleInputChange} required placeholder="例如：自動會議記錄器"
                                        className="w-full bg-gray-50 p-3 rounded-xl border border-gray-200 text-sm outline-none focus:border-[var(--color-clay-purple)] transition-all"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-2">一句話賣點 (Tagline)</label>
                                <input 
                                    name="tagline" value={formData.tagline} onChange={handleInputChange} required placeholder="例如：開完會 3 分鐘直接產出逐字稿跟重點整理"
                                    className="w-full bg-gray-50 p-3 rounded-xl border border-gray-200 text-sm outline-none focus:border-[var(--color-clay-purple)] transition-all"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-2">詳細情境介紹 / 解決了什麼問題</label>
                                <textarea 
                                    name="desc" value={formData.desc} onChange={handleInputChange} required rows="3"
                                    className="w-full bg-gray-50 p-3 rounded-xl border border-gray-200 text-sm outline-none focus:border-[var(--color-clay-purple)] transition-all resize-none"
                                ></textarea>
                            </div>

                            <div className="flex gap-4">
                                <div className="flex-1">
                                    <label className="block text-xs font-bold text-gray-500 mb-2">歸屬專案目錄</label>
                                    <input 
                                        name="folder" value={formData.folder} onChange={handleInputChange} placeholder="例如：會計行政專案"
                                        className="w-full bg-gray-50 p-3 rounded-xl border border-gray-200 text-sm outline-none focus:border-[var(--color-clay-purple)] transition-all"
                                    />
                                </div>
                                <div className="flex-1">
                                    <label className="block text-xs font-bold text-gray-500 mb-2">主責部門</label>
                                    <select 
                                        name="dept" value={formData.dept} onChange={handleInputChange}
                                        className="w-full bg-gray-50 p-3 rounded-xl border border-gray-200 text-sm outline-none focus:border-[var(--color-clay-purple)] transition-all"
                                    >
                                        {Object.entries(DEPTS).map(([k, v]) => (
                                            <option key={k} value={k}>{v.label}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="bg-blue-50/50 p-4 rounded-2xl border border-blue-100 flex flex-col gap-4">
                                <label className="block text-xs font-bold text-blue-800 mb-1">🔗 工具來源類型</label>
                                <div className="flex gap-4">
                                    <label className="flex items-center gap-2 text-sm font-bold cursor-pointer">
                                        <input type="radio" name="type" value="webapp" checked={formData.type === 'webapp'} onChange={handleInputChange} className="accent-[var(--color-clay-purple)] w-4 h-4" />
                                        🌐 網頁應用 (Web App)
                                    </label>
                                    <label className="flex items-center gap-2 text-sm font-bold cursor-pointer">
                                        <input type="radio" name="type" value="download" checked={formData.type === 'download'} onChange={handleInputChange} className="accent-[var(--color-clay-purple)] w-4 h-4" />
                                        ⬇️ 本機軟體 (.exe 檔案)
                                    </label>
                                </div>

                                <div>
                                    <input
                                        name="url" value={formData.url} onChange={handleInputChange} required
                                        placeholder={formData.type === 'webapp' ? 'https://...' : 'https://drive.google.com/...'}
                                        className="w-full bg-white p-3 rounded-xl border border-gray-200 text-sm outline-none focus:border-[var(--color-clay-purple)] transition-all"
                                    />
                                    {formData.type === 'download' && (
                                        <p className="text-xs text-gray-400 font-bold mt-2 ml-1">請貼上 Google Drive 的共享下載連結</p>
                                    )}
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-2">使用步驟 (最少一步，最多三步)</label>
                                <div className="flex gap-2 mb-2">
                                    <span className="text-xs font-bold text-gray-400 mt-3">1.</span>
                                    <input name="s1" value={formData.s1} onChange={handleInputChange} required className="flex-1 bg-gray-50 p-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-[var(--color-clay-purple)]" />
                                </div>
                                <div className="flex gap-2 mb-2">
                                    <span className="text-xs font-bold text-gray-400 mt-3">2.</span>
                                    <input name="s2" value={formData.s2} onChange={handleInputChange} className="flex-1 bg-gray-50 p-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-[var(--color-clay-purple)]" />
                                </div>
                                <div className="flex gap-2">
                                    <span className="text-xs font-bold text-gray-400 mt-3">3.</span>
                                    <input name="s3" value={formData.s3} onChange={handleInputChange} className="flex-1 bg-gray-50 p-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-[var(--color-clay-purple)]" />
                                </div>
                            </div>
                            
                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-2">標籤 (用逗號分隔)</label>
                                <input 
                                    name="tags" value={formData.tags} onChange={handleInputChange} placeholder="AI, 翻譯, 手機版"
                                    className="w-full bg-gray-50 p-3 rounded-xl border border-gray-200 text-sm outline-none focus:border-[var(--color-clay-purple)] transition-all"
                                />
                            </div>

                            <button type="submit" className="mt-4 px-6 py-4 rounded-xl bg-gradient-to-br from-[var(--color-clay-purple)] to-[var(--color-clay-blue)] text-white font-extrabold text-[0.95rem] shadow-md hover:-translate-y-1 hover:shadow-lg transition-all text-center">
                                📤 提交工具
                            </button>
                        </form>
                    </div>
                </div>

                {/* My Tools List */}
                <div className="lg:w-1/2">
                    <h3 className="font-extrabold text-xl mb-6 text-[var(--color-text-dark)] flex items-center gap-2">
                        <span className="text-2xl">🧰</span> 我提交的工具 ({myTools.length})
                    </h3>
                    
                    {myTools.length === 0 ? (
                        <div className="bg-gray-50 rounded-[24px] p-10 h-[300px] border-2 border-dashed border-gray-200 flex flex-col items-center justify-center text-center">
                            <span className="text-4xl mb-4 grayscale opacity-50">📦</span>
                            <h4 className="font-bold text-gray-400">目前沒有提交任何工具。</h4>
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
