/**
 * migrate-embedded-type.mjs
 *
 * 一次性遷移：把 t8（機敏辦公室影印機浮水印）、t9（MasterCAM2025 外掛報表）
 * 從 download 改成 embedded（場域工具），並補上 typeData.location / accessNote。
 *
 * ⚠️ 重要（見 AGENTS.md「部署與資料遷移的順序」）：
 *   這個 migration 依賴 embedded 類型的程式碼。**必須等 code merge + deploy 後才跑 --apply**。
 *
 * === 使用方式 ===
 *   node scripts/migrate-embedded-type.mjs              # dry-run
 *   node scripts/migrate-embedded-type.mjs --apply
 *
 * 備份：tools-backup-2026-05-29-embedded/{toolId}
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sa = JSON.parse(readFileSync(join(__dirname, '..', 'serviceAccountKey.json'), 'utf8'));
initializeApp({ credential: cert(sa) });
const db = getFirestore();

const BACKUP_COLLECTION = 'tools-backup-2026-05-29-embedded';
const DRY_RUN = !process.argv.includes('--apply');

// 各工具改成 embedded + 補 typeData。typeData 用 merge 不覆蓋既有 key。
const CHANGES = {
    t8: {
        type: 'embedded',
        typeData: {
            location: '機敏資料區的指定影印機 / 旁邊的專用電腦',
            accessNote: '工具部署在機敏辦公室的影印機環境，列印時自動加時間戳浮水印。需要調整或查詢請找 MIS / 資安小組。',
            contact: 'MIS / 資安小組',
        },
    },
    t9: {
        type: 'embedded',
        typeData: {
            location: '加工部現場電腦上的 MasterCAM 2025',
            accessNote: 'DLL 外掛安裝在加工部的 MasterCAM 2025 環境，於該台電腦操作即可一鍵匯出客製化報表。目前仍在開發/評估中。',
            contact: '經企室',
        },
    },
};

async function main() {
    console.log(`\n=== migrate-embedded-type.mjs ===`);
    console.log(`模式：${DRY_RUN ? 'DRY-RUN' : 'APPLY'}\n`);

    const plans = [];
    for (const [id, change] of Object.entries(CHANGES)) {
        const snap = await db.collection('tools').doc(id).get();
        if (!snap.exists) { console.warn(`⚠️  找不到 ${id}，跳過`); continue; }
        const tool = { id, ...snap.data() };
        plans.push({ tool, change });
    }

    console.log('── 變更 ──\n');
    for (const { tool, change } of plans) {
        console.log(`  ${tool.id}  「${tool.title}」`);
        console.log(`      type:     ${tool.type} → ${change.type}`);
        console.log(`      typeData: ${JSON.stringify(tool.typeData || {})}`);
        console.log(`             →  ${JSON.stringify({ ...(tool.typeData || {}), ...change.typeData })}`);
    }

    if (DRY_RUN) {
        console.log(`\n>>> dry-run。⚠️ 確認 embedded 程式碼已 merge+deploy 後才跑：`);
        console.log(`    node scripts/migrate-embedded-type.mjs --apply\n`);
        return;
    }

    console.log(`\n── 開始備份 + 寫入 ──\n`);
    const batch = db.batch();
    const backupRef = db.collection(BACKUP_COLLECTION);
    const toolsRef = db.collection('tools');

    for (const { tool, change } of plans) {
        const { id, ...original } = tool;
        batch.set(backupRef.doc(tool.id), {
            ...original,
            _backupAt: new Date().toISOString(),
            _migrationVersion: '2026-05-29-embedded',
        });
        batch.update(toolsRef.doc(tool.id), {
            type: change.type,
            typeData: { ...(tool.typeData || {}), ...change.typeData },
        });
        console.log(`  ✅ ${tool.id}  → embedded`);
    }

    await batch.commit();
    console.log(`\n✅ 完成。備份：${BACKUP_COLLECTION}/{toolId}\n`);
}

main().catch(err => {
    console.error('\n❌', err.message);
    console.error(err.stack);
    process.exit(1);
});
