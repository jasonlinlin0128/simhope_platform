'use client';

import { useState, useRef, useEffect } from 'react';

export default function ChatbotWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([
    { role: 'bot', text: '嗨！我是 SimHope AI 小幫手 🤖\n有什麼工作上的問題，我來幫你找工具或想辦法！' },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text }]);
    setLoading(true);
    // Placeholder response — replace with real API call when ready
    await new Promise(r => setTimeout(r, 800));
    setMessages(prev => [
      ...prev,
      { role: 'bot', text: '感謝你的問題！目前 AI 回覆功能正在建置中，你可以先到「工具總覽」看看有沒有現成的工具，或寄信到 it@simhope.com.tw 提出需求。' },
    ]);
    setLoading(false);
  };

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      {/* Chat panel */}
      {open && (
        <div className="w-80 bg-white dark:bg-gray-900 rounded-2xl shadow-[0_16px_48px_rgba(0,0,0,0.18)] border border-gray-100 dark:border-gray-700 flex flex-col overflow-hidden" style={{ maxHeight: '26rem' }}>
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-violet-500 to-blue-500">
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-lg">🤖</div>
            <div className="flex-1">
              <div className="font-extrabold text-white text-sm leading-tight">SimHope AI 小幫手</div>
              <div className="text-white/70 text-xs">有問題直接說！</div>
            </div>
            <button onClick={() => setOpen(false)} className="text-white/80 hover:text-white text-lg leading-none">✕</button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[80%] rounded-xl px-3 py-2 text-sm font-semibold leading-relaxed whitespace-pre-wrap ${
                    m.role === 'user'
                      ? 'bg-gradient-to-br from-violet-500 to-blue-500 text-white'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-100'
                  }`}
                >
                  {m.text}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-gray-100 dark:bg-gray-800 rounded-xl px-4 py-2 text-sm text-gray-400 dark:text-gray-500">
                  <span className="animate-pulse">輸入中…</span>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="px-3 py-3 border-t border-gray-100 dark:border-gray-700 flex gap-2">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="說說你的問題…"
              rows={1}
              className="flex-1 resize-none rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-sm text-gray-800 dark:text-gray-100 px-3 py-2 outline-none focus:border-violet-400 transition-colors font-semibold"
            />
            <button
              onClick={send}
              disabled={!input.trim() || loading}
              className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-blue-500 text-white flex items-center justify-center text-base disabled:opacity-40 hover:opacity-90 transition-opacity flex-shrink-0"
            >
              ↑
            </button>
          </div>
        </div>
      )}

      {/* Floating button */}
      <button
        onClick={() => setOpen(o => !o)}
        aria-label="開啟 AI 助手"
        className="w-14 h-14 rounded-full bg-gradient-to-br from-violet-500 to-blue-500 text-white text-2xl flex items-center justify-center shadow-[0_8px_24px_rgba(139,92,246,0.5)] hover:scale-110 hover:shadow-[0_12px_32px_rgba(139,92,246,0.65)] transition-all"
      >
        {open ? '✕' : '🤖'}
      </button>
    </div>
  );
}
