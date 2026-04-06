export default function PainCard({ card }) {
    const { before, after, scenarios } = card;
    const scs = (scenarios && Array.isArray(scenarios)) ? scenarios : ['未分類'];
    
    return (
        <div className="bg-[var(--color-card-bg)] rounded-[24px] p-5 shadow-sm border border-[var(--color-card-border)] hover:shadow-lg transition-shadow relative overflow-hidden group h-full flex flex-col">
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-[var(--color-clay-purple)]/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-bl-full pointer-events-none"></div>
            
            <div className="flex gap-2 flex-wrap mb-4 relative z-10">
                {scs.map((s, idx) => (
                    <span key={idx} className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm text-[0.75rem] px-2.5 py-1 rounded-full font-bold text-[var(--color-clay-purple)] shadow-sm border border-gray-100/50">
                        {s}
                    </span>
                ))}
            </div>
            
            <div className="flex flex-col gap-3 flex-1 relative z-10">
                <div className="bg-red-50 text-red-900 border border-red-100/60 rounded-2xl p-3.5 pr-4 text-[0.95rem] font-bold shadow-sm leading-snug">
                    <span className="mr-1">😓</span> {before}
                </div>
                
                <div className="flex justify-center -my-3 z-20 relative">
                    <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center text-gray-400 font-black shadow-md border-2 border-green-100">
                        ↓
                    </div>
                </div>
                
                <div className="bg-green-50 text-green-900 border border-green-200/50 rounded-2xl p-3.5 pr-4 text-[0.95rem] font-bold shadow-sm leading-snug flex-1">
                    <span className="mr-1">✅</span> {after}
                </div>
            </div>
        </div>
    );
}
