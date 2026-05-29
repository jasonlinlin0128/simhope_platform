# SimHope 平台：資源類型擴充 spec

**建立日期**：2026-05-27
**狀態**：✅ **implemented 2026-05-29** — 全 7 phase 完成（含追加的 2.5~2.9 polish phases）
**參考 mock**：[docs/mocks/resources-expansion-mockup-v2.html](../../mocks/resources-expansion-mockup-v2.html)

### Phase 完成狀態
- ✅ Phase 1 — schema migration (commit f97fa8e)
- ✅ Phase 2 — 首頁 Vercel Marketplace 風 (commit 2aad5be)
- ✅ Phase 2.5 — 已終止藏底部 (commit 4264853)
- ✅ Phase 2.6 — 17 工具 Pattern C 文案 (commit 4c4f66c)
- ✅ Phase 2.7 — painCards 整理 + 可點 (commit 93a0137)
- ✅ Phase 2.8 — 痛點類別系統 (commit a4c810a)
- ✅ Phase 2.9 — testimonials 重寫 (commit b2db5ba)
- ✅ Phase 3 — 詳情頁 tab 切換 (commit cc79eb5)
- ✅ Phase 4 — block editor 加 audio (commit 9b1acf9)
- ✅ Phase 5 — 提交表單砍到 4 欄 (commit c547134)
- ✅ Phase 6 — admin 審核 wizard (commit a706287)
- 🔲 Phase 7 — 文件 + PR (進行中)

### 已知 deferred 事項
- Firebase Storage 上傳功能（admin wizard 目前只接受 URL）—
  需先在 Firebase Console 啟用 Storage + 部署 storage.rules
- AI 預填（admin wizard 自動讀 GitHub README）— 推 phase 2
- 拆分 /resources 獨立分頁 — 推 phase 2

### §10 預設答案

1. **typeData 欄位**：configSnippet 保持字串（簡單），不拆結構化 JSON
2. **場景 chip**：保留現有 5 個場景（生產現場 / 跨國溝通 / 文書處理 / 行政簽核 / 法務合約等），不重新整理
3. **檔案上傳**：無大小上限、無掃毒（內部使用，Firebase Storage 自帶基本檢查）
4. **t9 遷移**：自動轉 `type: download` + `status: dev`，不手動審
5. **Phase 順序**：Phase 1 先跑遷移，舊資料 + 新 schema 並存的過渡期可接受

---

## 1. 背景與目標

### 為什麼做這個

目前平台只收 **三種類型**（網頁應用 / 軟體下載 / 展示），主要服務「同仁做出來的應用程式跟工具」。但隨著公司內部產出多元化，會有越來越多 **非執行檔的成果** 需要集中管理：

- MCP server（讓 Claude/Cursor 直接呼叫的接口）
- API / SDK（給工程師串接的程式介面）
- 文件 / 表單（ISO 表單、SOP、Notion 匯出的文件）

目標：把這個平台從「工具收錄站」擴充為**內部 AI 資源中心**，同仁只要記住一個網址，就能找到所有公司內部的 AI 相關資源。

### 不做的事（out of scope）

- 不做開發者社群、評分、評論系統（保留現有單向收錄模式）
- 不做付費 / 計費（內部免費）
- 不做 AI 預填功能（推 phase 2）
- 不做拆分 `/resources` 獨立分頁（這次先擴 type，未來拆頁）

---

## 2. 核心設計決策（confirmed）

| 主題 | 決策 |
|------|------|
| **類型分類** | 5 種類型單選：網頁應用 / 軟體下載 / 文件 / AI 連接器（MCP）/ API / SDK |
| **showcase 處理** | 取消「展示」類型，t9 改為 `type: download` + `status: dev`，CTA 自動變灰 |
| **首頁風格** | Vercel Marketplace 風 — 卡片底部有依類型不同顏色的「一鍵動作」按鈕 |
| **篩選 UI** | 頂部搜尋框 + 類型 chip 列（單選）+ 場景 chip 列（多選） |
| **詳情頁** | Tab 切換：🚀 快速安裝 / 🧰 進階設定 / 📖 詳細說明 |
| **提交表單** | 4 欄極簡：名字 + tagline + 主連結 + 類型 |
| **MCP 基礎建設** | 不架 npm registry。.mcpb 上傳 Firebase Storage + GitHub Private 原始碼 |
| **檔案存放** | 混合策略：核心交付物（.mcpb / .exe / 文件）走 Firebase Storage；說明性媒體（圖片 / 影片 / 語音）允許外連 |
| **語音 block** | 新增 audio block；HTML5 audio 原生播放器；支援上傳 + 外連 |
| **AI 預填** | 推 phase 2；這次 admin 在 wizard 手動補資料 |

---

## 3. 五種「類型」詳細定義

> **判斷原則**：類型 = 同仁最後拿到的形式，跟「做這個工具用了什麼技術」無關。

| 類型代碼 | 顯示名稱 | 顏色 | 卡片 CTA | 拿到的形式 |
|---------|---------|-----|---------|----------|
| `webapp` | 🌐 網頁應用 | 紫 | 「🌐 馬上打開 →」 | 一個網址，點開瀏覽器直接用 |
| `download` | ⬇️ 軟體下載 | 藍 | 「⬇️ 下載安裝檔 →」 | .exe / .msi / .dmg 安裝檔 |
| `doc` | 📄 文件 / 表單 | 橘 | 「⬇️ 下載 (.docx) →」 | PDF / Word / Excel / ZIP 等可下載檔案 |
| `mcp` | 🔌 AI 連接器（MCP） | 綠 | 「📦 安裝到 Claude / Cursor →」 | 給 AI 工具呼叫的接口（.mcpb 或 npm package） |
| `api` | 🧩 API / SDK | 黃 | 「🔗 看 API 文件 →」 | REST API endpoint / Python pip package / JS npm package |

### CTA 行為（依類型 + 狀態決定）

- `status: live / beta / new` → CTA 可點，跳到 `url`（或詳情頁的相應 tab）
- `status: dev / pending` → CTA 變灰，顯示「🚧 開發中，敬請期待」
- `status: terminated` → CTA 變紅，顯示「⛔ 已終止維護」

---

## 4. 欄位設定（Firestore schema 變動）

### 4.1 `tools` collection 欄位異動

```javascript
{
  // === 提交時必填（4 個欄位） ===
  "title": "ISO 表單查詢 MCP",
  "tagline": "把 ISO 表單接到 Claude/Cursor",
  "url": "https://github.com/simhope/iso-form-mcp",   // 主連結
  "type": "mcp",   // ✨ 5 種選項：webapp | download | doc | mcp | api

  // === 系統自動填 ===
  "status": "pending",
  "authorUid": "...",
  "createdAt": ..., "updatedAt": ...,

  // === 審核後 admin / 作者補（新增） ===
  "typeData": {                  // ✨ NEW：類型特定欄位（見 4.2）
    // 內容依 type 不同而異
  },

  // === 維持不變 ===
  "icon": "📋",
  "color": "c5",
  "dept": "admin",
  "folder": "行政作業專案",
  "scenarios": ["行政簽核"],
  "blog": { "summary": "...", "blocks": [...] }
}
```

### 4.2 `typeData` 子物件結構（依類型不同）

#### `type: 'webapp'`
```javascript
typeData: {}    // 空，url 就夠
```

#### `type: 'download'`
```javascript
typeData: {
  fileUrl: "https://firebasestorage.googleapis.com/.../installer.exe",  // Firebase Storage URL
  platform: "windows",          // windows | mac | linux | crossplatform
  version: "v1.2.0",
  fileSize: 12500000,           // bytes
  fileName: "simhope-toolbox-v1.2.0-setup.exe"
}
```

#### `type: 'doc'`
```javascript
typeData: {
  fileUrl: "https://firebasestorage.googleapis.com/.../iso-form.docx",
  fileType: "docx",             // pdf | docx | xlsx | zip | other
  version: "v2026.05",          // 文件版本
  fileSize: 850000,
  fileName: "出差申請單-v2026.05.docx"
}
```

#### `type: 'mcp'`（最複雜）
```javascript
typeData: {
  mcpbUrl: "https://firebasestorage.googleapis.com/.../iso-form-mcp.mcpb",
  mcpbSize: 2300000,
  repoUrl: "https://github.com/simhope/iso-form-mcp",  // GitHub Private
  configSnippet: '{ "mcpServers": { "iso-form": { "command": "npx", "args": ["-y", "github:simhope/iso-form-mcp"] } } }',
  installInstructions: "需要先設定 GitHub PAT，見 README"   // optional 補充說明
}
```

#### `type: 'api'`
```javascript
typeData: {
  endpoint: "https://api.simhope.local/translate",     // 內部 API endpoint
  docsUrl: "https://docs.simhope.local/translate",     // API 文件
  openapiUrl: "https://api.simhope.local/openapi.json", // optional, OpenAPI spec
  sdkPackage: "@simhope/translate-sdk"                  // optional, SDK 套件名
}
```

### 4.3 blog.blocks 新增 audio 類型

現有 6 種 block：`text` / `steps` / `image` / `video` / `tip` / `warning`

新增第 7 種：

```javascript
{
  id: "uuid-here",
  type: "audio",                              // ✨ NEW
  content: "https://...firebasestorage.../intro.mp3",   // URL（上傳或外連都填這）
  caption: "工具介紹 podcast（NotebookLM 產出）",       // 顯示在播放器下方
  source: "notebooklm"                        // optional tag：notebooklm | soundcloud | upload | other
}
```

前端渲染：HTML5 `<audio controls>` + caption + 來源標籤（如有）。

---

## 5. UI 變動

### 5.1 首頁 (`app/page.jsx`)

**移除**：
- 左側篩選欄（場景 checkbox sidebar）

**新增**：
- 頂部搜尋框（Fuse.js 模糊比對 `title` / `tagline` / `tags`，debounce 300ms）
- 頂部類型 chip 列（單選）
- 頂部場景 chip 列（多選，原 sidebar 的 scenarios 升級成 chip）

**卡片變動**：
- 卡片底部新增「一鍵動作」CTA button，依類型顏色不同（見 §3）
- 「適用場景」標籤縮小成右下角小標籤
- 狀態 badge（使用中 / 測試中 / 開發中）保留

### 5.2 工具詳情頁 (`app/tool/[id]/page.jsx`)

**從原本的單頁長 scroll → 改 Tab 切換**：

| Tab | 顯示條件 | 內容 |
|-----|---------|------|
| 🚀 **快速安裝** | `type` ∈ { mcp, download, doc } | 一鍵動作大按鈕 + 三步驟說明 |
| 🧰 **進階設定** | `type` ∈ { mcp, api } | npm config / git clone / API endpoint / OpenAPI 文件等技術細節 |
| 📖 **詳細說明** | 永遠顯示 | 現有 block editor 內容（含新增的 audio block） |

`type: 'webapp'` 沒有「快速安裝」跟「進階設定」tab，只剩「詳細說明」，加上 header 區大大的「🌐 馬上打開」按鈕。

### 5.3 提交表單 (`app/dashboard/page.jsx`)

**從 12+ 欄位砍到 4 欄必填**：

| 欄位 | 型別 | placeholder |
|------|------|------|
| 工具名字 | text | 例：ISO 表單查詢 MCP |
| 一句話介紹 | text | 例：把 ISO 表單接到 Claude/Cursor 裡 |
| 主連結 | url | 網頁：直接貼網址 / MCP / API：貼 GitHub repo / 文件：貼 Drive 連結 |
| 類型 | radio | 5 選 1（每個選項配「適合什麼情況」說明） |

**保留**：
- 「AI 幫忙生成文案」按鈕（Gemini 2.5 Flash）— 補 tagline / 推測 icon emoji
- 我提交的工具列表（右半邊）

**砍掉**：
- 部門選單、folder、適用場景、使用步驟（s1/s2/s3）、tags 欄位
- 改由 admin 在 wizard 階段補

### 5.4 admin 後台 (`app/admin/page.jsx`)

**重新設計成「審核 wizard」**：

#### Step 1 — 看作者提交資料
- 顯示作者填的 4 欄
- 顯示 metadata（提交者 / 提交時間 / 主連結預覽截圖）
- 「進入下一步」按鈕

#### Step 2 — 補完細節
- 編輯所有欄位：
  - 類型專屬欄位（typeData 依當前 type 動態顯示對應 fields）
  - 上傳檔案（.mcpb / .exe / .docx → Firebase Storage）
  - 部門、folder、適用場景、icon、color
  - blog.summary + blog.blocks（沿用現有 block editor，新增 audio block）
- 設定狀態：live / beta / dev / pending
- 「預覽」按鈕

#### Step 3 — 預覽 + 上架
- 顯示工具卡（首頁樣式）
- 顯示工具詳情頁（含所有 tab）
- 動作按鈕：「上架」/「退回給作者修改」/「先存草稿」

**舊有的管理功能（編輯已上架工具、痛點卡管理、開發者帳號建立）維持，移到 wizard 之外的 tab。**

---

## 6. 檔案 / 媒體上傳

### 6.1 Firebase Storage 結構

```
gs://simhope-platform.appspot.com/
├── tools/
│   ├── {toolId}/
│   │   ├── installer/         # .exe / .msi / .mcpb
│   │   ├── docs/              # PDF / Word / Excel / ZIP
│   │   ├── images/            # 截圖（image block 上傳的）
│   │   └── audio/             # 語音檔
```

### 6.2 上傳介面（admin wizard Step 2 內）

- 拖拽 / 點擊上傳
- 顯示上傳進度
- 上傳成功後顯示檔案大小、檔名、複製 URL 按鈕
- 支援刪除 / 替換

### 6.3 外連 URL 處理

- 圖片 block / 影片 block / 語音 block 都支援「外連 URL」輸入
- 影片 block 接受 YouTube / Vimeo / Loom 標準 share URL，渲染成 iframe embed
- 語音 block 接受任何 audio file URL，渲染 HTML5 audio

---

## 7. 遷移計畫

### 7.1 現有 14 筆工具的 type 轉換

| 原 type | 新 type | 動作 |
|---------|--------|------|
| `webapp` (11 筆) | `webapp` | 不變，補空 `typeData: {}` |
| `download` (2 筆) | `download` | 補 `typeData: { fileUrl: <既有 url>, platform: 'windows' }` |
| `showcase` (1 筆, t9) | `download` | type 改 download，status 維持 `dev`，`typeData: {}` |

### 7.2 遷移腳本

寫 `scripts/migrate-types.mjs`：

- **dry-run 模式**（預設）：印出每筆變更前後對照，不寫 Firestore
- **`--apply` 旗標**：實際寫入
- **rollback 計畫**：腳本同時備份原資料到 `tools-backup-2026-05-27/{toolId}`

執行步驟（Jason 操作）：
```bash
node scripts/migrate-types.mjs              # 看 dry-run
node scripts/migrate-types.mjs --apply       # 確認後實際跑
```

---

## 8. 可見性 / 權限

| 狀態 | 一般同仁 | developer | admin |
|------|---------|-----------|-------|
| `live` / `beta` / `new` | ✅ 看得到 | ✅ | ✅ |
| `pending` | ❌ | ✅（限自己提交的） | ✅ |
| `dev` | ✅ 看得到（CTA 變灰） | ✅ | ✅ |
| `terminated` | ✅ 看得到（CTA 變紅） | ✅ | ✅ |

`beta` 狀態的卡片詳情頁頂部加一行小提示：「⚠️ 這個工具還在測試中，可能不穩定」。

MCP install 指令不需登入即可看（內部 npm 套件名 / GitHub Private repo 路徑不算機敏，外人沒 PAT 也裝不起來）。

---

## 9. 實作步驟（給 Jason 確認後依序執行）

> 整個任務在 `feature-resources-expansion` branch 完成，分批 commit 方便 review。

### Phase 1 — 資料模型 + 遷移腳本
1. 寫 `scripts/migrate-types.mjs`（dry-run mode）
2. 跑 dry-run，給 Jason 確認 diff
3. Apply 寫入 Firestore
4. 更新 `firestore.rules` — `typeData` 寫入限制（沿用現有規則）

### Phase 2 — UI：首頁
5. 改 `app/page.jsx`：移除 sidebar，新增頂部搜尋框 + 類型 chip + 場景 chip
6. 改 `src/components/ToolCard.jsx`：新增依類型不同顏色的 CTA button
7. 安裝 Fuse.js，做模糊搜尋

### Phase 3 — UI：詳情頁
8. 改 `app/tool/[id]/page.jsx`：加 Tab 切換結構
9. 寫「快速安裝」tab UI（依 type 動態渲染）
10. 寫「進階設定」tab UI（MCP / API 專用）
11. 詳細說明 tab 沿用 block editor

### Phase 4 — block editor 擴充
12. 新增 `audio` block type
13. block editor UI 加「上傳音檔」+「貼外連」兩種輸入
14. 前端渲染 HTML5 audio + caption + source 標籤

### Phase 5 — UI：提交表單
15. 改 `app/dashboard/page.jsx`：砍到 4 欄
16. 類型 radio 加「適合什麼情況」說明文字

### Phase 6 — admin wizard
17. 重新設計 `app/admin/page.jsx`：審核 wizard 3 步驟
18. 寫 Firebase Storage 上傳元件
19. 動態 typeData 編輯器（依 type 顯示不同 fields）
20. 預覽功能

### Phase 7 — 收尾
21. 更新 `docs/admin-guide.md` 反映新流程
22. 更新 `docs/developer-guide.md` 反映新提交表單
23. 更新 `README.md` / `CHANGELOG.md`
24. PR review + merge

---

## 10. 待 Jason 確認的事項

請在 review spec 後告訴我：

1. **§4.2 typeData 各欄位**有沒有少或多？特別是 MCP 的 configSnippet 字串是否要拆成結構化 JSON（servers / args / env）方便動態渲染？
2. **§5.1 場景 chip 列**：你想保留現有 5 個場景，還是趁這次重新整理一套？
3. **§5.4 admin wizard Step 2**：上傳檔案這塊要不要加自動掃毒 / 檔案大小上限？目前我預設沒上限
4. **§7.2 遷移腳本**：t9 自動轉成 download + dev，OK 嗎？還是你想趁這次手動審視一次 14 筆資料？
5. **§9 phase 順序**：Phase 1 先做 + 跑遷移，會讓你看到「舊資料 + 新 schema」並存的狀態。沒問題嗎？還是要 phase 1 跟 2 一起做、不要過渡期？

確認後我會把這份 spec status 改為 approved，開 `feature-resources-expansion` branch 開始實作。

---

## 附錄 A — 名詞對照表

| 這份 spec / 同仁文案 | 程式碼 / 技術名詞 |
|---------------------|------------------|
| 類型 | `type` 欄位 |
| 狀態 | `status` 欄位 |
| AI 連接器 | MCP (Model Context Protocol) |
| 標籤 | badge / chip |
| 欄位設定 | schema |
| 一次性轉換 | migration |
| 類型專屬欄位 | typeData sub-document |
| 安裝包 | .mcpb file |
| 一鍵動作按鈕 | primary CTA button |

---

## 附錄 B — 不在這次範圍的事項（phase 2 候選）

- AI 預填（從 GitHub README 推測 typeData、blog 草稿）
- 拆分 `/resources` 獨立分頁
- 工具使用統計（點擊量、下載量）
- 評論 / 評分 / 收藏
- 工具版本歷史 / changelog 顯示
- 內部 npm registry 架設（如果 MCP 數量到 5+ 個再評估）
- 多語言（i18n）
- 工具相依關係圖（這個 MCP 用了哪個 API、這個 webapp 嵌入了哪個 SDK）
