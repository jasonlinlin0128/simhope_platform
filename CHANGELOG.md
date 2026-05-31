# Changelog

## [0.6] — 2026-05-29

延續 v0.5 把 spec 的 deferred backlog 收尾：新增 embedded 場域工具類型、
admin 審核 wizard 的 AI 預填、啟用 Firebase Storage 檔案上傳。

### 新增

- **embedded 場域工具類型**（第 6 種 type）：綁定特定電腦／設備、沒有可點
  啟動連結的工具（影印機浮水印、產線電腦外掛等）
  - CTA「📍 查看部署資訊」、詳情頁「📍 部署資訊」tab
  - `typeData`: location / accessNote / contact
  - t8（機敏辦公室影印機浮水印）、t9（MasterCAM 外掛）已轉 embedded
- **AI 預填**（admin 審核 wizard）：`POST /api/admin/enrich-tool`
  - 讀工具主連結的 GitHub README（私有／抓不到也 OK）→ Gemini 2.5 Flash
    生成建議的 desc（Pattern C）/ scenarios / tags / icon / typeData
  - wizard Step 2 加「✨ AI 補完」按鈕，只覆蓋 AI 有回傳的欄位
- **Firebase Storage 檔案上傳**：
  - block editor（圖片 / 語音）、admin wizard（download / doc 的 fileUrl）
    出現「📤 上傳」按鈕，上傳到 `tool-files/<prefix>/`
  - `storage.rules`: tool-files 讀公開、寫需登入 + 200MB 上限
  - `STORAGE_ENABLED` feature flag（src/lib/storage.js）控制總開關
  - `UploadButton` 共用元件（flag 關時不渲染、退回貼 URL）

### 內部

- migration `scripts/migrate-embedded-type.mjs`（t8/t9 → embedded，
  idempotent + 備份 tools-backup-2026-05-29-embedded）
- `scripts/deploy-storage-rules.mjs`：用 service account 透過 Firebase Rules
  REST API 部署 storage.rules（需 firebaserules.admin 權限，否則 Console 手動發）
- **嚴守部署順序**（記取 v0.5 的 P0 教訓，見 AGENTS.md）：
  code merge → production deploy 成功 → 才跑 migration `--apply` → live 站驗證

### 文件

- AGENTS.md 新增「部署與資料遷移的順序」根因檢討段落
- footer 版號 → v0.6

---

## [0.5] — 2026-05-29

把平台從「應用工具收錄站」擴展為「內部 AI 資源中心」。新增 5 種類型
(webapp/download/doc/mcp/api) 取代原本 3 種；提交流程改 4 欄極簡，
admin 補完細節透過審核 wizard；首頁改 Vercel Marketplace 風。

### 新增

- **5 種類型**：webapp / download / doc / **mcp (AI 連接器)** / **api (API/SDK)**
  取代原本的 3 種（webapp / download / showcase）
- **`typeData` 子物件**：每種類型獨立的擴充欄位（fileUrl、mcpbUrl、
  npmPackage、configSnippet、endpoint 等）
- **`audio` block type**：rich block editor 第 7 種，HTML5 audio + caption
  - source 標籤（NotebookLM / SoundCloud / 直接上傳 / 其他）
- **詳情頁 tab 切換**：依 type 動態決定 tab（webapp 單 tab、download/doc
  雙 tab、mcp 三 tab、api 雙 tab）
  - 🚀 快速安裝
  - 🧰 進階設定
  - 📖 詳細說明（顯示 Pattern C desc + blog.blocks）
- **首頁 Vercel Marketplace 風**：頂部搜尋框（Fuse.js）+ 類型 chip
  - 場景 chip；卡片底部「一鍵動作」CTA 按鈕依類型不同顏色
- **痛點類別系統**：7 個直覺類別 chip（🌏 跨國溝通 / 📊 日報表 /
  📄 文書處理 / 🛡️ 資安管控 / 🏭 生產製造 / 🔧 品保 / 📋 行政協作）
- **painCard 可點跳工具**：有 `relatedToolId` 時整張卡可點，導到對應
  工具詳情頁
- **已終止工具藏底部**：主列表只顯示 active，已終止工具放在頁面底部
  可摺疊區
- **admin 審核 wizard**（3 step）：
  - Step 1 — 看作者提交（唯讀）
  - Step 2 — 補完細節（typeData / desc / dept / folder / scenarios / icon / color）
  - Step 3 — 預覽 + 上架（live/beta/new/dev）/ 退回 / 存草稿
- **提交表單砍到 4 欄**：名字 + tagline + 主連結 + 類型

### 變動

- 17 個工具的 tagline + desc 全部改寫成 Pattern C（Before / After 結構）
  - 7 個原版 pc 系列 / 11 個 random ID / 6 個 AI 系列保留
- 38 張 painCards 整理：砍 14 張 AI 重複版、24 張補 `relatedToolId`
- 4 個工具 title 改名：
  - 遠地出差工具 → 遠地出差津貼申請系統
  - 批量電子簽章工具 → 批量電子簽章小幫手
  - 修改檔案日期工具 → 檔案時間編輯小工具
  - SOP-Interface → SOP-Interface APP
- t9 / t15 從 showcase 改成 download / webapp（showcase 類型砍掉）
- testimonials 重寫對齊現有工具（t1 / t3a / t_sop_interface / t_toolbox）

### 移除

- showcase 類型（用 status=dev 表達「規劃中」即可）

### 內部

- migration scripts：
  - `scripts/migrate-types.mjs` — schema 升級 + tools 對應
  - `scripts/apply-copy-revision.mjs` — 17 工具 Pattern C 文案
  - `scripts/apply-paincard-revision.mjs` — painCards 整理
  - `scripts/apply-paincard-category.mjs` — painCard 類別欄位
- 所有 migration script 都 idempotent + 自動備份
- 備份 collections：
  - `tools-backup-2026-05-27/{toolId}` (schema migration)
  - `tools-backup-2026-05-28/{toolId}` (copy revision)
  - `painCards-backup-2026-05-28/{id}` (painCards 整理)
  - `painCards-backup-2026-05-29/{id}` (category 欄位)
- 新 dep：`fuse.js` ^7（首頁模糊搜尋）

---

## [0.4] — 2026-04-09

### 新增

- 開發者帳號管理：管理員可在 `/admin` 直接建立 email/password 開發者帳號（使用 secondary Firebase App，不影響 admin 登入狀態）
- Rich block editor：工具詳情頁支援文字、步驟、圖片、影片、提示、警告六種 block，by author 或 admin 可編輯

### 修正

- Firestore 安全規則強化：限制 `users` collection 寫入、admin guard 防止越權
- Block ID 穩定性：edit mode 進入時補齊缺少 ID 的舊 block，避免 key 衝突
- 深色模式對比：白色卡片改用 `card-bg` CSS 變數，避免深色模式下出現白底

---

## [0.3] — 2026-04-08

### 新增

- 開發者儀表板：可提交工具、查看自己提交的工具
- Auth roles：`admin` / `developer` / 一般用戶三級權限
- Firestore rules：按 role 控制讀寫權限

### 修正

- Auth roles 判斷邏輯、dashboard 編輯連結
- Vercel 部署設定（`app/` 移至 repo root，`vercel.json` 簡化）

---

## [0.2] — 2026-04-06

### 新增

- 首頁完整改版：Hero、stats 卡片、場景篩選、痛點區、同仁回饋、CTA
- AI 小幫手 ChatbotWidget（浮動，功能建置中）
- 工具卡深色模式支援

### 修正

- 程式碼審查後修正：download url key、files schema、showcase TypeError
- 字型換 Nunito + Noto Sans TC，blob 背景效果調整

---

## [0.1] — 2026-04-06

- 初始版本：Next.js App Router + Firebase + Tailwind 架構建立
- 工具卡元件、首頁基礎版、Navbar、LoginModal
