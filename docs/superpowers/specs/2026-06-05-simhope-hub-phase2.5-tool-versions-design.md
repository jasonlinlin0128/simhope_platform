# SimHope Hub Phase 2.5 — 工具版本歷史（per-tool version history）

> 狀態：設計定稿（2026-06-05）。承接 Phase 2 spec §10「Phase 2.5（草案）」，把它落實成可實作 spec。
> 前置事實：Phase 1 / 2 / 2.x / 2.y 全上線並驗 live；本功能新增、不依賴未完成項目。

## 1. 目標與範圍

每個工具有一份**自己的版本歷史**（不同於全站 `/changelog`），記錄每一版的版號、日期、更新說明，
有檔案的工具（download / doc / skill）每一版可綁自己的下載檔，**舊版檔保留可下載**。

- **誰看**：所有訪客在詳情頁看版本歷史；最新版驅動下載鈕與「最後更新」。
- **誰編**：沿用「作者可編自己工具 + admin 可編全部」。單一共用 `VersionEditor` 元件，
  同時用在「詳情頁編輯模式」（管理完整歷史）與「admin 審核 wizard」（首發即設第一版）。
- **不是什麼**：不是全站平台 changelog（那是 `CHANGELOG.md` → `/changelog`，不同系統，不整併）。

### 為何這功能「半埋好」了

實作前掃描發現本功能已有多處伏筆，本 spec 是把它收尾並補齊 UI / migration：

- `app/tool/[id]/page.jsx:704`、`:1073` 已讀 `tool.versions?.at(-1)?.fileUrl`（下載連結 fallback 到「最新版的檔」）。
- `app/dashboard/page.jsx:159`、`scripts/migrate-types.mjs:95,124` 建工具時已初始化 `versions: []`。
- Phase 2 spec §10 已拍板資料模型 `{ version, date, notes, fileUrl? }` 與 migration 策略。
- 根目錄 scratch `test_dash.js` 有一份版本編輯器 UI 原型（`addVersionRow` / `getVersionsData`）——
  **只取其互動 UX（每列：版號 / 說明 / 檔案，可增刪），欄名不採**（原型用 `releaseNotes`、無 `date`，且該檔列入 repo cleanup 待刪）。

## 2. 資料模型

工具文件（`tools/{id}`）的 `versions` 欄位：

```ts
tool.versions: Array<{
  version: string   // 版號，必填，如 "v1.2.0"
  date: string      // 發布日期 "YYYY-MM-DD"，手動輸入，新增時預設今天
  notes: string     // 更新說明，markdown（用既有 react-markdown + remark-gfm 渲染）
  fileUrl?: string  // 該版下載檔；download / doc / skill 才有，webapp / mcp / api 省略
}>
```

**排序約定（重要，不可破壞既有讀取）**：

- 陣列順序＝**舊 → 新**（chronological ascending），**最後一筆（`versions.at(-1)`）＝目前版**。
  此約定沿用既有伏筆程式碼 `versions.at(-1)?.fileUrl`，不可反轉。
- 「目前版」定義為**陣列位置**（最後一筆），非「date 最大者」。編輯器「新增」是 append 到尾端，
  搭配上下移控制，由作者掌控順序，行為可預測。
- 前台**顯示**時反轉成新 → 舊（reverse），不依 date 排序。

**欄名**定為 `{ version, date, notes, fileUrl }`（採 Phase 2 spec 版）。

## 3. 單一真相＝versions[]

確認決策：「目前版本 / 檔」一律以 `versions.at(-1)` 為準。**所有顯示下載 / 版號的地方都要同步改**，
否則卡片與詳情頁會不一致（review 抓到的漏洞，見下）。

- **快速安裝 tab + sidebar 下載鈕**（詳情頁）：下載連結與版號改讀 `versions.at(-1)`；
  fallback 順序：`versions.at(-1)?.fileUrl` → 舊 `tool.url` / `typeData.fileUrl` / `typeData.skillZipUrl`
  （給「還沒 migrate」或「versions 為空」的工具，確保不迴歸）。
- **卡片 CTA `getCTA()`（`src/lib/taxonomy.js`，首頁 / hub 卡片用）**：⚠️ 原本 download/doc 讀 `tool.url`、
  skill 讀 `typeData.skillZipUrl`，**完全沒碰 versions[]**。必須把 `versions.at(-1)?.fileUrl` 設為 download/doc/skill
  的**最優先**下載來源（再 fallback 舊欄位）。否則作者在詳情頁加新版（新檔）後，卡片仍下載舊檔、詳情頁下載新檔。
- **「最後更新 {date}」**＝ `versions.at(-1)?.date`，fallback `tool.updatedAt`。
- `typeData.version` / `typeData.fileUrl` 降為 **migration 來源 + 唯讀 legacy fallback**，
  **沒有任何 UI 再寫它們**（見 §4：wizard 也拔掉這兩欄）。不在本輪刪除欄位（留待日後 cleanup）。

## 4. 編輯：單一共用 `VersionEditor`，detail 頁與 wizard 共用

> 設計原則：**版本＋檔案只有一個家 `versions[]`，只有一個編輯元件**。徹底消滅 split-brain，
> 不靠註記掩飾（review 決策）。

### 4.1 共用元件 `src/components/VersionEditor.jsx`

- 受控元件，props：`versions`, `type`, `onChange(nextVersions)`。
- 每一列欄位：
  - **版號**：text，必填。
  - **日期**：`<input type="date">`，新增列時預設今天（`YYYY-MM-DD`）。
  - **更新說明**：textarea，markdown。
  - **檔案**：`UploadButton`（既有元件），`pathPrefix` 依 type 對應 `downloads` / `docs` / `skills`；
    **僅 download / doc / skill 顯示此欄**；webapp / mcp / api 不顯示上傳控制（`fileUrl` 省略）。
- 操作：**＋ 新增版本**（append 到尾端＝成為目前版）、刪除單列、上移 / 下移。

### 4.2 詳情頁編輯模式（作者 / admin 管理完整歷史）

- 在 `/tool/[id]` 既有編輯模式（`isEditMode`）內，於 block 編輯區**之外**嵌入 `VersionEditor`。
- 狀態：詳情頁加 `localVersions` state（初值 `tool.versions || []`），與 `localBlocks` 平行；
  「取消編輯」時一併還原。
- 儲存：沿用既有 `handleSave`，寫入物件加上 `versions: localVersions`，與 `blog.blocks` 同一次 `updateDoc`。

### 4.3 admin 審核 wizard（首次發布即設第一版）

- `src/components/ReviewToolWizard.jsx` **嵌入同一個 `VersionEditor`**，綁 `form.versions`（初值 `tool.versions || []`），
  存檔時寫 `versions: form.versions`（wizard save 既有物件加這欄）。
- ⚠️ **從 wizard 移除 download / doc / skill 的 `version` + `fileUrl` 兩個 typeData 欄位**
  （[ReviewToolWizard.jsx:614–693,831](src/components/ReviewToolWizard.jsx#L614)）——它們被 `versions[]` 取代，
  檔案上傳改在 VersionEditor 的「每版檔案」。
- **保留** download/doc 的 `platform` / `fileType` / `fileName`（工具級、不隨版本變）與 mcp/api 的 config 欄位。
- AI 預填（`typeData`）不再產 `version`/`fileUrl`（若有也忽略，不再有 UI 寫回）。
- 操作流：admin 審 pending 工具時，就在 wizard 用版本編輯區設 v1.0＋上傳檔＋寫說明，
  與日後在詳情頁編輯是**同一介面、同一寫入目標**。

## 5. 前台呈現：「🕒 版本」tab + `VersionHistory`

- `src/lib/taxonomy.js` 的 `getTabsForType(type)` 邏輯**不改死**；改由詳情頁依「是否有版本」決定是否插入版本 tab：
  - **僅當 `versions.length >= 1` 才顯示**「🕒 版本」tab（避免大量無歷史的 webapp 多一個空 tab）。
  - 作法：詳情頁在組 tabs 時，於 `getTabsForType` 回傳結果後，若 `tool.versions?.length` 則 append `{ key: 'versions', label: '🕒 版本' }`。
    （保持 `taxonomy.js` 單純：tab 是否出現依「資料有無」是 page 層的責任，非 type 元資料。）
  - 編輯模式永遠顯示 `VersionEditor`（即使目前 0 筆），讓作者能新增第一版。
- 新元件 `src/components/VersionHistory.jsx`（props：`versions`）：
  - 將 `versions` reverse 成新 → 舊。
  - 每筆：版號 badge + 日期 + markdown 說明（複用詳情頁既有 `MarkdownContent` 風格）+（有 `fileUrl` 才給「⬇️ 下載此版」鈕）。
  - 頂部小字「最後更新 {最新版 date}」。
- 詳情頁 `DetailTabs` 加 `activeKey === 'versions' && <VersionHistory versions={...} />` 分支。

## 6. Migration：`scripts/migrate-tool-versions.mjs`

照 AGENTS.md 鐵律：預設 dry-run、`--apply` 才寫、寫前自動備份 `tools-backup-YYYY-MM-DD/`、idempotent。

對每個工具：

1. 若 `versions` 已有 ≥1 筆 → **skip**（idempotent，可重跑）。
2. 否則若有 legacy 版本訊號（`typeData.version` 或既有檔 `typeData.fileUrl` / `typeData.skillZipUrl` /
   download 型的 `tool.url`）→ seed 單筆：
   ```js
   versions = [
     {
       version: typeData.version || "v1.0",
       date: toYMD(tool.createdAt || tool.updatedAt) || "", // 無法判定就留空字串
       notes: "",
       fileUrl:
         typeData.fileUrl ||
         typeData.skillZipUrl ||
         (tool.type === "download" ? tool.url : undefined),
     },
   ];
   ```
   （`undefined` 的 `fileUrl` 不寫入欄位。）
3. 純 webapp / 無版本訊號 → 留 `versions: []`，**不捏造版本**。
4. **不刪** `typeData.version`（留 legacy）。

**部署順序（鐵律）**：讀 `versions[]` 的新 code 先 merge + production deploy 綠燈 → 才跑 `--apply` → 連 live 站驗證
（首頁可用資源數不掉、download 型工具下載鈕仍可下載、版本 tab 顯示正確）。
※ 因讀取端有 fallback，理論上兩種順序都安全，但仍守鐵律避免「資料 × 程式碼」組合在 runtime 出錯。

## 7. firestore.rules

**不需改**。`versions` 是既有 `tools/{id}` 文件上的欄位，受既有 update 規則
（`firestore.rules:44` `作者 || admin` 可改任意欄位）涵蓋。本輪**無新 collection、無需 Console 手動發布**。

## 8. 不做（YAGNI）

- 每版下載次數統計、semver 格式驗證、版本間 diff、發新版時通知（Discord / email）。
- 與全站 `/changelog`（`CHANGELOG.md`）整併或互相帶資料。
- 舊版檔的清理 / 保留政策設定 UI（預設「舊版檔留 Storage 可下載」，不刪、不設定）。

## 9. 風險與迴歸面

1. **下載顯示改讀 versions[]（多處）**：詳情頁快速安裝 tab、sidebar 下載鈕、**以及卡片 `getCTA()`**
   三處都要改讀 `versions.at(-1)` 並保留舊欄位 fallback。任一處漏改＝卡片與詳情頁下載不一致。
   migrate 後與「versions 為空時的 fallback」兩條路徑都要實測能下載。
2. **wizard 拔欄迴歸**：移除 wizard 的 download/doc/skill `version`/`fileUrl` 後，要確認：
   ① 既有 `platform`/`fileType`/`fileName`/mcp/api config 欄位仍正常；② wizard 存檔正確寫 `versions`；
   ③ AI 預填不再嘗試寫 `version`/`fileUrl`（移除後不報錯）。
3. **block 編輯管線**：版本編輯區與 block 編輯區共用同一 `handleSave` / 同一 edit topbar —
   加完要確認既有 8 種 block 編輯 / 儲存 / 取消還原沒壞。
4. **tab 插入邏輯**：版本 tab 依資料有無動態出現，`activeTab` 修正邏輯（`tabs.some(...)` fallback）
   要確認切換 / 重整 / 編輯後不會卡在不存在的 tab。
5. **migration 的 date 推導**：`createdAt` / `updatedAt` 可能是 Firestore Timestamp 或 JS Date 或缺，
   `toYMD()` 要容錯（無法判定就留空字串，前台日期可缺省）。
6. **排序約定**：務必維持「`at(-1)` = 目前版」，否則破壞既有 `:704`/`:1073` 讀取與下載鈕。

## 10. 驗收標準

- [ ] `VersionEditor` 共用元件在「詳情頁編輯模式」與「admin wizard」皆可新增 / 刪除 / 上下移版本；
      download/doc/skill 列可上傳檔並存到 Storage；webapp/mcp/api 列無上傳欄。
- [ ] wizard 已移除 download/doc/skill 的 `version`/`fileUrl` 欄；改用嵌入的 VersionEditor 寫 `versions`；
      `platform`/`fileType`/`fileName`/config 等保留欄位無迴歸。
- [ ] 詳情頁與 wizard 儲存後 `versions` 正確寫入；既有 block 編輯 / 儲存 / 取消無迴歸。
- [ ] 「🕒 版本」tab 僅在有版本時出現，內容新 → 舊，markdown 說明正確渲染，有檔的版本可下載舊版。
- [ ] 三處下載來源（快速安裝 tab、sidebar 下載鈕、卡片 `getCTA`）都改讀 `versions.at(-1)`，
      空 versions 時 fallback 舊欄位仍可下載（無迴歸）；卡片與詳情頁下載一致。
- [ ] 「最後更新」顯示最新版日期。
- [ ] `migrate-tool-versions.mjs` dry-run 預設、`--apply` 自動備份、可重跑 idempotent；17 工具跑後無迴歸。
- [ ] RWD（手機 / 平板 / 桌機）與既有設計系統一致；`npm run build` + `npm run lint` 綠。
- [ ] 部署順序：code merge + deploy 綠 → 跑 `--apply` → live 站驗證（資源數不掉、下載可用、版本 tab 正確）。

## 11. 實作引擎

實作階段用 **multi-agent Workflow**（使用者已明確 opt-in）fan-out 各任務 + 對抗式審查；
本 spec 之後先進 `writing-plans` 產出任務化 plan，再由 workflow 落地。

## 12. 順手可夾帶（非本 spec 主體，另議）

- **repo cleanup**：`test_dash.js` 等根目錄 scratch（含本功能原型）與 stale branch `code-review/march-2026`。
  本功能上線後這些原型已無保存價值，適合一起清。
- `/faq` 起手內容、首頁 metrics 動態化：低風險快贏，可在同一輪 PR 夾帶或另開。
