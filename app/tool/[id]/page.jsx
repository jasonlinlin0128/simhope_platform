'use client';

import { useState, useEffect, use } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
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
    audio:   { label: '🔊 語音',      badge: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    tip:     { label: '💡 提示框',    badge: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
    warning: { label: '⚠️ 注意事項',  badge: 'bg-orange-50 text-orange-700 border-orange-200' },
};

// ─── 語音來源標籤定義 ───────────────────────────────────────────────────────
const AUDIO_SOURCES = {
    notebooklm:  { label: 'NotebookLM',  cls: 'bg-blue-100 text-blue-700 border-blue-200' },
    soundcloud:  { label: 'SoundCloud',  cls: 'bg-orange-100 text-orange-700 border-orange-200' },
    upload:      { label: '直接上傳',    cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
    other:       { label: '其他來源',    cls: 'bg-gray-100 text-gray-600 border-gray-200' },
};

// ─── Markdown 渲染 ──────────────────────────────────────────────────────────
// 用 react-markdown + remark-gfm（GitHub Flavored Markdown）取代手寫 renderer
// 支援 **粗體**、*斜體*、## 標題、- 清單、`code`、表格、連結 etc.
const mdComponents = {
    h2: (props) => <h2 className="text-xl font-black mt-6 mb-2 text-[var(--color-text-dark)]" {...props} />,
    h3: (props) => <h3 className="text-lg font-extrabold mt-4 mb-1 text-[var(--color-text-dark)]" {...props} />,
    ul: (props) => <ul className="list-disc ml-5 flex flex-col gap-1 my-2" {...props} />,
    ol: (props) => <ol className="list-decimal ml-5 flex flex-col gap-1 my-2" {...props} />,
    li: (props) => <li className="font-bold text-[var(--color-text-dark)]" {...props} />,
    p:  (props) => <p className="font-bold text-[var(--color-text-dark)] leading-relaxed mb-2" {...props} />,
    strong: (props) => <strong className="text-[var(--color-clay-purple)]" {...props} />,
    code: ({ inline, ...props }) =>
        inline
            ? <code className="bg-gray-100 dark:bg-gray-700 px-1 py-0.5 rounded text-[0.85em]" {...props} />
            : <code className="block bg-gray-900 text-gray-100 p-3 rounded-lg text-sm font-mono overflow-x-auto" {...props} />,
    a:  (props) => <a className="text-[var(--color-clay-blue)] underline hover:opacity-80" target="_blank" rel="noopener noreferrer" {...props} />,
};

function MarkdownContent({ children }) {
    if (!children) return null;
    return (
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
            {children}
        </ReactMarkdown>
    );
}

// ─── YouTube ID extractor ──────────────────────────────────────────────────
function getYouTubeId(url) {
    if (!url) return null;
    const m = url.match(/(?:youtu\.be\/|youtube\.com(?:\/embed\/|\/v\/|\/watch\?v=|\/watch\?.+&v=))([\w-]{11})/);
    return m ? m[1] : null;
}

// ─── View-mode block renderer ──────────────────────────────────────────────
function BlockView({ block }) {
    const { type, content, caption, source } = block;

    if (type === 'audio') {
        if (!content) return null;
        const src = source && AUDIO_SOURCES[source];
        return (
            <figure className="my-1 bg-emerald-50/40 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-800/40 rounded-2xl p-4 flex flex-col gap-2">
                {src && (
                    <span className={`self-start text-[0.7rem] px-2 py-0.5 rounded-full font-bold border ${src.cls}`}>
                        🔊 {src.label}
                    </span>
                )}
                <audio controls src={content} className="w-full" preload="metadata">
                    瀏覽器不支援音檔播放
                </audio>
                {caption && (
                    <figcaption className="text-sm text-[var(--color-text-mid)] font-bold mt-1">{caption}</figcaption>
                )}
            </figure>
        );
    }

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
        <div className="flex flex-col gap-1">
            <MarkdownContent>{content}</MarkdownContent>
        </div>
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
                            src={block.content} alt={block.caption || ''}
                            className="w-full rounded-xl border border-[var(--color-card-border)] max-h-48 object-contain mt-1"
                            onError={e => { e.target.style.display = 'none'; }}
                        />
                    )}
                </div>
            )}

            {block.type === 'audio' && (
                <div className="flex flex-col gap-2">
                    <input
                        value={block.content || ''}
                        onChange={e => onChange({ ...block, content: e.target.value })}
                        placeholder="貼上音檔 URL（mp3/wav/m4a/ogg）或上傳到 Firebase Storage 後填網址"
                        className="w-full bg-[var(--color-card-bg)] text-[var(--color-text-dark)] border border-[var(--color-card-border)] rounded-xl px-3 py-2 text-sm outline-none focus:border-[var(--color-clay-purple)]"
                    />
                    <div className="flex gap-2">
                        <select
                            value={block.source || ''}
                            onChange={e => onChange({ ...block, source: e.target.value })}
                            className="bg-[var(--color-card-bg)] text-[var(--color-text-dark)] border border-[var(--color-card-border)] rounded-xl px-3 py-2 text-sm outline-none focus:border-[var(--color-clay-purple)]"
                        >
                            <option value="">無來源標籤</option>
                            {Object.entries(AUDIO_SOURCES).map(([key, val]) => (
                                <option key={key} value={key}>🔊 {val.label}</option>
                            ))}
                        </select>
                        <input
                            value={block.caption || ''}
                            onChange={e => onChange({ ...block, caption: e.target.value })}
                            placeholder="音檔說明文字（選填）"
                            className="flex-1 bg-[var(--color-card-bg)] text-[var(--color-text-mid)] border border-[var(--color-card-border)] rounded-xl px-3 py-2 text-sm outline-none focus:border-[var(--color-clay-purple)]"
                        />
                    </div>
                    {block.content && (
                        <audio controls src={block.content} className="w-full mt-1" preload="metadata" />
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

// ─── Type 對應的「一鍵動作」設定（view-mode 用） ─────────────────────────────
const TYPE_ACTION = {
    webapp:   { label: '🌐 前往網頁工具', cls: 'text-white bg-gradient-to-r from-[var(--color-clay-purple)] to-[var(--color-clay-blue)]' },
    download: { label: '⬇️ 下載安裝檔',  cls: 'text-white bg-blue-500 hover:bg-blue-600' },
    doc:      { label: '⬇️ 下載文件',    cls: 'text-white bg-orange-500 hover:bg-orange-600' },
    mcp:      { label: '📦 安裝到 Claude/Cursor', cls: 'text-white bg-emerald-500 hover:bg-emerald-600' },
    api:      { label: '🔗 看 API 文件', cls: 'text-white bg-amber-500 hover:bg-amber-600' },
};

// ─── 詳情頁 tab 元件（view-mode 用） ─────────────────────────────────────────
// 依 type 決定有哪些 tab：
//   webapp  → 只有「詳細說明」
//   download / doc → 「快速安裝」+「詳細說明」
//   mcp / api → 「快速安裝」+「進階設定」+「詳細說明」
//   embedded → 「部署資訊」+「詳細說明」
function DetailTabs({ tool, blocks, activeTab, setActiveTab }) {
    const type = tool.type || 'webapp';
    const td = tool.typeData || {};

    // 依 type 決定 tabs
    const tabs = [];
    if (type === 'embedded') {
        tabs.push({ key: 'deploy', label: '📍 部署資訊' });
    }
    if (['download', 'doc', 'mcp'].includes(type)) {
        tabs.push({ key: 'quick', label: '🚀 快速安裝' });
    }
    if (['mcp', 'api'].includes(type)) {
        tabs.push({ key: 'advanced', label: '🧰 進階設定' });
    }
    tabs.push({ key: 'detail', label: '📖 詳細說明' });

    // 修正 active tab：若當前 active 不在 tabs 列表中，退回第一個
    const activeKey = tabs.some(t => t.key === activeTab) ? activeTab : tabs[0].key;

    return (
        <div>
            {/* Tab bar */}
            {tabs.length > 1 && (
                <div className="border-b-2 border-[var(--color-card-border)] mb-8 flex gap-1 overflow-x-auto">
                    {tabs.map(t => (
                        <button
                            key={t.key}
                            onClick={() => setActiveTab(t.key)}
                            className={`px-5 py-3 font-extrabold text-sm whitespace-nowrap border-b-2 -mb-0.5 transition-colors ${
                                activeKey === t.key
                                    ? 'border-[var(--color-clay-purple)] text-[var(--color-text-dark)]'
                                    : 'border-transparent text-[var(--color-text-mid)] hover:text-[var(--color-text-dark)]'
                            }`}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>
            )}

            {/* Tab content */}
            {activeKey === 'deploy' && <DeployInfoTab td={td} />}
            {activeKey === 'quick' && <QuickInstallTab tool={tool} td={td} type={type} />}
            {activeKey === 'advanced' && <AdvancedSetupTab tool={tool} td={td} type={type} />}
            {activeKey === 'detail' && <DetailTab tool={tool} blocks={blocks} />}
        </div>
    );
}

// ─── 「部署資訊」tab — embedded 顯示 ──────────────────────────────────────────
function DeployInfoTab({ td }) {
    const hasAny = td.location || td.accessNote || td.contact;
    return (
        <div className="flex flex-col gap-5">
            <div className="bg-indigo-50/50 dark:bg-indigo-900/10 border-2 border-indigo-200 dark:border-indigo-800/40 rounded-2xl p-6 flex flex-col gap-4">
                <div className="flex items-center gap-2 text-indigo-700 dark:text-indigo-300 font-extrabold">
                    <span className="text-xl">📍</span> 這是綁定特定設備 / 電腦的場域工具
                </div>
                {td.location && (
                    <div>
                        <div className="text-xs font-extrabold text-[var(--color-text-mid)] uppercase tracking-wider mb-1">部署地點</div>
                        <p className="font-bold text-[var(--color-text-dark)]">{td.location}</p>
                    </div>
                )}
                {td.accessNote && (
                    <div>
                        <div className="text-xs font-extrabold text-[var(--color-text-mid)] uppercase tracking-wider mb-1">怎麼使用</div>
                        <p className="font-bold text-[var(--color-text-dark)] whitespace-pre-wrap leading-relaxed">{td.accessNote}</p>
                    </div>
                )}
                {td.contact && (
                    <div>
                        <div className="text-xs font-extrabold text-[var(--color-text-mid)] uppercase tracking-wider mb-1">負責窗口</div>
                        <p className="font-bold text-[var(--color-text-dark)]">{td.contact}</p>
                    </div>
                )}
                {!hasAny && (
                    <p className="text-sm text-[var(--color-text-mid)] italic">部署資訊還沒填，請聯絡經企室。</p>
                )}
            </div>
        </div>
    );
}

// ─── 「快速安裝」tab — download / doc / mcp 顯示 ─────────────────────────────
function QuickInstallTab({ tool, td, type }) {
    if (type === 'mcp') {
        const mcpbUrl = td.mcpbUrl;
        return (
            <div className="flex flex-col gap-6">
                <div className="bg-gradient-to-br from-emerald-50 to-white border-2 border-emerald-200 rounded-2xl p-6">
                    <h3 className="font-extrabold text-lg mb-2">⭐ 推薦給大多數人</h3>
                    <p className="text-sm text-[var(--color-text-mid)] mb-4">用 Claude Desktop 的同仁適用 — 下載一個檔案、雙擊、Claude 就會問你要不要啟用。整個過程 3 分鐘。</p>
                    {mcpbUrl ? (
                        <a href={mcpbUrl} target="_blank" rel="noopener noreferrer" className="inline-block px-6 py-3 rounded-xl bg-emerald-500 text-white font-extrabold text-sm shadow hover:bg-emerald-600 transition">
                            ⬇️ 下載安裝包 (.mcpb)
                        </a>
                    ) : (
                        <p className="text-sm text-[var(--color-text-mid)] italic">.mcpb 檔案還沒上傳，請看「進階設定」用 npm/git 方式安裝。</p>
                    )}
                </div>
            </div>
        );
    }

    // download / doc 共用
    const url = tool.url || td.fileUrl || tool.versions?.at(-1)?.fileUrl || '';
    const cta = TYPE_ACTION[type] || TYPE_ACTION.download;
    return (
        <div className="flex flex-col gap-4">
            {url ? (
                <a href={url} target="_blank" rel="noopener noreferrer" className={`inline-block text-center px-6 py-4 rounded-xl font-extrabold shadow-md hover:shadow-lg transition-all max-w-md ${cta.cls}`}>
                    {cta.label}
                </a>
            ) : (
                <div className="p-6 rounded-2xl bg-gray-50 dark:bg-gray-800 border border-dashed border-gray-300 dark:border-gray-700 text-[var(--color-text-mid)] font-bold">
                    🚧 下載連結還沒填，請看詳細說明或聯絡作者。
                </div>
            )}
            {td.platform && (
                <p className="text-sm text-[var(--color-text-mid)]"><strong>平台：</strong>{td.platform}</p>
            )}
            {td.version && (
                <p className="text-sm text-[var(--color-text-mid)]"><strong>版本：</strong>{td.version}</p>
            )}
        </div>
    );
}

// ─── 「進階設定」tab — mcp / api 顯示 ─────────────────────────────────────────
function AdvancedSetupTab({ tool, td, type }) {
    if (type === 'mcp') {
        return (
            <div className="flex flex-col gap-5">
                <p className="text-sm text-[var(--color-text-mid)]">用 Cursor、VS Code、Cline、n8n 或其他支援 MCP 的工具，用下面任一方式接。</p>
                {td.npmPackage && (
                    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-5">
                        <h4 className="font-extrabold mb-2">🧰 npm 套件</h4>
                        <code className="block bg-gray-900 text-gray-100 text-sm font-mono p-3 rounded-lg">{td.npmPackage}</code>
                    </div>
                )}
                {td.configSnippet && (
                    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-5">
                        <h4 className="font-extrabold mb-2">📋 Config JSON</h4>
                        <pre className="bg-gray-900 text-gray-100 text-xs font-mono p-3 rounded-lg overflow-x-auto whitespace-pre-wrap break-all">{td.configSnippet}</pre>
                    </div>
                )}
                {td.repoUrl && (
                    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-5">
                        <h4 className="font-extrabold mb-2">📂 從原始碼 clone</h4>
                        <code className="block bg-gray-900 text-gray-100 text-sm font-mono p-3 rounded-lg break-all">git clone {td.repoUrl}</code>
                    </div>
                )}
                {!td.npmPackage && !td.configSnippet && !td.repoUrl && (
                    <div className="p-6 rounded-2xl bg-gray-50 dark:bg-gray-800 border border-dashed border-gray-300 dark:border-gray-700 text-[var(--color-text-mid)] font-bold">
                        🚧 進階設定資料還沒填。
                    </div>
                )}
            </div>
        );
    }

    // api
    return (
        <div className="flex flex-col gap-5">
            {td.endpoint && (
                <div>
                    <h4 className="font-extrabold mb-2">🔗 API Endpoint</h4>
                    <code className="block bg-gray-900 text-gray-100 text-sm font-mono p-3 rounded-lg break-all">{td.endpoint}</code>
                </div>
            )}
            {td.docsUrl && (
                <div>
                    <h4 className="font-extrabold mb-2">📖 API 文件</h4>
                    <a href={td.docsUrl} target="_blank" rel="noopener noreferrer" className="text-[var(--color-clay-purple)] font-bold underline break-all">{td.docsUrl}</a>
                </div>
            )}
            {td.sdkPackage && (
                <div>
                    <h4 className="font-extrabold mb-2">📦 SDK 套件</h4>
                    <code className="block bg-gray-900 text-gray-100 text-sm font-mono p-3 rounded-lg">{td.sdkPackage}</code>
                </div>
            )}
            {!td.endpoint && !td.docsUrl && !td.sdkPackage && (
                <div className="p-6 rounded-2xl bg-gray-50 dark:bg-gray-800 border border-dashed border-gray-300 dark:border-gray-700 text-[var(--color-text-mid)] font-bold">
                    🚧 API 資料還沒填。
                </div>
            )}
        </div>
    );
}

// ─── 「詳細說明」tab — desc (Pattern C) 在頂部 + blog.blocks ──────────────────
function DetailTab({ tool, blocks }) {
    return (
        <div className="flex flex-col gap-8">
            {tool.desc && (
                <div className="max-w-none">
                    <MarkdownContent>{tool.desc}</MarkdownContent>
                </div>
            )}
            {blocks.length > 0 && (
                <div className="flex flex-col gap-6 border-t border-[var(--color-card-border)] pt-8">
                    {blocks.map((block) => (
                        <BlockView key={block.id} block={block} />
                    ))}
                </div>
            )}
            {!descHtml && blocks.length === 0 && (
                <div className="text-center py-10 text-[var(--color-text-mid)] italic">
                    這個工具還沒有詳細說明。
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
    const [activeTab, setActiveTab] = useState('detail');

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
            const isPublic = ['live', 'beta', 'new', 'dev', 'terminated'].includes(data.status) || data.approval === 'approved';
            const isOwner = user && data.authorUid === user.uid;
            if (!isPublic && !isOwner && !isAdmin) { router.push('/'); return; }
            setTool(data);
            const blocks = (data.blog?.blocks || []).map(b => b.id ? b : { ...b, id: crypto.randomUUID() });
            setLocalBlocks(blocks);
            setLocalExtras({ url: data.url || '', type: data.type || 'webapp' });
            // 預設 tab：有「快速安裝」(download/doc/mcp) 就先顯示它；其他預設「詳細說明」
            const type = data.type || 'webapp';
            setActiveTab(
                type === 'embedded' ? 'deploy'
                : ['download', 'doc', 'mcp'].includes(type) ? 'quick'
                : 'detail'
            );
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
    const addBlock = (type) => setLocalBlocks(bs => [...bs, { id: crypto.randomUUID(), type, content: '', caption: '' }]);

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
            alert(error.code === 'permission-denied' ? '儲存失敗：你沒有編輯此工具的權限' : '儲存失敗，請稍後再試');
        }
        setIsSaving(false);
    };

    if (loading || authLoading) return <p className="text-center py-20 text-[var(--color-text-mid)]">載入中，請稍候…</p>;
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
                                <button onClick={() => { setIsEditMode(false); setLocalBlocks((tool.blog?.blocks || []).map(b => b.id ? b : { ...b, id: crypto.randomUUID() })); }} className="px-5 py-2.5 rounded-full bg-[var(--color-card-bg)] font-extrabold text-[var(--color-text-mid)] border border-[var(--color-card-border)] transition-all">
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
                            ? (tool.url || tool.typeData?.fileUrl || tool.versions?.at(-1)?.fileUrl || '')
                            : tool.url;
                        const isDisabled = ['dev', 'pending'].includes(tool.status);
                        if (isDisabled) {
                            return (
                                <div className="mt-6 pt-6 border-t border-[var(--color-card-border)] flex justify-center">
                                    <div className="w-full text-center px-6 py-4 rounded-xl font-extrabold bg-gray-200 text-gray-500 cursor-not-allowed">
                                        🚧 開發中，敬請期待
                                    </div>
                                </div>
                            );
                        }
                        if (tool.status === 'terminated') {
                            return (
                                <div className="mt-6 pt-6 border-t border-[var(--color-card-border)] flex justify-center">
                                    <div className="w-full text-center px-6 py-4 rounded-xl font-extrabold bg-red-100 text-red-600 cursor-not-allowed">
                                        ⛔ 已終止維護
                                    </div>
                                </div>
                            );
                        }
                        // 場域工具：沒有啟動連結，提示去看「部署資訊」tab
                        if (tool.type === 'embedded') {
                            return (
                                <div className="mt-6 pt-6 border-t border-[var(--color-card-border)] flex justify-center">
                                    <div className="w-full text-center px-6 py-4 rounded-xl font-extrabold bg-indigo-50 text-indigo-600 border border-indigo-200">
                                        📍 場域工具，請看右側部署資訊
                                    </div>
                                </div>
                            );
                        }
                        if (!url) return null;
                        const cta = TYPE_ACTION[tool.type] || TYPE_ACTION.webapp;
                        return (
                            <div className="mt-6 pt-6 border-t border-[var(--color-card-border)] flex justify-center">
                                <a
                                    href={url} target="_blank" rel="noopener noreferrer"
                                    className={`w-full text-center px-6 py-4 rounded-xl font-extrabold shadow-md hover:shadow-lg transition-all ${cta.cls}`}
                                >
                                    {cta.label}
                                </a>
                            </div>
                        );
                    })()}
                </aside>

                {/* ── MAIN CONTENT ── */}
                <main className="flex-1 bg-[var(--color-card-bg)] rounded-[32px] p-8 md:p-12 shadow-sm border border-[var(--color-card-border)] min-w-0">

                    {isEditMode ? (
                        <>
                            <h2 className="text-2xl font-black text-[var(--color-text-dark)] mb-8 flex items-center gap-3 border-b-2 border-[var(--color-card-border)] pb-4">
                                <span className="text-[var(--color-clay-purple)]">📄</span> 工具說明書（編輯模式）
                            </h2>
                            <div className="flex flex-col gap-6">
                                {localBlocks.length === 0 && (
                                    <div className="text-center py-10 border-2 border-dashed border-[var(--color-clay-purple)]/30 rounded-2xl text-[var(--color-text-mid)]">
                                        <p className="font-bold text-lg mb-1">說明書還是空的</p>
                                        <p className="text-sm font-bold">用下方按鈕新增第一個 block</p>
                                    </div>
                                )}
                                {localBlocks.map((block, idx) => (
                                    <BlockEditor
                                        key={block.id}
                                        block={block}
                                        idx={idx}
                                        total={localBlocks.length}
                                        onChange={(updated) => updateBlock(idx, updated)}
                                        onDelete={() => deleteBlock(idx)}
                                        onMove={moveBlock}
                                    />
                                ))}
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
                            </div>
                        </>
                    ) : (
                        <DetailTabs tool={tool} blocks={localBlocks} activeTab={activeTab} setActiveTab={setActiveTab} />
                    )}
                </main>
            </div>
        </div>
    );
}
