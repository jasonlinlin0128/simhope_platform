'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import { collection, getDocs, doc, updateDoc, deleteDoc } from 'firebase/firestore';

export default function AdminDashboard() {
    const { user, isAdmin, loading: authLoading } = useAuth();
    const router = useRouter();

    const [tools, setTools] = useState([]);
    const [painCards, setPainCards] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('tools');

    useEffect(() => {
        if (!authLoading) {
            if (!user || !isAdmin) {
                alert('權限不足，已被拒絕訪問');
                router.push('/');
            } else {
                fetchAdminData();
            }
        }
    }, [user, isAdmin, authLoading, router]);

    const fetchAdminData = async () => {
        setLoading(true);
        try {
            const toolsSnap = await getDocs(collection(db, 'tools'));
            setTools(toolsSnap.docs.map(d => ({ id: d.id, ...d.data() })));

            const painSnap = await getDocs(collection(db, 'painCards'));
            setPainCards(painSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        } catch (error) {
            console.error("Fetch data failed", error);
        }
        setLoading(false);
    };

    const handleUpdateToolStatus = async (id, status) => {
        try {
            const update = { status };
            // Keep approval field in sync for legacy compatibility during migration
            if (['live', 'beta', 'new'].includes(status)) update.approval = 'approved';
            else if (status === 'terminated') update.approval = 'rejected';
            else update.approval = 'pending';
            await updateDoc(doc(db, 'tools', id), update);
            fetchAdminData();
        } catch (error) {
            console.error(error);
            alert('更新失敗');
        }
    };

    const handleDeleteTool = async (id) => {
        if (!confirm('確定刪除此工具？')) return;
        try {
            await deleteDoc(doc(db, 'tools', id));
            fetchAdminData();
        } catch (error) {
            console.error(error);
            alert('刪除失敗');
        }
    };

    if (authLoading || loading) return <p className="text-center py-20 text-gray-400">載入中...</p>;
    if (!isAdmin) return null;

    return (
        <div className="flex gap-8 px-4 md:px-0">
            <aside className="w-64 flex-shrink-0 border-r border-gray-200 pr-6 min-h-[500px]">
                <h3 className="text-lg font-black text-[var(--color-clay-purple)] mb-6 flex items-center gap-2">
                    <span className="text-2xl">🏭</span> Admin 後台
                </h3>
                <nav className="flex flex-col gap-2">
                    <button 
                        onClick={() => setActiveTab('tools')}
                        className={`w-full text-left px-4 py-3 rounded-xl font-bold transition-all ${activeTab === 'tools' ? 'bg-[var(--color-clay-purple)] text-white shadow-md' : 'text-gray-600 hover:bg-gray-100'}`}
                    >
                        🧰 工具管理 <span className="float-right bg-white/20 px-2 rounded-full text-xs py-0.5">{tools.length}</span>
                    </button>
                    <button 
                        onClick={() => setActiveTab('pains')}
                        className={`w-full text-left px-4 py-3 rounded-xl font-bold transition-all ${activeTab === 'pains' ? 'bg-[var(--color-clay-purple)] text-white shadow-md' : 'text-gray-600 hover:bg-gray-100'}`}
                    >
                        😤 痛點卡片管理 <span className="float-right bg-white/20 px-2 rounded-full text-xs py-0.5">{painCards.length}</span>
                    </button>
                    {/* Hero, About, Spec are mocked out for now to ensure stable migration */}
                    <button disabled className="w-full text-left px-4 py-3 rounded-xl font-bold text-gray-300 cursor-not-allowed">
                        🏠 首頁設定 (施工中)
                    </button>
                </nav>
            </aside>

            <main className="flex-1">
                {activeTab === 'tools' && (
                    <div className="bg-white rounded-[24px] shadow-sm border border-gray-200 p-8">
                        <h2 className="text-2xl font-black mb-6">🧰 所有已提交工具</h2>
                        
                        <div className="flex flex-col gap-4">
                            {tools.map(tool => (
                                <div key={tool.id} className="flex flex-col md:flex-row justify-between items-center bg-gray-50 p-5 rounded-2xl border border-gray-200 gap-4">
                                    <div className="flex items-center gap-4 flex-1 w-full">
                                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-100 to-blue-200 flex items-center justify-center text-2xl">
                                            {tool.icon || '📦'}
                                        </div>
                                        <div>
                                            <h4 className="font-extrabold text-[var(--color-text-dark)]">{tool.title}</h4>
                                            <p className="text-xs text-gray-500 font-bold">{tool.tagline}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3 w-full md:w-auto">
                                        <div className="flex flex-col">
                                            <label className="text-xs text-gray-400 font-bold mb-1">工具狀態</label>
                                            <select 
                                                value={tool.status}
                                                onChange={(e) => handleUpdateToolStatus(tool.id, e.target.value)}
                                                className="bg-white border border-gray-200 text-sm font-bold p-2 rounded-lg outline-none focus:border-[var(--color-clay-purple)]"
                                            >
                                                <option value="pending">🟡 待驗收</option>
                                                <option value="new">🌟 新上線</option>
                                                <option value="live">🟢 使用中</option>
                                                <option value="beta">🟠 測試中</option>
                                                <option value="dev">🔨 開發中</option>
                                                <option value="terminated">⚫ 已終止</option>
                                            </select>
                                        </div>
                                        <div className="flex gap-2 mt-4 md:mt-0">
                                            <a href={`/tool/${tool.id}`} className="px-4 py-2 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg font-bold text-sm transition-colors border border-blue-200">
                                                ✏️ 編輯
                                            </a>
                                            <button onClick={() => handleDeleteTool(tool.id)} className="px-4 py-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg font-bold text-sm transition-colors border border-red-200">
                                                🗑️ 刪除
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {tools.length === 0 && <p className="text-gray-400 font-bold">目前沒有資料</p>}
                        </div>
                    </div>
                )}

                {activeTab === 'pains' && (
                    <div className="bg-white rounded-[24px] shadow-sm border border-gray-200 p-8">
                        <h2 className="text-2xl font-black mb-6">😤 痛點卡片管理</h2>
                        
                        <div className="flex flex-col gap-4">
                            {painCards.map(card => (
                                <div key={card.id} className="bg-gray-50 p-5 rounded-2xl border border-gray-200 flex flex-col gap-2">
                                    <div className="text-sm font-bold text-red-600 bg-red-50 p-2 rounded relative border border-red-100">😓 {card.before}</div>
                                    <div className="text-sm font-bold text-green-600 bg-green-50 p-2 rounded border border-green-100">✅ {card.after}</div>
                                    <div className="flex justify-between items-center mt-2">
                                        <div className="text-xs font-bold text-gray-500 bg-gray-200/50 px-2 py-1 rounded">狀態: {card.approval === 'approved' ? '🟢 已核准' : '🟡 待審核'}</div>
                                    </div>
                                </div>
                            ))}
                            {painCards.length === 0 && <p className="text-gray-400 font-bold">目前沒有資料</p>}
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
