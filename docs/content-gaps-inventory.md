# SimHope 工具箱 — 內容缺口清單

> **使用方式**：你逐項填入內容（直接在這份檔案補，或在聊天視窗回我皆可）。每補完一項，把 `[ ]` 改成 `[x]`，或直接告訴我「A-01 給你：…」，我就馬上補實作。
>
> **領域優先序建議**：C（UI 文案/視覺）→ B（README）→ A（工具說明書）→ D（JSDoc）

---

## A. 工具詳情頁內容（Firestore `tools` collection）

> Firestore 即時資料我沒有 admin 憑證無法直接讀寫。  
> **補內容方式（兩擇一）**：  
> (1) 你在 `/admin` 後台逐筆編輯（登入 → 點 ✏️ 編輯 → block editor）  
> (2) 告訴我每個工具的內容 → 我寫 `scripts/seed-tool-content.mjs` → 你用 service account 跑一次

每個工具建議最少補：`blog.summary`（一句話）+ 1 個 text block + 1 個 steps block + 1 個 image block（含 caption）。

### A-01　現場即時翻譯（t1）｜狀態：使用中 live

基本欄位：`tagline` ✓ `desc` ✓ `url` ✓ `icon` ✓

- [ ] **A-01a** `blog.summary`（詳情頁頂部一句話摘要）
  - 需要你提供：一行說明，例如「這是我在工廠現場為泰籍員工打造的即時翻譯工具的開發記錄。」
  - 我這邊會做：寫入 Firestore `blog.summary`（透過種子腳本或 admin UI）

- [ ] **A-01b** `blog.blocks`：text block（用途與背景）
  - 需要你提供：一段文字，說明為什麼做這個工具、解決什麼問題
  - 或：告訴我「草稿由你來」，我從現有 desc 延伸

- [ ] **A-01c** `blog.blocks`：steps block（使用步驟）
  - 需要你提供：確認或修改步驟（現有：選語言 → 說話或打字 → 看翻譯結果）

- [ ] **A-01d** `blog.blocks`：image block + caption（截圖 + alt）
  - 需要你提供：截圖圖檔或圖片 URL（PNG/JPG）+ 說明文字（也是 alt）

---

### A-02　合約快速審查（t2）｜狀態：使用中 live

基本欄位：`tagline` ✓ `desc` ✓ `url` ✓（Gemini 連結）`icon` ✓

- [ ] **A-02a** `blog.summary`
  - 需要你提供：一行摘要

- [ ] **A-02b** `blog.blocks`：text block（用途與背景）
  - 需要你提供：內容 或 「草稿由你來」

- [ ] **A-02c** `blog.blocks`：steps block
  - 需要你提供：確認或修改步驟（現有：上傳合約 → 等 AI 分析 → 查看風險點）

- [ ] **A-02d** `blog.blocks`：image block + caption
  - 需要你提供：截圖 + alt 說明文字

---

### A-03a　加工部日報表（t3a）｜狀態：使用中 live

基本欄位：`tagline` ✓ `desc` ✓ `url` ✓ `icon` ✓

- [ ] **A-03a-i** `blog.summary`
- [ ] **A-03a-ii** `blog.blocks`：text block
- [ ] **A-03a-iii** `blog.blocks`：steps block（現有：填工單工序 → 主管審核 → 月報匯出）
- [ ] **A-03a-iv** `blog.blocks`：image block + caption

---

### A-03b　電控部日報表（t3b）｜狀態：使用中 live

基本欄位：`tagline` ✓ `desc` ✓ `url` ✓ `icon` ✓

- [ ] **A-03b-i** `blog.summary`
- [ ] **A-03b-ii** `blog.blocks`：text block
- [ ] **A-03b-iii** `blog.blocks`：steps block（現有：填專案工時 → 主管審核 → 月報匯出）
- [ ] **A-03b-iv** `blog.blocks`：image block + caption

---

### A-04　內部文件問答庫（t4）｜狀態：測試中 beta

基本欄位：`tagline` ✓ `desc` ✓ `url` **空** `icon` ✓

- [ ] **A-04a** `url`：這個工具目前有可存取的連結嗎？（beta 版 / 展示連結？）
  - 需要你提供：URL 字串，或確認「目前無 URL，type 改為 showcase」

- [ ] **A-04b** `blog.summary`
- [ ] **A-04c** `blog.blocks`：text block
- [ ] **A-04d** `blog.blocks`：steps block（現有：上傳文件 → 輸入問題 → 直接看答案）
- [ ] **A-04e** `blog.blocks`：image block + caption

---

### A-12　批量電子簽章（t12）｜狀態：使用中 live

基本欄位：`tagline` ✓ `desc` ✓ `url` 空（用 files[]，有 Drive 連結）`icon` ✓

- [ ] **A-12a** `blog.summary`
- [ ] **A-12b** `blog.blocks`：text block
- [ ] **A-12c** `blog.blocks`：steps block（現有：開啟工具 → 選 PDF → 加簽後匯出）
- [ ] **A-12d** `blog.blocks`：image block + caption（工具使用截圖）

---

### A-13　空白頁清除工具（t13）｜狀態：使用中 live

基本欄位：`tagline` ✓ `desc` ✓ `url` ✓ `icon` ✓

- [ ] **A-13a** `blog.summary`
- [ ] **A-13b** `blog.blocks`：text block
- [ ] **A-13c** `blog.blocks`：steps block（現有：上傳檔案 → 自動偵測 → 下載結果）
- [ ] **A-13d** `blog.blocks`：image block + caption

---

### A-14　修改檔案日期工具（t14）｜狀態：使用中 live

基本欄位：`tagline` ✓ `desc` ✓ `url` 空（用 files[]，有 Drive 連結）`icon` ✓

- [ ] **A-14a** `blog.summary`
- [ ] **A-14b** `blog.blocks`：text block（適用情境說明）
- [ ] **A-14c** `blog.blocks`：steps block（現有：開啟工具 → 選目標檔案 → 設定日期存檔）
- [ ] **A-14d** `blog.blocks`：image block + caption
- [ ] **A-14e** `blog.blocks`：warning block（選填）— 建議提醒「修改時間僅供整理用途，請勿用於偽造文件」

---

### A-15　Teams Bot RAG（t15）｜狀態：使用中 live

基本欄位：`tagline` ✓ `desc` ✓ `url` **空** `blog.summary` ✓（已有）`icon` ✓

- [ ] **A-15a** `url`：Teams Bot 有示範頁/展示頁嗎？或填「showcase 型，無外部 URL」
- [ ] **A-15b** `blog.blocks`：text block（開發歷程摘要，可從已有的 summary 延伸）
- [ ] **A-15c** `blog.blocks`：steps block（現有：在 Teams 提問 → AI 搜尋文件 → 取得即時回答）
- [ ] **A-15d** `blog.blocks`：image block + caption（Teams 聊天截圖）
- [ ] **A-15e** `blog.blocks`：tip block（選填）— 例如「適用公司內部文件查詢，資料不對外」

---

### A-16　轉檔工具（t16）｜狀態：使用中 live

基本欄位：`tagline` ✓ `desc` ✓ `url` 空（用 files[]，有 Drive 連結）`icon` ✓

- [ ] **A-16a** `blog.summary`
- [ ] **A-16b** `blog.blocks`：text block
- [ ] **A-16c** `blog.blocks`：steps block（現有：選檔案 → 選目標格式 → 下載轉檔結果）
- [ ] **A-16d** `blog.blocks`：image block + caption

---

### A-11　遠地出差工具（t11）｜狀態：待驗收 pending

基本欄位：`tagline` ✓ `desc` ✓ `url` ✓ `icon` ✓

- [ ] **A-11a** `blog.summary`
- [ ] **A-11b** `blog.blocks`：text block
- [ ] **A-11c** `blog.blocks`：steps block（現有：填出差申請 → 主管審核 → 總務確認）
- [ ] **A-11d** `blog.blocks`：image block + caption

---

### A-08　機敏辦公室影印機浮水印（t8）｜狀態：開發中 dev

基本欄位：`tagline` ✓ `desc` ✓ `url` ✓（ai.studio）`icon` ✓

- [ ] **A-08a** `blog.summary`
- [ ] **A-08b** `blog.blocks`：text block（資安需求背景）
- [ ] **A-08c** `blog.blocks`：steps block（現有：正常使用影印機 → 文件自動加浮水印 → 浮水印含時間戳）
- [ ] **A-08d** `blog.blocks`：image block + caption（浮水印效果截圖）

---

### A-09　MasterCAM2025 外掛報表（t9）｜狀態：開發中 dev

基本欄位：`tagline` ✓ `desc` ✓ `url` **空** `blog.summary` ✓（已有）`icon` ✓

- [ ] **A-09a** `url`：有 demo 或說明連結嗎？或確認「無外部 URL」
- [ ] **A-09b** `blog.blocks`：text block（技術研究過程說明）
- [ ] **A-09c** `blog.blocks`：steps block（現有：在 MasterCAM 操作 → 觸發外掛 → 匯出客製報表）
- [ ] **A-09d** `blog.blocks`：image block + caption（外掛截圖）

---

### A-10　SimHope 行事曆（t10）｜狀態：開發中 dev

基本欄位：`tagline` ✓ `desc` ✓ `url` ✓ `icon` ✓

- [ ] **A-10a** `blog.summary`
- [ ] **A-10b** `blog.blocks`：text block（為何不用 TimeTree / Notion 的原因）
- [ ] **A-10c** `blog.blocks`：steps block（現有：登入行事曆 → 新增或查看行程 → 共享給同仁）
- [ ] **A-10d** `blog.blocks`：image block + caption

---

### A-07　物管籌料數位化作業系統（t7）｜狀態：已終止 terminated

基本欄位：`tagline` ✓ `desc` ✓ `url` ✓ `icon` ✓

- [ ] **A-07a** `blog.summary`（說明終止原因也可以）
- [ ] **A-07b** `blog.blocks`：text block（背景 + 終止原因）
- [ ] **A-07c** `blog.blocks`：image block + caption（若有截圖留存）

---

## B. README / 文件缺口

> 這裡的內容我大部分可以從 code 推斷草稿，你只需要確認或修字。

- [ ] **B-01** `README.md` 重寫
  - 我這邊會做：根據現有 code 草擬 overview / 功能列表 / Setup / 開發指令 / 部署
  - 需要你提供：(1) 要放截圖嗎？要的話給我圖檔；(2) 授權類型（MIT / 私有 / 不放）；(3) 是否要公開 repo（影響語氣）

- [ ] **B-02** `CHANGELOG.md`
  - 我這邊會做：從 `git log` 整理近 5 次有意義的 release 條目
  - 不需要你提供額外資訊，告訴我「去做」就好

- [ ] **B-03** `LICENSE`
  - 需要你決定：MIT / Apache-2.0 / 不開放（私有授權）

- [ ] **B-04** `docs/admin-guide.md`（管理員後台操作說明，可選）
  - 需要你決定：要做嗎？

- [ ] **B-05** `docs/developer-guide.md`（開發者上架工具流程，可選）
  - 需要你決定：要做嗎？

- [ ] **B-06** `landing-page/` 舊版 HTML 的角色說明
  - 需要你決定：在 README 備注「legacy 參考，不再維護」，還是直接刪？

- [ ] **B-07** `PRD_*.md`、`simhope_legacy_history.md` 文件整理
  - 需要你決定：保留在根目錄 / 移到 `docs/internal/` / 加入 `.gitignore`

---

## C. UI 文案 / 視覺資產缺口

### 視覺資產（需你提供圖檔）

- [ ] **C-01** 品牌 Logo（SVG 主檔 + PNG 透明背景，至少 512×512）
  - 我這邊會做：放到 `public/logo.svg` 和 `public/logo-512.png`，並接到 `Navbar.jsx`（取代 `🏭` emoji）、`layout.js`

- [ ] **C-02** Favicon（32×32 ico 或 svg）
  - 我這邊會做：替換 `app/favicon.ico`

- [ ] **C-03** Apple Touch Icon（180×180 png）
  - 我這邊會做：放到 `public/apple-touch-icon.png`，在 `layout.js` 加 `<link rel="apple-touch-icon">`

- [ ] **C-04** OG Image（1200×630 png，社群分享卡）
  - 我這邊會做：放到 `public/og-image.png`，在 `layout.js` 加 `openGraph.images`

- [ ] **C-05** Hero 區視覺（可選）
  - 需要你決定：維持純文字+emoji，還是要放產品截圖或品牌插圖？

### 文案確認 / 補寫

- [ ] **C-06** 首頁統計數字（`app/page.jsx:155-156`）
  - 現有：「30+ 同仁每週使用」「10h 估計每週省下」
  - 需要你提供：確認真實數字，或決定是否加註「(預估)」

- [ ] **C-07** TESTIMONIALS 四則同仁回饋（`app/page.jsx:9-42`）
  - 現有：四段 hardcoded 引述
  - 需要你提供：確認是真實引述（是否取得當事人同意），或替換成真實版本，或標示「示意」

- [ ] **C-08** PAIN_CHIPS 痛點（`app/page.jsx:44-50`）
  - 現有：「📄 文件找半天」「🌏 語言溝通卡關」「📊 報表要手動填」「🔍 SOP 翻了找不到」「⏰ 工時統計耗時」
  - 需要你提供：確認或修改

- [ ] **C-09** 聯絡信箱（`app/page.jsx:339`）
  - 現有：`it@simhope.com.tw`
  - 需要你提供：確認此信箱正確

- [ ] **C-10** 首頁聲明文字（`app/page.jsx:346`）
  - 現有：「* 需求會由 IT 部門評估…」
  - 需要你提供：最終完整措辭

- [ ] **C-11** 「首頁設定 (施工中)」按鈕（`app/admin/page.jsx:149`）
  - 需要你決定：預計做這個功能（保留按鈕）？還是先隱藏？

- [ ] **C-12** 統一空態 / 載入 / 錯誤訊息文案
  - 現有（散落多檔，措辭不一）：「載入中...」「目前沒有資料」「送出成功」「儲存失敗」「刪除失敗」等
  - 我這邊會做：草擬一份統一文案表，你確認後我一次改完
  - 需要你決定：要做嗎？（說「去做」我就先草擬給你看）

- [ ] **C-13** Footer（目前整個 `layout.js` 沒有 footer）
  - 需要你提供：(1) 版權文案（例：「© 2026 SimHope IT 部門」）；(2) 是否顯示版本號；(3) 是否顯示 IT 聯絡方式

- [ ] **C-14** 各頁動態 metadata / SEO（`app/tool/[id]/page.jsx` 無動態 head）
  - 我這邊會做：在 tool detail 頁加 `generateMetadata()`，標題用 `{title} — SimHope AI 工具箱`
  - 需要你確認：description 要用 `tagline` 還是 `desc`（前者較短）？og:image 要用工具截圖第一張嗎？

- [ ] **C-15** i18n 是否要做（影響架構）
  - 需要你決定：PRD 提到越南，現在加 i18n 框架（`next-intl`）嗎？若「現在不做」我就跳過

- [ ] **C-16** `alert()` 全面換成 toast（需引入 `sonner` 等 lib）
  - 需要你決定：要做嗎？（說「要」我就加 `sonner`，把所有 alert 換掉）

---

## D. 程式碼 JSDoc / 註解（這部分不需要你給內容，我可直接做）

> 說「D 全部去做」或逐項說「D-01 去做」即可。

- [ ] **D-01** `app/api/generate/route.js` — 請求/回應 schema、鑑權流程、env 依賴說明
- [ ] **D-02** `src/lib/db.js`（`getApprovedTools` / `getApprovedPainCards`）— 雙 schema 合併邏輯
- [ ] **D-03** `src/context/AuthContext.jsx` — `useAuth` 回傳形狀（`user / profile / isAdmin / isDeveloper / loading`）
- [ ] **D-04** `src/lib/adminAuth.js` — 規格化 `@param` / `@returns`
- [ ] **D-05** `src/components/ToolCard.jsx` — props 型別 + 匯出 `getStatusLabel` 說明
- [ ] **D-06** `src/components/AIPanel.jsx` — `onGenerate / isGenerating` props 合約
- [ ] **D-07** `src/lib/firebase.js` — SSR-safe 初始化說明
- [ ] **D-08** `src/components/Navbar.jsx` — Auth + Theme + LoginModal 整合說明
- [ ] **D-09** `src/components/ChatbotWidget.jsx` — API 端點與訊息協定
- [ ] **D-10** `src/components/LoginModal.jsx` — `onClose` 合約 + 錯誤處理路徑

---

## E. 額外清理項目（不需要你給內容，說「E 去做」即可）

- [ ] **E-01** 刪除 `public/` 裡 5 個 Next.js 樣板殘留 SVG（`file.svg` / `globe.svg` / `next.svg` / `vercel.svg` / `window.svg`）— 確認沒被引用後刪除
- [ ] **E-02** 修 `app/tool/[id]/page.jsx:194`：編輯器圖片預覽 `alt=""` 改成讀 `caption`（同第 74 行的寫法）
- [ ] **E-03** 確認 image block caption 非空才能儲存（`dashboard/page.jsx` block 驗證）— 要加這個限制嗎？

---

## 進度追蹤

| 領域 | 項目數 | 已完成 |
|------|--------|--------|
| A. 工具資料 | 52 | 0 |
| B. README/docs | 7 | 0 |
| C. UI 文案/資產 | 16 | 0 |
| D. JSDoc | 10 | 0 |
| E. 清理 | 3 | 0 |
| **合計** | **88** | **0** |
