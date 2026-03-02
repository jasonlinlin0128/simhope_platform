/**
 * SimHope 工具箱 — 共用資料層
 * 所有資料存於 localStorage，index.html 與 admin.html 共享。
 */

const DB = {
    KEYS: {
        TOOLS: 'simhope_tools_v4',
        SITE: 'simhope_site_v2',
        PAIN: 'simhope_pain_v2',
    },

    // ── 預設工具資料 ──
    DEFAULT_TOOLS: [
        // ── 已上線工具 ──
        {
            id: 't1', order: 0, color: 'c1', type: 'webapp',
            icon: '🌏', title: '現場即時翻譯',
            tagline: '泰文 ↔ 中文 ↔ 英文，三語即時切換',
            desc: '專為工廠現場溝通設計，操作介面超大字、按鈕明顯，師傅自己就能操作，不需要透過翻譯人員轉達。',
            dept: 'factory', steps: ['選語言', '說話或打字', '看翻譯結果'],
            status: 'live', url: '#', tags: ['翻譯', '多語言', '現場使用']
        },
        {
            id: 't2', order: 1, color: 'c2', type: 'webapp',
            icon: '📄', title: '合約快速審查',
            tagline: '5 分鐘找出合約裡的地雷條款',
            desc: '上傳 PDF 或 Word 合約，AI 自動掃描並用黃色標記異常用語、不合理條件、可能的法律風險，提供修改建議。',
            dept: 'admin', steps: ['上傳合約', '等 AI 分析', '查看風險點'],
            status: 'live', url: '#', tags: ['合約', '法律', '風險分析']
        },
        {
            id: 't3a', order: 2, color: 'c3', type: 'webapp',
            icon: '⚙️', title: '加工部日報表',
            tagline: '工單、工時、工序，線上填報即時統計',
            desc: '加工部員工每日填寫工單號、工序、工時，主管即時查看產線進度，系統自動彙整月報，告別紙本日報與 LINE 回報。',
            dept: 'factory', steps: ['填工單工序', '主管審核', '月報匯出'],
            status: 'live', url: 'https://daily-report-staging-ccf2a.web.app/', tags: ['工時', '日報', '加工部']
        },
        {
            id: 't3b', order: 3, color: 'c4', type: 'webapp',
            icon: '📅', title: '電控部日報表',
            tagline: '專案、工時代碼、任務狀態，一站管理',
            desc: '電控部員工線上填寫每日專案工時與工時代碼，支援有無訂單單號的任務，主管即時查看進度，系統自動統計月報。',
            dept: 'mgmt', steps: ['填專案工時', '主管審核', '月報匯出'],
            status: 'live', url: 'https://daily-report-electrical.web.app/', tags: ['工時', '日報', '電控部']
        },
        {
            id: 't4', order: 4, color: 'c5', type: 'webapp',
            icon: '🔍', title: '內部文件問答庫',
            tagline: '把 SOP 跟技術文件變成可以問答的知識庫',
            desc: '把公司 SOP、圖面說明、技術規範全部上傳，之後直接用中文問問題，AI 從文件裡找答案，不再靠問老師傅或翻目錄。',
            dept: 'defense', steps: ['上傳文件', '輸入問題', '直接看答案'],
            status: 'beta', url: '#', tags: ['RAG', '知識庫', 'SOP']
        },
        {
            id: 't5', order: 5, color: 'c6', type: 'webapp',
            icon: '📝', title: '說明書自動生成',
            tagline: '輸入規格，自動輸出中英日三語草稿',
            desc: '輸入產品型號、規格參數與注意事項，AI 依照標準格式生成完整說明書草稿，節省 80% 的撰寫時間，再自行校對即可。',
            dept: 'admin', steps: ['填入規格', '選擇語言', '下載草稿'],
            status: 'new', url: '#', tags: ['文件', '多語言', '自動化']
        },
        {
            id: 't6', order: 6, color: 'c1', type: 'webapp',
            icon: '🔬', title: '外觀瑕疵 AI 檢測',
            tagline: '拍一張照，AI 幫你找瑕疵和位置',
            desc: '拍攝產品外觀照片上傳，AI 對比標準影像，自動標記瑕疵的位置與類型，輸出結構化檢測報告。',
            dept: 'quality', steps: ['拍/上傳照片', 'AI 比對分析', '查看檢測報告'],
            status: 'beta', url: '#', tags: ['品管', '視覺AI', '檢測']
        },

        // ── 已上線：下載 / 展示型 ──
        {
            id: 't12', order: 7, color: 'c2', type: 'download',
            icon: '✍️', title: '批量電子簽章工具',
            tagline: '在 PDF 上加文字、簽名，一次處理多頁',
            desc: '能夠在 PDF 上新增任意文字及簽名檔，加速紙本流程數位化，免去手動列印署名再掃描的麻煩。',
            dept: 'admin', steps: ['開啟工具', '選 PDF', '加簽後匯出'],
            status: 'live', url: '', tags: ['簽章', 'PDF', '行政'],
            files: []
        },
        {
            id: 't13', order: 8, color: 'c3', type: 'webapp',
            icon: '🗑️', title: '空白頁清除工具',
            tagline: '一鍵刪掉大量 PDF / 圖檔中的空白頁',
            desc: '大量文件（.pdf）或大量圖檔（.jpg/.png/.jpeg）能夠刪除完全沒有內容（空白）的頁面，節省整理時間。',
            dept: 'admin', steps: ['上傳檔案', '自動偵測', '下載結果'],
            status: 'live', url: 'https://ai.studio/apps/drive/1zUeMtM4QwhzuASpy3-xdCAIL2tFC4sdh',
            tags: ['PDF', '圖檔', '自動化']
        },
        {
            id: 't14', order: 9, color: 'c4', type: 'download',
            icon: '🕐', title: '修改檔案日期工具',
            tagline: '任意調整電腦檔案的建立與修改時間',
            desc: '能夠修改電腦檔案的建立時間跟修改時間，適用需要對齊文件日期或整理歷史檔案的場景。',
            dept: 'admin', steps: ['開啟工具', '選目標檔案', '設定日期存檔'],
            status: 'live', url: '', tags: ['系統工具', '檔案管理', '行政'],
            files: []
        },
        {
            id: 't15', order: 10, color: 'c5', type: 'showcase',
            icon: '🤖', title: 'Teams Bot（RAG 聊天機器人）',
            tagline: '直接在 Teams 裡問問題，AI 從公司文件找答案',
            desc: '透過 Teams 代理程式設定 RAG 及 chatbot，讓 User 能夠使用公司知識庫，無需切換其他平台。',
            dept: 'defense', steps: ['在 Teams 提問', 'AI 搜尋文件', '取得即時回答'],
            status: 'live', url: '', tags: ['Teams', 'RAG', 'chatbot'],
            blog: { summary: '這是我在 Teams 上整合 RAG 聊天機器人的完整歷程，從技術選型到最終上線。', sections: [] }
        },
        {
            id: 't16', order: 11, color: 'c6', type: 'download',
            icon: '🔄', title: '轉檔工具',
            tagline: '圖片 ↔ PDF 格式互轉，批量處理不費力',
            desc: '能夠圖片檔與 PDF 檔檔案格式互轉，支援批量操作，日常文件整理必備小工具。',
            dept: 'admin', steps: ['選檔案', '選目標格式', '下載轉檔結果'],
            status: 'live', url: '', tags: ['轉檔', 'PDF', '圖片'],
            files: []
        },

        // ── 待驗收 ──
        {
            id: 't11', order: 12, color: 'c1', type: 'webapp',
            icon: '✈️', title: '遠地出差工具',
            tagline: '出差單數位化，總務提升行政效率',
            desc: '遠地出差單數位化，總務能夠提升行政效率，減少紙本單據往返，線上填寫、線上審核。',
            dept: 'admin', steps: ['填出差申請', '主管審核', '總務確認'],
            status: 'pending', url: 'https://travel-allowance-system.vercel.app/', tags: ['出差', '行政', '數位化']
        },

        // ── 開發中 ──
        {
            id: 't8', order: 13, color: 'c2', type: 'webapp',
            icon: '🖨️', title: '機敏辦公室影印機浮水印',
            tagline: '機敏區影印自動加時間戳浮水印',
            desc: '放置在機敏資料存放區的影印機，若有人使用影印機，印出的紙本會有 yyyy/mm/dd/hh/mm/ss 的浮水印在背景，強化資安追蹤。',
            dept: 'defense', steps: ['正常使用影印機', '文件自動加浮水印', '浮水印含時間戳'],
            status: 'dev', url: 'https://ai.studio/apps/drive/1o5dgQuyKjMCVZJ3Pn9_RXidP8usVX27C',
            tags: ['資安', '浮水印', '影印機']
        },
        {
            id: 't9', order: 14, color: 'c3', type: 'showcase',
            icon: '🛠️', title: 'MasterCAM2025 外掛報表',
            tagline: '讓加工部輸出更符合自己需求的加工機報表',
            desc: '讓加工部同仁能夠輸出更符合自己需求的加工機報表資料，取代原本的手動整理流程。',
            dept: 'factory', steps: ['在 MasterCAM 操作', '觸發外掛', '匯出客製報表'],
            status: 'dev', url: '', tags: ['MasterCAM', '加工', '報表'],
            blog: { summary: 'MasterCAM 2025 外掛開發記錄，包含技術研究過程與截圖。', sections: [] }
        },
        {
            id: 't10', order: 15, color: 'c4', type: 'webapp',
            icon: '📆', title: 'SimHope 行事曆',
            tagline: '自行開發，補足 TimeTree 與 Notion 的不足',
            desc: '自行開發行事曆應用，補足 TimeTree 及 Notion 在公司使用情境的不足之處，全體同仁可使用。',
            dept: 'admin', steps: ['登入行事曆', '新增或查看行程', '共享給同仁'],
            status: 'dev', url: 'https://simhope-calendar.vercel.app', tags: ['行事曆', '協作', '自建工具']
        },

        // ── 已終止 ──
        {
            id: 't7', order: 16, color: 'c1', type: 'webapp',
            icon: '📦', title: '物管籌料數位化作業系統',
            tagline: '即時顯示所有工單的籌料進度看板',
            desc: '建立一個數位化看板，即時顯示所有工單的籌料進度（待料/備料中/已備齊），解決物料籌備狀態依賴人工紙本非同步傳遞的問題。',
            dept: 'factory', steps: ['掃描工單', '更新備料狀態', '產線即時獲知'],
            status: 'terminated', url: 'https://gemini.google.com/u/1/share/12af59b97d59', tags: ['物管', '生管', '看板']
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
        painCards: [
            { id: 'pc1', dept: 'factory', before: '泰籍員工溝通靠比手畫腳，品質問題說不清楚，主管也搞不定', after: '即時雙語翻譯，泰文中文一鍵切換，現場手機直接用' },
            { id: 'pc2', dept: 'admin', before: '合約文件幾十頁，看完要好幾小時，還不確定有沒有問題條款', after: '上傳合約，5 分鐘內 AI 標出所有異常條款與風險點' },
            { id: 'pc3', dept: 'mgmt', before: '工時用 LINE 回報，每次月底統計都要重新整理，錯誤一堆', after: '每人直接線上填，主管即時查看進度，月報一鍵匯出' },
            { id: 'pc4', dept: 'quality', before: '外觀檢查靠人工目視，人一累就容易漏判，客訴不斷', after: '拍照上傳，AI 自動比對標準圖樣，標出瑕疵位置與類型' },
            { id: 'pc5', dept: 'admin', before: '產品說明書每次改規格就要重寫，翻譯成英文又要外包，費時費錢', after: '輸入規格，自動生成中英日三語說明書草稿，自己修改即可' },
            { id: 'pc6', dept: 'defense', before: '內部 SOP、技術文件散落各處，問老師傅不一定問得到', after: '把文件全部上傳，建立私有知識庫，直接用中文問問題' },
            { id: 'pc7', dept: 'admin', before: 'PDF 簽名要列印、蓋章、再掃描，一份文件來回 20 分鐘', after: '電子簽章工具直接在 PDF 上加簽，批量處理省三倍時間' },
            { id: 'pc8', dept: 'admin', before: '出差單還在用紙本，要跑三個單位簽核，回來才能報帳', after: '線上填出差申請，主管線上審核，總務即時確認' },
            { id: 'pc9', dept: 'defense', before: '機敏文件影印無法追蹤，不知道誰在什麼時候印了什麼', after: '影印自動加時間戳浮水印，所有文件可追溯' },
            { id: 'pc10', dept: 'admin', before: '掃描的 PDF 一堆空白頁，手動一頁一頁刪很浪費時間', after: '一鍵自動偵測並清除所有空白頁，省下大量整理時間' },
            { id: 'pc11', dept: 'factory', before: 'MasterCAM 報表格式不符需求，每次都要手動重整資料', after: '外掛一鍵匯出客製化加工報表，格式直接對齊需求' },
        ],
        aboutName: 'SimHope',
        aboutRole: 'AI 導入負責人',
        aboutDept: '電控部 · 壓鑄機 / 國防工業',
        aboutBio: '在傳統製造業工作，每天面對的都是實際的生產與管理問題。這個平台收錄的是我用 AI 工具實際解決公司問題的成果。<strong>不是展示技術，是解決你我的工作困擾。</strong>',
        ctaEmail: 'placeholder@company.com',
        statTools: 17,
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
        dev: { label: '開發中', cls: 'status-dev' },
        pending: { label: '待驗收', cls: 'status-pending' },
        terminated: { label: '已終止', cls: 'status-terminated' },
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
