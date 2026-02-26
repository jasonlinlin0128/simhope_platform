/**
 * SimHope 工具箱 — 共用資料層
 * 所有資料存於 localStorage，index.html 與 admin.html 共享。
 */

const DB = {
    KEYS: {
        TOOLS: 'simhope_tools_v3',
        SITE: 'simhope_site_v2',
        PAIN: 'simhope_pain_v2',
    },

    // ── 預設工具資料 ──
    DEFAULT_TOOLS: [
        {
            id: 't1', order: 0, color: 'c1',
            icon: '🌏',
            title: '現場即時翻譯',
            tagline: '泰文 ↔ 中文 ↔ 英文，三語即時切換',
            desc: '專為工廠現場溝通設計，操作介面超大字、按鈕明顯，師傅自己就能操作，不需要透過翻譯人員轉達。',
            dept: 'factory',
            steps: ['選語言', '說話或打字', '看翻譯結果'],
            status: 'live',
            url: '#',
            tags: ['翻譯', '多語言', '現場使用'],
        },
        {
            id: 't2', order: 1, color: 'c2',
            icon: '📄',
            title: '合約快速審查',
            tagline: '5 分鐘找出合約裡的地雷條款',
            desc: '上傳 PDF 或 Word 合約，AI 自動掃描並用黃色標記異常用語、不合理條件、可能的法律風險，提供修改建議。',
            dept: 'admin',
            steps: ['上傳合約', '等 AI 分析', '查看風險點'],
            status: 'live',
            url: '#',
            tags: ['合約', '法律', '風險分析'],
        },
        {
            id: 't3a', order: 2, color: 'c3',
            icon: '⚙️',
            title: '加工部日報表',
            tagline: '工單、工時、工序，線上填報即時統計',
            desc: '加工部員工每日填寫工單號、工序、工時，主管即時查看產線進度，系統自動彙整月報，告別紙本日報與 LINE 回報。',
            dept: 'factory',
            steps: ['填工單工序', '主管審核', '月報匯出'],
            status: 'live',
            url: 'https://daily-report-staging-ccf2a.web.app/',
            tags: ['工時', '日報', '加工部'],
        },
        {
            id: 't3b', order: 3, color: 'c4',
            icon: '📅',
            title: '電控部日報表',
            tagline: '專案、工時代碼、任務狀態，一站管理',
            desc: '電控部員工線上填寫每日專案工時與工時代碼，支援有無訂單單號的任務，主管即時查看進度，系統自動統計月報。',
            dept: 'mgmt',
            steps: ['填專案工時', '主管審核', '月報匯出'],
            status: 'live',
            url: 'https://daily-report-electrical.web.app/',
            tags: ['工時', '日報', '電控部'],
        },
        {
            id: 't4', order: 4, color: 'c5',
            icon: '🔍',
            title: '內部文件問答庫',
            tagline: '把 SOP 跟技術文件變成可以問答的知識庫',
            desc: '把公司 SOP、圖面說明、技術規範全部上傳，之後直接用中文問問題，AI 從文件裡找答案，不再靠問老師傅或翻目錄。',
            dept: 'defense',
            steps: ['上傳文件', '輸入問題', '直接看答案'],
            status: 'beta',
            url: '#',
            tags: ['RAG', '知識庫', 'SOP'],
        },
        {
            id: 't5', order: 5, color: 'c6',
            icon: '📝',
            title: '說明書自動生成',
            tagline: '輸入規格，自動輸出中英日三語草稿',
            desc: '輸入產品型號、規格參數與注意事項，AI 依照標準格式生成完整說明書草稿，節省 80% 的撰寫時間，再自行校對即可。',
            dept: 'admin',
            steps: ['填入規格', '選擇語言', '下載草稿'],
            status: 'new',
            url: '#',
            tags: ['文件', '多語言', '自動化'],
        },
        {
            id: 't6', order: 6, color: 'c1',
            icon: '🔬',
            title: '外觀瑕疵 AI 檢測',
            tagline: '拍一張照，AI 幫你找瑕疵和位置',
            desc: '拍攝產品外觀照片上傳，AI 對比標準影像，自動標記瑕疵的位置與類型，輸出結構化檢測報告。',
            dept: 'quality',
            steps: ['拍/上傳照片', 'AI 比對分析', '查看檢測報告'],
            status: 'beta',
            url: '#',
            tags: ['品管', '視覺AI', '檢測'],
        },
    ],

    // ── 預設網站設定 ──
    DEFAULT_SITE: {
        siteName: 'SimHope AI 工具中心',
        heroTitle: '日常痛點太多？這裡有現成的 AI 解法',
        heroDesc: '這些工具都是根據公司實際流程開發的，不需要懂 AI，打開就能用。',
        heroEyebrow: '🏭 專為公司同仁設計的 AI 工具中心',
        painChips: [
            { emoji: '📄', text: '文件找半天' },
            { emoji: '🌏', text: '語言溝通卡關' },
            { emoji: '📊', text: '報表要手動填' },
            { emoji: '🔍', text: 'SOP 翻了找不到' },
            { emoji: '⏰', text: '工時統計耗時' },
        ],
        aboutName: 'SimHope',
        aboutRole: 'AI 導入負責人',
        aboutDept: '電控部 · 壓鑄機 / 國防工業',
        aboutBio: '在傳統製造業工作，每天面對的都是實際的生產與管理問題。這個平台收錄的是我用 AI 工具實際解決公司問題的成果。<strong>不是展示技術，是解決你我的工作困擾。</strong>',
        ctaEmail: 'placeholder@company.com',
        statTools: 7,
        statUsers: 12,
        statHours: 8,
    },

    // ── 部門定義 ──
    DEPTS: {
        factory: { label: '🏭 生產現場', cls: 'dept-factory' },
        admin: { label: '📋 行政/文書', cls: 'dept-admin' },
        mgmt: { label: '👔 主管/管理', cls: 'dept-mgmt' },
        quality: { label: '🔧 品管/工程', cls: 'dept-quality' },
        defense: { label: '🛡️ 國防/專案', cls: 'dept-defense' },
        other: { label: '🔹 其他', cls: 'dept-admin' },
    },

    // ── 狀態定義 ──
    STATUSES: {
        live: { label: '使用中', cls: 'status-live' },
        beta: { label: '測試中', cls: 'status-beta' },
        new: { label: '新上線', cls: 'status-new' },
    },

    // ── CRUD 方法 ──
    getTools() {
        try {
            const raw = localStorage.getItem(this.KEYS.TOOLS);
            return raw ? JSON.parse(raw) : JSON.parse(JSON.stringify(this.DEFAULT_TOOLS));
        } catch { return JSON.parse(JSON.stringify(this.DEFAULT_TOOLS)); }
    },

    saveTools(tools) {
        localStorage.setItem(this.KEYS.TOOLS, JSON.stringify(tools));
    },

    getSite() {
        try {
            const raw = localStorage.getItem(this.KEYS.SITE);
            return raw ? { ...this.DEFAULT_SITE, ...JSON.parse(raw) } : { ...this.DEFAULT_SITE };
        } catch { return { ...this.DEFAULT_SITE }; }
    },

    saveSite(site) {
        localStorage.setItem(this.KEYS.SITE, JSON.stringify(site));
    },

    generateId() {
        return 't_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    },
};
