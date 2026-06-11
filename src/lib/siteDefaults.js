// src/lib/siteDefaults.js
// 站台預設內容（無 firebase 依賴）。painCards 供「painCards 集合為空」時後備用。
// 從 db.js 抽出，讓 server 資料層（serverCatalog.js）可 import 而不拉進 client SDK。

export const DEFAULT_SITE = {
  heroEyebrow: "企業 AI 轉型解決方案",
  heroDesc:
    "為公司各部門量身打造的實用 AI 小工具，專注於解決重複性行政作業、翻譯溝通限制與資料整理的瓶頸。免安裝、免學習，即開即用！",
  painChips: [
    { emoji: "⏱️", text: "省下 80% 時間" },
    { emoji: "💡", text: "免寫程式" },
    { emoji: "🔗", text: "無縫整合" },
  ],
  painCards: [
    {
      id: "pc1",
      folder: "跨國溝通專案",
      scenarios: ["生產現場", "跨國溝通"],
      before: "泰籍員工溝通靠比手畫腳，品質問題說不清楚，主管也搞不定",
      after: "即時雙語翻譯，泰文中文一鍵切換，現場手機直接用",
    },
    {
      id: "pc2",
      folder: "法務專案",
      scenarios: ["法務合約", "風險控管"],
      before: "合約文件幾十頁，看完要好幾小時，還不確定有沒有問題條款",
      after: "上傳合約，5 分鐘內 AI 標出所有異常條款與風險點",
    },
    {
      id: "pc3",
      folder: "日報表專案",
      scenarios: ["專案管理", "主管稽核"],
      before: "工時用 LINE 回報，每次月底統計都要重新整理，錯誤一堆",
      after: "每人直接線上填，主管即時查看進度，月報一鍵匯出",
    },
    {
      id: "pc6",
      folder: "知識庫專案",
      scenarios: ["技術傳承", "教育訓練"],
      before: "內部 SOP、技術文件散落各處，問老師傅不一定問得到",
      after: "把文件全部上傳，建立私有知識庫，直接用中文問問題",
    },
    {
      id: "pc7",
      folder: "行政作業專案",
      scenarios: ["行政簽核"],
      before: "PDF 簽名要列印、蓋章、再掃描，一份文件來回 20 分鐘",
      after: "電子簽章工具直接在 PDF 上加簽，批量處理省三倍時間",
    },
    {
      id: "pc8",
      scenarios: ["行政簽核"],
      before: "出差單還在用紙本，要跑三個單位簽核，回來才能報帳",
      after: "線上填出差申請，主管線上審核，總務即時確認",
    },
    {
      id: "pc9",
      scenarios: ["機敏資料", "資安控管"],
      before: "機敏文件影印無法追蹤，不知道誰在什麼時候印了什麼",
      after: "影印自動加時間戳浮水印，所有文件可追溯",
    },
    {
      id: "pc10",
      folder: "文書作業專案",
      scenarios: ["文書處理"],
      before: "掃描的 PDF 一堆空白頁，手動一頁一頁刪很浪費時間",
      after: "一鍵自動偵測並清除所有空白頁，省下大量整理時間",
    },
    {
      id: "pc11",
      folder: "日報表專案",
      scenarios: ["生產現場", "報表轉換"],
      before: "MasterCAM 報表格式不符需求，每次都要手動重整資料",
      after: "外掛一鍵匯出客製化加工報表，格式直接對齊需求",
    },
  ],
};
