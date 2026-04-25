/**
 * seed-tool-content.mjs
 * 一次性腳本：把 15 個工具的 blog.summary + blog.blocks 草稿寫入 Firestore。
 *
 * === 執行前準備 ===
 * 1. npm install firebase-admin --save-dev
 * 2. Firebase Console → 專案設定 → 服務帳戶 → 產生新的私密金鑰 → 存成 serviceAccountKey.json
 *    把 serviceAccountKey.json 放在專案根目錄（已在 .gitignore，不會上傳）
 * 3. node scripts/seed-tool-content.mjs
 *
 * === 注意 ===
 * - 腳本用「工具名稱」比對 Firestore 文件，名稱必須與 Firestore 內的 title 完全一致。
 * - image block 的 content 目前為空字串，請在執行後到 /tool/{id} 的 block editor 貼上截圖 URL。
 * - 已有 blog.summary 的工具（t15、t9）會被覆蓋為新草稿，如需保留請先刪除該項目。
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { randomUUID } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const serviceAccount = JSON.parse(
    readFileSync(join(__dirname, '..', 'serviceAccountKey.json'), 'utf8')
);

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const uid = () => randomUUID();

// ─── 工具內容草稿 ──────────────────────────────────────────────────────────────
// 每個工具：title（用於查找文件）+ summary + blocks
// image block 的 content 請之後補截圖 URL，caption 請填說明文字（也是 alt）
const TOOL_DRAFTS = [

    // ── 現場即時翻譯 ──────────────────────────────────────────────────────────
    {
        title: '現場即時翻譯',
        summary: '這是我在工廠現場為泰籍員工打造的即時三語翻譯工具，解決跨語言溝通效率問題。',
        blocks: [
            {
                id: uid(), type: 'text',
                content: '## 為什麼做這個工具\n工廠現場有泰籍員工，溝通靠比手畫腳或仰賴中間人轉達，遇到品質問題或緊急狀況時往往說不清楚。這個工具把翻譯直接帶進現場——介面**大字大按鈕**，師傅不需要懂技術就能自己操作，支援**泰文、中文、英文**三語即時切換。',
            },
            {
                id: uid(), type: 'steps',
                content: '選擇你要說的語言\n說話或打字輸入內容\n對方看到翻譯結果，溝通完成',
            },
            {
                id: uid(), type: 'image',
                content: '', // ← 請填入截圖 URL
                caption: '現場即時翻譯工具的操作畫面',
            },
            {
                id: uid(), type: 'tip',
                content: '這個工具設計給非技術背景的現場師傅使用，直接開啟連結即可，不需安裝任何 App。',
            },
        ],
    },

    // ── 合約快速審查 ──────────────────────────────────────────────────────────
    {
        title: '合約快速審查',
        summary: '讓法務或採購同仁 5 分鐘內掌握合約風險，不再靠逐頁慢讀。',
        blocks: [
            {
                id: uid(), type: 'text',
                content: '## 解決什麼問題\n合約文件動輒數十頁，閱讀耗時且容易遺漏異常條款。這個工具透過 AI 自動掃描合約全文，**標記出不合理條件、可能引發糾紛的用語和法律風險點**，並提供修改建議，讓非法律背景的同仁也能快速做出判斷。',
            },
            {
                id: uid(), type: 'steps',
                content: '上傳 PDF 或 Word 格式的合約\n等待 AI 自動分析（約 1–3 分鐘）\n查看風險標記與修改建議',
            },
            {
                id: uid(), type: 'image',
                content: '', // ← 請填入截圖 URL
                caption: 'AI 掃描後的合約風險標記畫面',
            },
            {
                id: uid(), type: 'warning',
                content: 'AI 分析僅供參考，重要合約仍應由法務或顧問做最終確認。',
            },
        ],
    },

    // ── 加工部日報表 ──────────────────────────────────────────────────────────
    {
        title: '加工部日報表',
        summary: '告別 LINE 回報與紙本，加工部線上填報、主管即時查看產線進度。',
        blocks: [
            {
                id: uid(), type: 'text',
                content: '## 解決什麼問題\n過去加工部同仁每日工時靠 LINE 群組回報，月底統計曠日費時、人工整理錯誤率高。這套系統讓每位員工直接**線上填寫工單號、工序、工時**，主管可即時查看整條產線的進度，系統自動彙整月報，大幅降低人工整理的負擔。',
            },
            {
                id: uid(), type: 'steps',
                content: '登入系統後填寫當日工單號、工序與工時\n主管在後台即時看到進度並線上審核\n月底系統自動彙整月報，一鍵匯出',
            },
            {
                id: uid(), type: 'image',
                content: '', // ← 請填入截圖 URL
                caption: '加工部日報表填寫畫面',
            },
        ],
    },

    // ── 電控部日報表 ──────────────────────────────────────────────────────────
    {
        title: '電控部日報表',
        summary: '電控部專案工時線上管理，支援有無訂單單號的任務，主管即時掌握進度。',
        blocks: [
            {
                id: uid(), type: 'text',
                content: '## 解決什麼問題\n電控部同仁的工作性質多元——有些任務有訂單號、有些是內部專案，過去工時回報混亂難以統計。這套系統支援**工時代碼分類**，讓每位同仁記錄每日專案工時，主管即時查看團隊進度，月底自動產出統計報表。',
            },
            {
                id: uid(), type: 'steps',
                content: '登入系統後填寫專案工時與工時代碼\n主管在後台即時查看進度並線上審核\n月底系統自動統計月報，一鍵匯出',
            },
            {
                id: uid(), type: 'image',
                content: '', // ← 請填入截圖 URL
                caption: '電控部日報表填寫畫面',
            },
        ],
    },

    // ── 內部文件問答庫 ────────────────────────────────────────────────────────
    {
        title: '內部文件問答庫',
        summary: '把公司 SOP 和技術文件變成可以用中文直接問答的知識庫，讓老師傅的經驗傳承下來。',
        blocks: [
            {
                id: uid(), type: 'text',
                content: '## 解決什麼問題\n公司累積了大量 SOP、圖面說明、技術規範，但這些文件散落各處，遇到問題還是得靠問老師傅或一頁一頁翻目錄。這個知識庫讓你把所有文件上傳後，**直接用中文提問**，AI 從文件內容裡找答案，再也不用依賴特定人才能取得知識。',
            },
            {
                id: uid(), type: 'steps',
                content: '上傳 SOP 或技術文件（支援 PDF、Word）\n在問答框用自然語言輸入問題\n直接看到來自文件的答案與來源段落',
            },
            {
                id: uid(), type: 'image',
                content: '', // ← 請填入截圖 URL
                caption: '內部文件問答庫的查詢畫面',
            },
            {
                id: uid(), type: 'tip',
                content: '文件越完整、答案越精準。建議優先上傳最常被問到的 SOP 和技術規範。',
            },
        ],
    },

    // ── 批量電子簽章工具 ──────────────────────────────────────────────────────
    {
        title: '批量電子簽章工具',
        summary: '取代列印→蓋章→掃描的流程，在 PDF 上直接加文字與簽名，一次處理多頁。',
        blocks: [
            {
                id: uid(), type: 'text',
                content: '## 解決什麼問題\n行政流程中常需要在 PDF 文件上加蓋文字或簽名，傳統做法是列印、手寫、再掃描，一份文件來回至少 20 分鐘。這個工具讓你**直接在電腦上操作 PDF**，任意位置新增文字或簽名圖檔，支援多頁批次處理，大幅加速文件數位化流程。',
            },
            {
                id: uid(), type: 'steps',
                content: '從下方連結下載並開啟簽章工具（.exe）\n選擇目標 PDF 檔案\n在需要的位置加入文字或簽名，匯出完成',
            },
            {
                id: uid(), type: 'image',
                content: '', // ← 請填入截圖 URL
                caption: 'PDF 電子簽章工具操作畫面',
            },
            {
                id: uid(), type: 'tip',
                content: '第一次使用時需要先建立你的簽名圖檔，建議用白紙黑字手寫後拍照裁切備用。',
            },
        ],
    },

    // ── 空白頁清除工具 ────────────────────────────────────────────────────────
    {
        title: '空白頁清除工具',
        summary: '掃描文件後一鍵刪除所有空白頁，省去逐頁手動整理的時間。',
        blocks: [
            {
                id: uid(), type: 'text',
                content: '## 解決什麼問題\n文件掃描後常混入大量空白頁，特別是雙面掃描的奇數頁文件。手動一頁一頁刪除既費時又容易誤刪。這個工具能**自動偵測 PDF 或圖片中的空白頁面**，一鍵清除，支援批量處理多個檔案，讓文件整理效率提升數倍。',
            },
            {
                id: uid(), type: 'steps',
                content: '上傳 PDF 或圖片（.jpg / .png / .jpeg 均支援）\n工具自動偵測並標記空白頁面\n確認後下載清除完成的乾淨檔案',
            },
            {
                id: uid(), type: 'image',
                content: '', // ← 請填入截圖 URL
                caption: '空白頁清除工具的操作與結果預覽',
            },
        ],
    },

    // ── 修改檔案日期工具 ──────────────────────────────────────────────────────
    {
        title: '修改檔案日期工具',
        summary: '快速調整電腦檔案的建立或修改時間，適用對齊文件日期或整理歷史檔案的場景。',
        blocks: [
            {
                id: uid(), type: 'text',
                content: '## 解決什麼問題\n整理歷史檔案或整合不同來源的文件時，有時需要對齊檔案的時間戳記。這個工具提供兩支獨立程式，分別修改**「建立時間」**和**「最後修改時間」**，操作直覺，只需選擇目標檔案並輸入目標日期即可。',
            },
            {
                id: uid(), type: 'steps',
                content: '從下方連結下載對應的工具（建立時間 or 修改時間）\n開啟工具後選擇要修改的目標檔案\n輸入目標日期後存檔，完成',
            },
            {
                id: uid(), type: 'image',
                content: '', // ← 請填入截圖 URL
                caption: '修改檔案日期工具的操作畫面',
            },
            {
                id: uid(), type: 'warning',
                content: '此工具僅供檔案整理用途，請勿用於偽造或竄改任何正式文件的時間記錄。',
            },
        ],
    },

    // ── Teams Bot（RAG 聊天機器人）────────────────────────────────────────────
    {
        title: 'Teams Bot（RAG 聊天機器人）',
        summary: '這是我在 Teams 上整合 RAG 聊天機器人的完整歷程，從技術選型到最終上線。',
        blocks: [
            {
                id: uid(), type: 'text',
                content: '## 為什麼整合進 Teams\n公司同仁日常工作都在 Teams 上，如果 AI 知識庫查詢需要切換到另一個平台，使用率就會大打折扣。這個專案直接把 RAG 聊天機器人整合進 Teams，讓同仁在對話框輸入問題，機器人就能從**公司文件庫搜尋答案**，無需離開工作環境。',
            },
            {
                id: uid(), type: 'steps',
                content: '在 Teams 對話框找到「SimHope AI 小幫手」\n輸入問題（用自然語言即可）\n取得帶有來源引用的即時回答',
            },
            {
                id: uid(), type: 'image',
                content: '', // ← 請填入截圖 URL
                caption: 'Teams 聊天機器人對話截圖',
            },
            {
                id: uid(), type: 'tip',
                content: '目前知識庫涵蓋範圍以電控部技術文件為主，如需擴充涵蓋範圍請聯絡 Jason。',
            },
        ],
    },

    // ── 轉檔工具 ──────────────────────────────────────────────────────────────
    {
        title: '轉檔工具',
        summary: '圖片與 PDF 格式互轉的批量小工具，日常文件整理必備。',
        blocks: [
            {
                id: uid(), type: 'text',
                content: '## 解決什麼問題\n工作中常遇到格式不對的問題：掃描出來是 PDF 但需要圖片、截圖是 JPG 但要合併成 PDF。這個工具支援**圖片（JPG、PNG）與 PDF 雙向互轉**，支援批量操作，下載即用不需安裝額外環境。',
            },
            {
                id: uid(), type: 'steps',
                content: '從下方連結下載轉檔小幫手（.exe）\n選擇要轉換的檔案並指定目標格式\n下載轉換完成的檔案',
            },
            {
                id: uid(), type: 'image',
                content: '', // ← 請填入截圖 URL
                caption: '轉檔工具的操作畫面',
            },
        ],
    },

    // ── 遠地出差工具 ──────────────────────────────────────────────────────────
    {
        title: '遠地出差工具',
        summary: '出差申請從紙本搬到線上，填表、審核、確認一條龍，不用再跑三個單位蓋章。',
        blocks: [
            {
                id: uid(), type: 'text',
                content: '## 解決什麼問題\n過去遠地出差申請需要列印紙本、依序送主管和總務審核，往返耗時。這套系統讓同仁**線上填寫出差申請**，主管在線上審核，總務即時確認，整個流程完全數位化，大幅縮短申請到確認的時間。',
            },
            {
                id: uid(), type: 'steps',
                content: '登入系統後填寫出差申請表（日期、地點、目的）\n主管收到通知後線上審核確認\n總務確認後即可出差，報帳時系統已有完整紀錄',
            },
            {
                id: uid(), type: 'image',
                content: '', // ← 請填入截圖 URL
                caption: '遠地出差申請系統的填寫畫面',
            },
        ],
    },

    // ── 機敏辦公室影印機浮水印 ────────────────────────────────────────────────
    {
        title: '機敏辦公室影印機浮水印',
        summary: '機敏文件影印時自動加上時間戳浮水印，讓所有文件都可以追溯。',
        blocks: [
            {
                id: uid(), type: 'text',
                content: '## 解決什麼問題\n機敏資料存放區的文件被影印是資安管理的盲點，傳統做法無法追蹤是誰在什麼時候印了哪份文件。這個系統在影印機上加裝軟體，每次使用時自動在印出的紙本背景加上 **`yyyy/mm/dd HH:mm:ss`** 格式的時間戳浮水印，提供完整的追溯依據。',
            },
            {
                id: uid(), type: 'steps',
                content: '正常使用機敏區影印機，無需額外操作\n印出的文件背景自動帶有時間戳浮水印\n如需追蹤，以時間戳查詢使用記錄',
            },
            {
                id: uid(), type: 'image',
                content: '', // ← 請填入浮水印效果截圖 URL
                caption: '影印文件上的時間戳浮水印效果',
            },
            {
                id: uid(), type: 'tip',
                content: '浮水印採淺色背景印刷，不影響文件正常閱讀，但在白紙上清晰可見。',
            },
        ],
    },

    // ── MasterCAM2025 外掛報表 ────────────────────────────────────────────────
    {
        title: 'MasterCAM2025 外掛報表',
        summary: 'MasterCAM 2025 外掛開發記錄，讓加工部能在熟悉環境中匯出符合格式需求的報表。',
        blocks: [
            {
                id: uid(), type: 'text',
                content: '## 解決什麼問題\n加工部同仁使用 MasterCAM 輸出的報表格式不符合自身需求，每次都需要手動整理資料，費時且容易出錯。這個外掛直接整合進 **MasterCAM 2025**，讓同仁在熟悉的操作環境中一鍵匯出客製化格式的加工報表，取代原本的手動整理流程。',
            },
            {
                id: uid(), type: 'steps',
                content: '在 MasterCAM 2025 中完成正常加工設定\n開啟外掛選單，選擇匯出格式\n取得符合格式需求的客製化加工報表',
            },
            {
                id: uid(), type: 'image',
                content: '', // ← 請填入外掛截圖 URL
                caption: 'MasterCAM 外掛選單與匯出報表畫面',
            },
        ],
    },

    // ── SimHope 行事曆 ────────────────────────────────────────────────────────
    {
        title: 'SimHope 行事曆',
        summary: '為 SimHope 量身打造的行事曆，補足 TimeTree 與 Notion 在公司多部門使用情境的不足。',
        blocks: [
            {
                id: uid(), type: 'text',
                content: '## 為什麼自己做\nTimeTree 適合個人行程、Notion 偏向專案管理，兩者在公司多部門共用行事曆的場景都有明顯不足。這套自行開發的行事曆針對 **SimHope 的使用情境**設計，所有同仁都可以登入使用，跨部門行程共享更順暢。',
            },
            {
                id: uid(), type: 'steps',
                content: '登入 SimHope 行事曆系統（用公司帳號）\n新增個人或部門行程，設定可見範圍\n共享行程給相關同仁，跨部門協調更輕鬆',
            },
            {
                id: uid(), type: 'image',
                content: '', // ← 請填入行事曆截圖 URL
                caption: 'SimHope 行事曆系統主畫面',
            },
        ],
    },

    // ── 物管籌料數位化作業系統 ───────────────────────────────────────────────
    {
        title: '物管籌料數位化作業系統',
        summary: '數位化看板即時顯示所有工單的籌料進度，解決紙本非同步傳遞的問題。（已終止）',
        blocks: [
            {
                id: uid(), type: 'text',
                content: '## 解決什麼問題\n生產線上工單的籌料進度靠紙本或口頭傳達，產線常因資訊不同步而等待備料。這個看板讓物管部門即時更新各工單的備料狀態（**待料 / 備料中 / 已備齊**），產線主管直接在螢幕上看到最新進度，不再需要靠人工傳達。\n\n**終止原因**：系統已達成驗收目標，因公司流程調整而停止維護。',
            },
            {
                id: uid(), type: 'steps',
                content: '掃描工單條碼進入系統\n更新該工單的目前備料狀態\n產線即時獲知可開工通知',
            },
        ],
    },
];

// ─── 執行 ──────────────────────────────────────────────────────────────────────
async function seed() {
    const toolsRef = db.collection('tools');
    const snapshot = await toolsRef.get();
    const allTools = snapshot.docs.map(d => ({ docId: d.id, ...d.data() }));

    let updated = 0;
    let notFound = 0;

    for (const draft of TOOL_DRAFTS) {
        const match = allTools.find(t => t.title === draft.title);
        if (!match) {
            console.warn(`⚠️  找不到工具：「${draft.title}」，已跳過`);
            notFound++;
            continue;
        }

        await toolsRef.doc(match.docId).update({
            'blog.summary': draft.summary,
            'blog.blocks': draft.blocks,
        });

        console.log(`✅  ${draft.title}（${match.docId}）`);
        updated++;
    }

    console.log(`\n完成：更新 ${updated} 個工具，跳過 ${notFound} 個。`);
    console.log('>>> 記得之後到各工具詳情頁補上截圖 URL（image block 的 content 欄位）');
}

seed().catch(err => {
    console.error('❌ 執行失敗：', err.message);
    process.exit(1);
});
