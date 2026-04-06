'use client';

import { useState } from 'react';

export default function AIPanel({ onGenerate, isGenerating }) {
    const [prompt, setPrompt] = useState('');
    const [isOpen, setIsOpen] = useState(false);

    const handleSumbit = () => {
        if (!prompt.trim()) {
            alert('⚠️ 請先輸入一句話描述你的工具！');
            return;
        }
        onGenerate(prompt);
    };

    return (
        <div className="mb-6">
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-gradient-to-r from-purple-100 to-blue-100 text-[var(--color-clay-purple)] font-black text-sm hover:shadow-md transition-all border border-purple-200"
            >
                🪄 請 AI 幫我填寫
            </button>

            {isOpen && (
                <div className="mt-3 p-5 rounded-2xl bg-gradient-to-br from-[#FAEDFF] to-white border-2 border-purple-200/60 shadow-inner relative overflow-hidden animate-fade-in-down">
                    <div className="flex gap-3 mb-3 items-center">
                        <span className="text-2xl animate-bounce">🤖</span>
                        <div className="flex-1">
                            <h4 className="font-extrabold text-[#7E22CE] text-sm">魔術自動生成器</h4>
                            <p className="text-xs text-purple-600/80 font-bold">一句話描述你的工具，AI 幫你寫超吸睛文案！</p>
                        </div>
                    </div>

                    <textarea
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder="例如：這是一個可以即時把泰文翻譯成中文語音的手機小工具..."
                        className="w-full bg-white/60 p-4 rounded-xl border border-purple-100 placeholder-purple-300 text-sm focus:border-purple-300 focus:ring-2 focus:ring-purple-200 outline-none transition-all resize-none !h-[80px]"
                    ></textarea>

                    <button
                        type="button"
                        onClick={handleSumbit}
                        disabled={isGenerating}
                        className="mt-3 w-full py-3 rounded-xl bg-gradient-to-r from-[#9333EA] to-[#6366f1] text-white font-extrabold text-sm shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all relative overflow-hidden"
                    >
                        {isGenerating ? (
                            <span className="flex items-center justify-center gap-2">
                                <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                AI 文案撰寫中... 勿離開畫面
                            </span>
                        ) : '✨ 魔術生成'}
                    </button>
                    
                    {isGenerating && (
                        <div className="absolute inset-0 bg-white/40 backdrop-blur-[2px] z-10 flex items-center justify-center"></div>
                    )}
                </div>
            )}
        </div>
    );
}
