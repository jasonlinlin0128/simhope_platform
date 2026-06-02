/**
 * apply-copy-revision.mjs
 *
 * 一次性套用：把 docs/internal/2026-05-27-tool-copy-revision.md 裡敲定的
 * 17 個工具新文案（Pattern C: Before/After 框架）寫進 Firestore。
 *
 * === 使用方式 ===
 *   node scripts/apply-copy-revision.mjs              # dry-run，印出每筆 diff
 *   node scripts/apply-copy-revision.mjs --apply      # 實際寫入（會先備份到 tools-backup-2026-05-28/）
 *
 * === 備份 ===
 * apply 時把整筆 tool 原始資料寫到 tools-backup-2026-05-28/{toolId}
 * （不同於 migration 的 tools-backup-2026-05-27 — 這是文案修訂版備份）
 *
 * === 變動範圍 ===
 * 17 個工具的 tagline + desc 全部換新；4 個工具 title 改名；
 * 5 個工具 status 變動；1 個 type 變動；3 個 url 清空。
 */

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serviceAccount = JSON.parse(
  readFileSync(join(__dirname, "..", "serviceAccountKey.json"), "utf8"),
);

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const BACKUP_COLLECTION = "tools-backup-2026-05-28";
const DRY_RUN = !process.argv.includes("--apply");

// ─── 17 個工具的定稿文案 ─────────────────────────────────────────────

const REVISIONS = {
  t1: {
    tagline: "中泰雙語翻譯 — 鎖定壓鑄專業術語的精準對應",
    desc: "**Before**：跟泰籍同事日常溝通能用簡單中文，但講到「射料頭」「鵝頸」這類壓鑄專業術語，一般翻譯軟體翻不精準，產生誤解可能影響操作。\n**After**：手機開連結就能用，中泰雙語即時翻譯。串 Gemini 3.0 Flash 加上壓鑄專業術語做 Prompt Engineering 微調；介面大字大按鈕設計，手機就能直接操作，專業詞彙精準對應。",
  },

  t3a: {
    tagline: "日報線上填，主管即時看進度，月報自動彙整",
    desc: "**Before**：紙本日報 + Excel 手動填 + LINE 群組回報，主管月底彙整。\n**After**：Web App 線上填報、自動彙整、即時同步。每人每日填報 15 → 10 min、主管彙整 30 → 5 min、準確率 +30%。",
  },

  t3b: {
    tagline: "電控部專案工時線上填 — 製令單號可追 ERP、專案名稱便分類",
    desc: "**Before**：紙本日報、工時回報不統一。電控部工作涵蓋軟硬體設計、系統整合、測試與售後維護等多元任務，沒有結構化追蹤時主管難掌握每個專案在哪個階段。\n**After**：Web App 線上填工時，**製令單號**串接 ERP 系統可追溯、**專案名稱**便於記憶分類；多元任務統一管理，Firebase 即時同步，主管即時看每個專案狀態。",
  },

  t4: {
    tagline: "(已被 LINE Bot 取代) 內部文件問答庫 — 原 RAG 構想",
    desc: "**原 Before**：公司 SOP、技術文件散落各處，新進或非固定負責同仁要問老師傅或翻紙本目錄。\n**本來想做的 After**：把文件上傳成知識庫，用中文問 AI 找答案。\n**為何終止**：原 RAG Bot 構想未實作；2026-04 改用 LINE Bot（地端 LLM）方向承接，待該方案成熟後再上平台。",
    status: "terminated",
  },

  t5: {
    tagline: "產品說明書自動生成 — 規格輸入、AI 寫稿，省去翻譯外包",
    desc: "**Before**：產品說明書每改規格就要重寫，中英日三語翻譯還要外包，費時費錢；改一個字就要重跑流程。\n**Goal**：輸入產品型號、規格參數、注意事項，AI 依公司標準格式產出中英日三語完整草稿，大幅減少撰寫時間，校對後直接用，省去翻譯外包。",
    status: "dev",
    url: "",
  },

  t7: {
    tagline: "(已終止) 物管籌料數位化看板",
    desc: "**原 Before**：物料籌備狀態依賴人工紙本非同步傳遞，工單籌料進度（待料／備料中／已備齊）無即時可見性。\n**本來想做的 After**：建立數位化看板即時顯示所有工單的籌料進度。\n**為何終止**：2025 年評估後決定不繼續開發；相關需求後來轉由「進貨單 OCR LINE bot」用更輕量方式承接。",
  },

  t8: {
    tagline: "機敏辦公室影印機浮水印 — 印出文件自動加時間追溯",
    desc: "**Before**：機敏資料區的影印機印出文件無法追蹤，若資料外洩無法回溯影印時點、影印者。\n**Goal**：(規劃中) 在機敏辦公室電腦執行 .exe，每次列印自動在紙本背景加上 `yyyy/mm/dd/hh/mm/ss` 時間戳浮水印。若資料外洩可從浮水印追溯影印時點，強化資安稽核管控。",
    type: "download",
    url: "",
  },

  t9: {
    tagline: "MasterCAM 2025 外掛 DLL — 從軟體裡直接匯出客製化加工報表",
    desc: "**Before**：加工部用 MasterCAM 設計刀路後，要手動把參數複製／整理到報表，格式不符實際需求。\n**Goal**：(規劃中) MasterCAM 2025 的 DLL 外掛，從 MasterCAM 內直接一鍵匯出符合需求的客製化報表。部分參數無法透過 MasterCAM API 取得，目前暫停評估替代方案。",
  },

  t10: {
    tagline: "SimHope 整合行事曆 — 解決行程分散在 Notion / TimeTree 兩邊",
    desc: "**Before**：公司行事曆分散 — 出差／請假在 Notion、大型活動／課程在 TimeTree，沒有單一窗口看全部行程，跨部門協調容易漏。\n**After**：自開發整合行事曆，把出差請假、活動課程都集中在同一視圖。Web App 全體同仁可用，目前測試中。",
  },

  t11: {
    title: "遠地出差津貼申請系統",
    tagline: "出差申請線上化 — 即時自動算津貼，總務不用反覆試算",
    desc: "**Before**：同仁手寫出差申請單，常忘記另填津貼申請（被遺漏）；總務每筆要人工反覆試算金額 10-15 分鐘，還可能算錯。\n**After**：線上填出差申請，系統依規則即時算出津貼金額，申請單跟津貼整合不用分開填。每月約 30 筆，總務省約 5 小時/月，試算錯誤風險消除。",
  },

  t12: {
    title: "批量電子簽章小幫手",
    tagline: "SOP 批量簽章一次搞定 — 拉一次位置、200 份自動完成",
    desc: "**Before**：SOP 等大量重複文件要簽章時，每份要列印、跑遞 5 個簽核者、跨廠等主管，每份 active 工時約 12 min，lead time 1-3 天。\n**After**：拉一次簽名位置設定，後 200 份自動套用完成，每批 5 min + 每份 1 min。簽核從「等主管中午回來」變「秒簽」。",
    status: "dev",
  },

  t13: {
    tagline: "(已整合至 SimHope 工具箱) 空白頁批次清除",
    desc: "**原 Before**：合併文件常產生空白頁，手動逐頁刪除浪費時間。\n**本來想做的 After**：一鍵自動偵測並清除大量 PDF / 圖檔的空白頁。\n**為何終止**：已整合至 SimHope 工具箱（Smart Remover 模組），建議使用工具箱版本。",
  },

  t14: {
    title: "檔案時間編輯小工具",
    tagline: "檔案時間批量編輯 — 建立時間 + 修改時間兩種一次處理",
    desc: "**Before**：Windows 系統不支援直接修改檔案的建立時間，年度資安稽核前要批量調整機敏資料夾文件的時間，手動逐檔改既慢又容易出錯。\n**After**：兩個工具分別處理「建立時間」跟「修改時間」（.exe + .ps1 版本），批量處理大量檔案。稽核當天即可一次完成。",
    status: "dev",
    url: "",
  },

  t15: {
    tagline: "ISO 27001 條文 Teams 問答 — 不用翻 PDF 規範，秒回",
    desc: "**Before**：資安小隊每年維護 ISO 27001 時要翻 PDF 規範文件查條文，平均每次查詢 10 分鐘；不定期被同仁問資安問題也要找文件解答。\n**After**：Teams 內 @ 機器人即時查 ISO 27001 條文跟維護表單，每次省約 10 分鐘。背後用 RAG 查詢知識庫。",
  },

  t16: {
    tagline: "(已整合至 SimHope 工具箱) 圖片 ↔ PDF 批量互轉",
    desc: "**原 Before**：圖片檔與 PDF 檔格式轉換要找線上工具，批量處理麻煩。\n**本來想做的 After**：圖片 ↔ PDF 格式批量互轉，日常文件整理用。\n**為何終止**：已整合至 SimHope 工具箱（轉檔小幫手模組），建議使用工具箱版本。",
  },

  t_sop_interface: {
    title: "SOP-Interface APP",
    tagline: "現場 SOP 數位化 — 手機拍照建步驟、主管審核、全員查閱",
    desc: "**Before**：品管標準散落在紙本跟個人經驗，新進或非固定產品負責同仁要查檢驗方式得問老師傅 + 往返查紙本，平均每次約 5 分鐘；標準也容易因人而異。\n**After**：手機拍照／錄影／文字建 SOP 步驟、主管線上審核，通過後全員隨時查閱。可安裝到手機桌面（PWA），標準集中數位化、現場手機即查、檢驗一致性提升。",
  },

  t_toolbox: {
    tagline:
      "內網環境桌面工具箱，不需要網路就能用 — PDF / Office / 製造 ERP / 通用 32 模組",
    desc: "**Before**：日常工作要用多個工具（PDF 處理、Excel 清洗、QR Code 產生、檔案重命名等），每個都是獨立 .exe 安裝、桌面捷徑爆炸、更新分別處理。\n**After**：一個 Windows 桌面 app 整合 32 個模組 — PDF 工具（10）、Office（5）、製造 ERP（7）、通用（9）、時間（1）。左側 sidebar 切換、開啟即用。",
  },
};

// ─── 計算與顯示 ────────────────────────────────────────────────────

function computeChanges(tool, target) {
  const changes = {};
  for (const [key, newValue] of Object.entries(target)) {
    if (tool[key] !== newValue) changes[key] = newValue;
  }
  return changes;
}

function truncate(s, n) {
  const str = String(s);
  return str.length > n ? str.slice(0, n) + "…" : str;
}

function formatDiff(tool, changes) {
  const lines = [`  ${tool.id.padEnd(20)} ${tool.title || "(無 title)"}`];
  if (Object.keys(changes).length === 0) {
    lines.push(`      （已是新版，無變更）`);
    return lines.join("\n");
  }
  for (const [key, newValue] of Object.entries(changes)) {
    const oldValue =
      tool[key] === undefined ? "(無)" : JSON.stringify(tool[key]);
    const newValueStr = JSON.stringify(newValue);
    lines.push(`      ${key}:`);
    lines.push(`        - ${truncate(oldValue, 100)}`);
    lines.push(`        + ${truncate(newValueStr, 100)}`);
  }
  return lines.join("\n");
}

// ─── 主流程 ────────────────────────────────────────────────────────

async function main() {
  console.log(`\n=== apply-copy-revision.mjs ===`);
  console.log(
    `模式：${DRY_RUN ? "DRY-RUN（不會寫 Firestore）" : "APPLY（會實際寫入）"}\n`,
  );

  const ids = Object.keys(REVISIONS).sort();
  console.log(`計畫修改 ${ids.length} 個工具：${ids.join(", ")}\n`);

  // 讀現況
  const plans = [];
  for (const id of ids) {
    const snap = await db.collection("tools").doc(id).get();
    if (!snap.exists) {
      console.warn(`⚠️  找不到 ${id}，跳過`);
      continue;
    }
    const tool = { id: snap.id, ...snap.data() };
    const changes = computeChanges(tool, REVISIONS[id]);
    plans.push({ tool, changes });
  }

  console.log("── 每筆變更 ──\n");
  let needsUpdate = 0;
  for (const { tool, changes } of plans) {
    if (Object.keys(changes).length > 0) needsUpdate++;
    console.log(formatDiff(tool, changes));
  }

  console.log(`\n── 總結 ──`);
  console.log(`  需要更新: ${needsUpdate}`);
  console.log(`  已是新版: ${plans.length - needsUpdate}`);

  if (DRY_RUN) {
    console.log(`\n>>> 這是 dry-run。確認後加 --apply 旗標：`);
    console.log(`    node scripts/apply-copy-revision.mjs --apply\n`);
    return;
  }

  // === APPLY ===
  console.log(`\n── 開始備份 + 寫入 ──\n`);

  const batch = db.batch();
  const backupRef = db.collection(BACKUP_COLLECTION);
  const toolsRef = db.collection("tools");

  for (const { tool, changes } of plans) {
    if (Object.keys(changes).length === 0) continue;
    const { id, ...original } = tool;
    batch.set(backupRef.doc(tool.id), {
      ...original,
      _backupAt: new Date().toISOString(),
      _migrationVersion: "2026-05-28-copy-revision",
    });
    batch.update(toolsRef.doc(tool.id), changes);
    console.log(
      `  ✅ ${tool.id.padEnd(20)} 備份 + ${Object.keys(changes).length} 個欄位變更`,
    );
  }

  console.log(`\n  正在 commit...`);
  await batch.commit();
  console.log(`\n✅ 完成。備份位置：${BACKUP_COLLECTION}/{toolId}\n`);
}

main().catch((err) => {
  console.error("\n❌ 執行失敗：", err.message);
  console.error(err.stack);
  process.exit(1);
});
