/**
 * apply-paincard-revision.mjs
 *
 * 一次性整理 painCards：
 * - 砍掉重複的 AI 自動生成版本（pc_ai_1772085135196_*）
 * - 為保留的 painCards 補上 relatedToolId（連結到對應工具）
 * - 沒對應工具的 painCard 保留但 relatedToolId = null（前端不可點）
 *
 * === 使用方式 ===
 *   node scripts/apply-paincard-revision.mjs              # dry-run
 *   node scripts/apply-paincard-revision.mjs --apply      # 實際寫入
 *
 * 備份位置：painCards-backup-2026-05-28/{cardId}
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

const BACKUP_COLLECTION = 'painCards-backup-2026-05-28';
const DRY_RUN = !process.argv.includes('--apply');

// ─── painCard 對應規則 ────────────────────────────────────────
// action: 'delete' | 'update'
// update 時 relatedToolId 可為 string (有對應 tool) 或 null (孤兒，不可點)

const REVISIONS = {

    // === 14 個 AI 重複版本要刪除 ===
    'pc_ai_1772085135196_0':  { action: 'delete', reason: '翻譯 dup of pc1' },
    'pc_ai_1772085135196_1':  { action: 'delete', reason: '合約 dup of pc2' },
    'pc_ai_1772085135196_2':  { action: 'delete', reason: '加工部日報 dup of pc3' },
    'pc_ai_1772085135196_3':  { action: 'delete', reason: '電控部日報 dup of 5q7qjkx' },
    'pc_ai_1772085135196_4':  { action: 'delete', reason: 'SOP 知識庫 dup of pc6' },
    'pc_ai_1772085135196_5':  { action: 'delete', reason: '說明書 dup of pc5' },
    'pc_ai_1772085135196_6':  { action: 'delete', reason: 'AI 外觀檢測 dup of pc4' },
    'pc_ai_1772085135196_7':  { action: 'delete', reason: '簽章 dup of pc7' },
    'pc_ai_1772085135196_8':  { action: 'delete', reason: '空白頁 dup of pc10' },
    'pc_ai_1772085135196_9':  { action: 'delete', reason: '檔案時間 dup of UTfQJ' },
    'pc_ai_1772085135196_11': { action: 'delete', reason: '轉檔 dup of UBHH4' },
    'pc_ai_1772085135196_12': { action: 'delete', reason: '出差 dup of pc8' },
    'pc_ai_1772085135196_13': { action: 'delete', reason: '浮水印 dup of pc9' },
    'pc_ai_1772085135196_14': { action: 'delete', reason: 'MasterCAM dup of pc11' },

    // === 原版 pc 系列 (11 個) — 補 relatedToolId ===
    'pc1':  { action: 'update', relatedToolId: 't1' },                  // 翻譯
    'pc2':  { action: 'update', relatedToolId: null },                  // 合約審查 (孤兒)
    'pc3':  { action: 'update', relatedToolId: 't3a' },                 // 加工部日報
    'pc4':  { action: 'update', relatedToolId: null },                  // AI 外觀檢測 (孤兒)
    'pc5':  { action: 'update', relatedToolId: 't5' },                  // 說明書
    'pc6':  { action: 'update', relatedToolId: 't4' },                  // SOP 知識庫 (對 terminated t4)
    'pc7':  { action: 'update', relatedToolId: 't12' },                 // 簽章
    'pc8':  { action: 'update', relatedToolId: 't11' },                 // 出差
    'pc9':  { action: 'update', relatedToolId: 't8' },                  // 浮水印
    'pc10': { action: 'update', relatedToolId: 't13' },                 // 空白頁 (terminated)
    'pc11': { action: 'update', relatedToolId: 't9' },                  // MasterCAM

    // === Random ID 系列 (11 個) — 補 relatedToolId ===
    '5q7qjkx6a6y9Zwio0gja':  { action: 'update', relatedToolId: 't3b' },              // 電控部日報
    'L2GkFOuRnrHknOwu7QP0':  { action: 'update', relatedToolId: null },               // 會議記錄逐字稿 (孤兒)
    'on2xpEWVSh1Ceg9RmDvm':  { action: 'update', relatedToolId: null },               // 找料件爬蟲 (孤兒)
    'PiRyKMvBjC71s2YKDsRr':  { action: 'update', relatedToolId: 't_sop_interface' },  // SOP-Interface
    'UBHH4a4lbd5ialL3OgEY':  { action: 'update', relatedToolId: 't16' },              // 轉檔 (terminated)
    'UTfQJSfbAA3v0D1kgV91':  { action: 'update', relatedToolId: 't14' },              // 檔案時間編輯
    'xmtAFiai5KUf8gd8TdSi':  { action: 'update', relatedToolId: 't7' },               // 物管 (terminated)
    'YuOIoOBh7hh1ok1lxqzP':  { action: 'update', relatedToolId: null },               // 社交工程 (孤兒)
    'pH6Mu1QJvlRHpGUg6PeP':  { action: 'update', relatedToolId: null },               // APS (孤兒)
    'saTxNWfNZ0hkc0b1bZaU':  { action: 'update', relatedToolId: null },               // NFC 巡檢 (孤兒)
    'XHQJwluQhf9TpdFwbO5C':  { action: 'update', relatedToolId: 't15' },              // ISO 27001 Teams Bot

    // === AI 系列保留 (2 個) — 沒原版的 ===
    'pc_ai_1772085135196_10': { action: 'update', relatedToolId: 't15' },             // Teams Bot
    'pc_ai_1772085135196_15': { action: 'update', relatedToolId: 't10' },             // 行事曆

};

// ─── 主流程 ─────────────────────────────────────────────────────

async function main() {
    console.log(`\n=== apply-paincard-revision.mjs ===`);
    console.log(`模式：${DRY_RUN ? 'DRY-RUN（不會寫 Firestore）' : 'APPLY（會實際寫入）'}\n`);

    const snap = await db.collection('painCards').get();
    const allCards = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    console.log(`Firestore 共有 ${allCards.length} 張 painCards\n`);

    // 切分
    const toDelete = [];
    const toUpdate = [];
    const notFound = [];

    for (const card of allCards) {
        const rev = REVISIONS[card.id];
        if (!rev) {
            notFound.push(card);
            continue;
        }
        if (rev.action === 'delete') {
            toDelete.push({ card, rev });
        } else if (rev.action === 'update') {
            // 檢查是否真的需要更新（idempotent）
            const currentRelated = card.relatedToolId;
            const targetRelated = rev.relatedToolId;
            const needsUpdate = currentRelated !== targetRelated;
            if (needsUpdate) {
                toUpdate.push({ card, rev });
            }
        }
    }

    // ── 列出 DELETE ──
    console.log('── [DELETE] 將刪除 (備份後刪) ──\n');
    if (toDelete.length === 0) {
        console.log('  （無）');
    } else {
        for (const { card, rev } of toDelete) {
            console.log(`  ${card.id.padEnd(28)} ${rev.reason}`);
            console.log(`      Before: ${(card.before || '').slice(0, 60)}`);
        }
    }

    // ── 列出 UPDATE ──
    console.log('\n── [UPDATE] 補 relatedToolId ──\n');
    if (toUpdate.length === 0) {
        console.log('  （無）');
    } else {
        for (const { card, rev } of toUpdate) {
            const tag = rev.relatedToolId ? `→ ${rev.relatedToolId}` : '→ null (孤兒)';
            console.log(`  ${card.id.padEnd(28)} ${tag}`);
            console.log(`      Before: ${(card.before || '').slice(0, 60)}`);
        }
    }

    // ── 異常 ──
    if (notFound.length > 0) {
        console.log('\n⚠️  REVISIONS 沒列到的 painCards (不會動)：');
        for (const card of notFound) {
            console.log(`  ${card.id.padEnd(28)} ${(card.before || '').slice(0, 50)}`);
        }
    }

    console.log(`\n── 總結 ──`);
    console.log(`  將 delete : ${toDelete.length}`);
    console.log(`  將 update : ${toUpdate.length}`);
    console.log(`  未涵蓋   : ${notFound.length}`);
    console.log(`  保留總數 : ${allCards.length - toDelete.length}`);

    if (DRY_RUN) {
        console.log(`\n>>> 這是 dry-run。確認後加 --apply：`);
        console.log(`    node scripts/apply-paincard-revision.mjs --apply\n`);
        return;
    }

    // ─── APPLY ──────────────────────────────────────────────
    console.log(`\n── 開始備份 + 寫入 ──\n`);

    const batch = db.batch();
    const backupRef = db.collection(BACKUP_COLLECTION);
    const cardsRef = db.collection('painCards');

    // DELETE
    for (const { card, rev } of toDelete) {
        const { id, ...original } = card;
        batch.set(backupRef.doc(card.id), {
            ...original,
            _backupAt: new Date().toISOString(),
            _migrationVersion: '2026-05-28-paincard-revision',
            _operation: 'delete',
            _reason: rev.reason,
        });
        batch.delete(cardsRef.doc(card.id));
        console.log(`  🗑️  ${card.id.padEnd(28)} 備份 + 刪除`);
    }

    // UPDATE
    for (const { card, rev } of toUpdate) {
        const { id, ...original } = card;
        batch.set(backupRef.doc(card.id), {
            ...original,
            _backupAt: new Date().toISOString(),
            _migrationVersion: '2026-05-28-paincard-revision',
            _operation: 'update',
        });
        batch.update(cardsRef.doc(card.id), { relatedToolId: rev.relatedToolId });
        console.log(`  ✅ ${card.id.padEnd(28)} 備份 + relatedToolId=${rev.relatedToolId || 'null'}`);
    }

    console.log(`\n  正在 commit...`);
    await batch.commit();
    console.log(`\n✅ 完成。備份位置：${BACKUP_COLLECTION}/{id}\n`);
}

main().catch(err => {
    console.error('\n❌ 執行失敗：', err.message);
    console.error(err.stack);
    process.exit(1);
});
