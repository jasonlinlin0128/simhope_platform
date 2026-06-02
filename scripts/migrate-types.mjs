/**
 * migrate-types.mjs
 *
 * 一次性遷移：把 tools collection schema 從舊版升級到新版（spec §7）
 * 對照 docs/superpowers/specs/2026-05-27-resources-expansion-spec.md
 *
 * === 使用方式 ===
 *   node scripts/migrate-types.mjs              # dry-run，印出每筆 diff，不寫 Firestore
 *   node scripts/migrate-types.mjs --apply      # 實際寫入（會先備份到 tools-backup-2026-05-27/）
 *
 * === 變動清單 ===
 * [DELETE]
 *   - CSNt9kWerX1BoP7EVl5E "Test ToolTest Tool"（測試資料）
 *
 * [UPDATE] 全部 15 筆都加 typeData: {} 空物件，並依下列規則調整：
 *   - t9  MasterCAM    type: showcase → download（DLL 外掛）
 *   - t10 行事曆        status: dev → beta（已開發完未推給同仁）
 *   - t11 出差工具      status: pending → live（已上線）
 *   - t13 空白頁清除    status: live → terminated + desc 加註已整合至工具箱
 *   - t15 Teams Bot    type: showcase → webapp（Teams 內部服務）
 *   - t16 轉檔工具      status: live → terminated + desc 加註已整合至工具箱
 *
 * [CREATE]
 *   - t_toolbox "SimHope 工具箱 v2.3.0"（Windows 桌面整合工具集，32 模組）
 *
 * === 備份策略 ===
 * apply 時把整筆 tool 原始資料寫到 tools-backup-2026-05-27/{toolId}（含 Test Tool）
 */

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serviceAccount = JSON.parse(
  readFileSync(join(__dirname, "..", "serviceAccountKey.json"), "utf8"),
);

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const BACKUP_COLLECTION = "tools-backup-2026-05-27";
const DRY_RUN = !process.argv.includes("--apply");

// ─── 規則 ───────────────────────────────────────────────────────────

// 1. type 對應
const TYPE_REMAP = { showcase: "download" };

// 2. 個別工具的特殊處理（dry-run 發現的特例 + 用戶確認）
const TOOLBOX_NOTE = "已整合至 SimHope 工具箱（v2.3.0）。\n\n";
const SPECIAL_CASES = {
  t10: { status: "beta" }, // 開發完未推
  t11: { status: "live" }, // 已上線
  t13: { status: "terminated", _prependDesc: TOOLBOX_NOTE }, // Smart Remover 重複
  t15: { type: "webapp" }, // Teams Bot
  t16: { status: "terminated", _prependDesc: TOOLBOX_NOTE }, // 轉檔小幫手重複
};

// 3. 要刪除的 documents
const DELETIONS = ["CSNt9kWerX1BoP7EVl5E"]; // Test Tool

// 4. 要新增的 documents
const TIMESTAMP = FieldValue.serverTimestamp();
const CREATIONS = [
  {
    id: "t_toolbox",
    data: {
      title: "SimHope 工具箱",
      tagline:
        "Windows 桌面整合工具集 — PDF / Office / 製造 ERP / 通用 共 32 個模組",
      desc: "SimHope 內網離線桌面工具集，整合多個日常常用工具於單一 Electron app 中，不需安裝多個程式。v2.3.0 涵蓋 PDF 工具（10 個）、Office 工具（5 個）、製造 ERP 工具（7 個）、通用工具（9 個）、時間（1 個），共 32 個模組。完全離線運作、無需網路。",
      url: "", // 待 Jason 補下載連結
      type: "download",
      status: "live",
      icon: "🧰",
      color: "c5",
      dept: "admin", // 跨部門共用，主放在 admin
      folder: "內部平台專案",
      scenarios: ["文書處理", "行政簽核", "生產現場"],
      tags: ["Electron", "PDF", "Office", "製造 ERP", "離線", "桌面工具"],
      steps: [
        "下載 SimHope 工具箱安裝檔（.exe）",
        "雙擊安裝（NSIS / Portable 兩版可選）",
        "從開始選單啟動，左側 sidebar 切換模組",
      ],
      typeData: {
        platform: "windows",
        version: "v2.3.0",
      },
      blog: { summary: "", blocks: [] },
      files: [],
      versions: [],
      authorUid: "", // 系統建立，沒有作者；admin 可編輯
      createdAt: TIMESTAMP,
      updatedAt: TIMESTAMP,
    },
  },
  {
    id: "t_sop_interface",
    data: {
      title: "SOP-Interface",
      tagline: "現場人員 SOP 數位化 PWA — 手機拍照建步驟、主管審核、全員查閱",
      desc: "現場人員用手機就能建立 SOP 步驟（拍照、錄影、文字），主管線上審核，全員可隨時查閱。從品保部 QC-only 版本起家，由 Porter 提議擴展為全公司 PWA。",
      url: "https://sop-interface.vercel.app",
      type: "webapp",
      status: "beta", // health=paused, stage=reviewing
      icon: "📋",
      color: "c3",
      dept: "quality", // 品保部起家、擴及全公司
      folder: "知識庫專案",
      scenarios: ["技術傳承", "教育訓練", "生產現場"],
      tags: ["SOP", "PWA", "手機", "品保"],
      steps: [
        "手機開啟連結，登入帳號",
        "拍照 / 錄影 / 文字建立 SOP 步驟",
        "送出給主管審核，通過後全員可查閱",
      ],
      typeData: {},
      blog: { summary: "", blocks: [] },
      files: [],
      versions: [],
      authorUid: "",
      createdAt: TIMESTAMP,
      updatedAt: TIMESTAMP,
    },
  },
];

// ─── 計算變更 ───────────────────────────────────────────────────────

function computeNewFields(tool) {
  const special = SPECIAL_CASES[tool.id] || {};
  const oldType = tool.type;
  const newType = special.type || TYPE_REMAP[oldType] || oldType || "webapp";
  const changes = {};

  if (newType !== oldType) changes.type = newType;
  if (special.status && special.status !== tool.status)
    changes.status = special.status;
  if (special._prependDesc) {
    const oldDesc = tool.desc || "";
    if (!oldDesc.startsWith(special._prependDesc.trim())) {
      changes.desc = special._prependDesc + oldDesc;
    }
  }
  if (!tool.typeData || typeof tool.typeData !== "object") {
    changes.typeData = {};
  }

  return changes;
}

function formatDiff(tool, changes) {
  const lines = [`  ${tool.id.padEnd(12)} ${tool.title || "(無 title)"}`];
  for (const [key, newValue] of Object.entries(changes)) {
    const oldValue =
      tool[key] === undefined ? "(無)" : JSON.stringify(tool[key]);
    const newValueStr = JSON.stringify(newValue);
    const truncate = (s, n) => (s.length > n ? s.slice(0, n) + "…" : s);
    lines.push(
      `      ${key}: ${truncate(oldValue, 60)}  →  ${truncate(newValueStr, 60)}`,
    );
  }
  if (Object.keys(changes).length === 0) {
    lines.push(`      （無變更）`);
  }
  return lines.join("\n");
}

// ─── 主流程 ─────────────────────────────────────────────────────────

async function main() {
  console.log(`\n=== migrate-types.mjs ===`);
  console.log(
    `模式：${DRY_RUN ? "DRY-RUN（不會寫 Firestore）" : "APPLY（會實際寫入）"}\n`,
  );

  const snapshot = await db.collection("tools").get();
  const allDocs = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));

  // 切分：要 update 的 / 要 delete 的
  const toDelete = allDocs.filter((t) => DELETIONS.includes(t.id));
  const toUpdate = allDocs
    .filter((t) => !DELETIONS.includes(t.id))
    .sort((a, b) => a.id.localeCompare(b.id));

  console.log(
    `找到 ${allDocs.length} 筆，其中 ${toUpdate.length} 筆 update / ${toDelete.length} 筆 delete / 將新增 ${CREATIONS.length} 筆\n`,
  );

  // ── 列出 UPDATE 操作 ──
  console.log("── [UPDATE] 每筆變更 ──\n");
  let needsUpdate = 0;
  const updatePlans = [];
  for (const tool of toUpdate) {
    const changes = computeNewFields(tool);
    const has = Object.keys(changes).length > 0;
    if (has) needsUpdate++;
    updatePlans.push({ tool, changes, has });
    console.log(formatDiff(tool, changes));
  }

  // ── 列出 DELETE 操作 ──
  console.log("\n── [DELETE] 將刪除 ──\n");
  if (toDelete.length === 0) {
    console.log("  （無）");
  } else {
    for (const t of toDelete) {
      console.log(`  ${t.id.padEnd(22)} title="${t.title}" (備份後刪除)`);
    }
  }

  // ── 列出 CREATE 操作（跳過已存在的，避免覆寫 admin 之後的編輯） ──
  console.log("\n── [CREATE] 將新增 ──\n");
  const existingIds = new Set(allDocs.map((d) => d.id));
  const toCreate = CREATIONS.filter((c) => !existingIds.has(c.id));
  const skippedCreate = CREATIONS.filter((c) => existingIds.has(c.id));
  if (toCreate.length === 0 && skippedCreate.length === 0) {
    console.log("  （無）");
  }
  for (const c of toCreate) {
    console.log(`  ${c.id.padEnd(12)} title="${c.data.title}"`);
    console.log(
      `      type=${c.data.type}  status=${c.data.status}  folder="${c.data.folder}"`,
    );
    console.log(`      tagline="${c.data.tagline}"`);
    console.log(`      url="${c.data.url || "(待之後補)"}"`);
  }
  for (const c of skippedCreate) {
    console.log(`  ⏭️  ${c.id.padEnd(12)} 已存在，跳過 (避免覆寫 admin 編輯)`);
  }

  console.log(`\n── 總結 ──`);
  console.log(`  需要 update: ${needsUpdate}`);
  console.log(`  將 delete  : ${toDelete.length}`);
  console.log(`  將 create  : ${toCreate.length}`);

  if (DRY_RUN) {
    console.log(`\n>>> 這是 dry-run，沒寫入 Firestore。`);
    console.log(`>>> 確認後加 --apply 旗標實際執行：`);
    console.log(`    node scripts/migrate-types.mjs --apply\n`);
    return;
  }

  // ─── APPLY 模式 ─────────────────────────────────────────────────
  console.log(`\n── 開始備份 + 寫入 ──\n`);

  const batch = db.batch();
  const backupRef = db.collection(BACKUP_COLLECTION);
  const toolsRef = db.collection("tools");

  // 1. UPDATE：備份 + 套用變更
  for (const { tool, changes, has } of updatePlans) {
    if (!has) continue;
    const { id, ...originalData } = tool;
    batch.set(backupRef.doc(tool.id), {
      ...originalData,
      _backupAt: new Date().toISOString(),
      _migrationVersion: "2026-05-27-resources-expansion",
      _operation: "update",
    });
    batch.update(toolsRef.doc(tool.id), changes);
    console.log(
      `  ✅ [UPDATE] ${tool.id}  備份 + ${Object.keys(changes).length} 個欄位變更`,
    );
  }

  // 2. DELETE：備份後刪除
  for (const tool of toDelete) {
    const { id, ...originalData } = tool;
    batch.set(backupRef.doc(tool.id), {
      ...originalData,
      _backupAt: new Date().toISOString(),
      _migrationVersion: "2026-05-27-resources-expansion",
      _operation: "delete",
    });
    batch.delete(toolsRef.doc(tool.id));
    console.log(`  🗑️  [DELETE] ${tool.id}  備份 + 刪除`);
  }

  // 3. CREATE：建立新工具（已存在的跳過）
  for (const { id, data } of toCreate) {
    batch.set(toolsRef.doc(id), data);
    console.log(`  ➕ [CREATE] ${id}  title="${data.title}"`);
  }
  for (const { id } of skippedCreate) {
    console.log(`  ⏭️  [SKIP]   ${id}  已存在`);
  }

  console.log(`\n  正在 commit batch...`);
  await batch.commit();
  console.log(`\n✅ 完成`);
  console.log(`   備份位置：${BACKUP_COLLECTION}/{toolId}`);
  console.log(`   若要 rollback：把 backup 資料寫回 tools，或恢復 deletion\n`);
}

main().catch((err) => {
  console.error("\n❌ 執行失敗：", err.message);
  console.error(err.stack);
  process.exit(1);
});
