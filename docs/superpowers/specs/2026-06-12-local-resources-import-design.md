# 本地 skill / MCP 大量上架 — 設計

> 日期：2026-06-12 ｜ branch：`feature-import-local-resources`
> 把 Jason 本地的 Agent skill（`~/.claude/skills/`）與 MCP server 篩選後大量上架到 simhope-platform 內部資源中心。

## 1. 問題 / 目標

Jason 累積了 22 個本地 skill + ~17 個 MCP，但同仁看不到、不知道怎麼裝。目標：用一支 **idempotent import 腳本**把「可共用」的那些做成 hub 的 `tools` 卡片（type=skill / type=mcp），讓同仁瀏覽、知道安裝方式；自己寫的可共用 skill 還能直接下載 zip 自助裝。

## 2. 已確認決策（Jason）

1. **範圍**：可共用子集——我把 22 skill + MCP 分成 🟢可共用(自己) / 🔵第三方 / ⚪個人專屬，**最終以 dry-run 清單為準、Jason 過目**。
2. **上架程度（混合）**：🟢 自己可共用 → 打包 zip 上 Firebase Storage（`typeData.skillZipUrl`，CTA「⬇️ 下載 SKILL」）；🔵 第三方 → 只卡片 + 指向原始 repo（不重散佈）；MCP → 卡片 + config（本來就無檔）。
3. **可見性 / 文案**：批次建成 **status=pending 草稿** + 用 Gemini 把 AI 觸發口吻的 `description` 改寫成人話 tagline/desc 預填 → Jason 在 admin 過目發布。

## 3. 設計

### 3.1 import 腳本（沿用 `seed-faqs.mjs` 範式）

`scripts/import-local-resources.mjs`：dry-run 預設、`--apply` 才寫；Admin SDK（`firebaseAdmin` / `FIREBASE_SERVICE_ACCOUNT`）；固定 doc id **`import-skill-<slug>` / `import-mcp-<slug>`**（idempotent，重跑只更新草稿、不重複）。`--update` 同步草稿（同 seed-faqs）。

流程：① 掃 `~/.claude/skills/` 讀每個 `SKILL.md` frontmatter（`name`/`description`）② 套分類規則 ③ 🟢 打包+上傳、🔵 取 repoUrl、MCP 取 manifest config ④ Gemini 改寫文案 ⑤ 組 `tools` 文件 batch 寫入。

### 3.2 分類規則（腳本內 + 人工確認）

- **🟢 可共用（自己寫的、通用）**：來源是 Jason 自寫、且**不綁個人資料/帳號/特定機器**（例：`security-audit`、`批次excel轉word`）。
- **🔵 第三方**：來源是裝來的（SKILL.md 提到原作者/repo，或在已知第三方清單）。→ 只連結。
- **⚪ 個人專屬（不上架）**：綁 Jason 的 workspace / Gmail / GB10 / projects-registry 等（例：`ai`、`ai-inbox`、`coord-add`、`daily-*`、`gb10-model-mgmt`、`inbox-review`、`update-project`）。
- 腳本對每個 skill 印出判定 + 理由；**dry-run 時 Jason 過目可推翻**（用 `OVERRIDE` 對照表或直接改腳本的分類 map）。

### 3.3 🟢 skill 打包 + Storage 上傳（含**敏感檔掃描**）

打包前**必做 scrub**（避免把 Jason 的密鑰/個資/絕對路徑公開）：

- 排除：`.env`、`.env.*`（保留 `.env.example`）、`.git/`、`node_modules/`、`__pycache__/`、`*.log`、> 5MB 二進位。
- **內容掃描**剩餘檔：命中 secret 樣式（`sk-`、`AIza`、`ghp_`、`xox[bap]-`、`-----BEGIN`、`FIREBASE_SERVICE_ACCOUNT` 等）的**非 `.example` 檔 → 排除該檔並警告**；若 `SKILL.md` 本體含密鑰 → **跳過整個 skill 並標記給 Jason**。
- dry-run **印出每個 🟢 skill 的檔案清單（含/排除）**給 Jason 過目，`--apply` 才真打包。
- 打包：`zip` skill 資料夾（scrub 後）→ 暫存 → `getStorage().bucket("simhope-platform.firebasestorage.app").upload(zip, { destination: "skills/<slug>.zip" })` → **公開讀 URL**（與既有 download 類工具 `fileUrl` 一致；🟢 skill 皆已 scrub、本就要內部共用；平台本身公開可瀏覽）→ `typeData.skillZipUrl`。
  > ⚠️ **一個待 Jason 拍板的決策**：公開讀＝任何拿到連結者可下載 scrub 過的 zip。若要更嚴（只限登入同仁下載），是後續另案（download route + verifyIdToken）。預設走公開讀（最簡、合既有範式）。

### 3.4 MCP manifest（人工 curated）

MCP 不是資料夾、無法掃成「可共用」。腳本內含一份 **manifest（`SHAREABLE_MCPS` 陣列）**，只列通用、非帳號綁定者；帳號綁定的（Gmail/Calendar/Drive/個人 Notion/exa/vercel）**不列**。每筆：`{ slug, name, description, type:"npx|http|local", config, repoUrl?, npmPackage? }`。dry-run 印出清單給 Jason 確認/增減。

> 草稿可共用 MCP：`context7`(npx @upstash/context7-mcp)、`chart`(npx @antv/mcp-server-chart)、`playwright`(@playwright/mcp)、`excel`(uvx excel-mcp-server)、`postgres`(template，需自有 DB)。`github` 視需要（需自己的 auth）。

### 3.5 Gemini 文案改寫

用既有 `src/lib/gemini.mjs` helper：input = skill/mcp 的 name + 原始 description（AI 觸發口吻）→ prompt「改寫成給公司同仁看的工具卡：一句 tagline（≤30 字）+ 2–3 句 desc（人話、講能幫他做什麼，不要『Use when the user...』口吻）」→ 填 `tagline` / `desc`。失敗 → 退回用原 description（不擋整批）。約 12–16 筆，序列呼叫 + 簡單節流。

### 3.6 產出的 `tools` 文件結構

共通：`{ type, category, status:"pending", title, tagline, desc, tags, authorUid:<Jason admin uid>, createdAt: serverTimestamp(), source:"import-script" }`。

- **🟢 skill**：`type:"skill"`, `category:"skill"`, `typeData:{ skillZipUrl:<Storage URL>, installPath:"~/.claude/skills/<slug>/", sourceRepo?:... }`。
- **🔵 skill**：`type:"skill"`, `category:"skill"`, `typeData:{ repoUrl:<原始 repo>, installPath:"~/.claude/skills/<slug>/" }`（無 skillZipUrl → CTA 自動降「看詳情」，詳情頁說明從 repo 裝）。
- **MCP**：`type:"mcp"`, `category:"mcp"`, `url:<repoUrl 或安裝連結>`(CTA href), `typeData:{ configSnippet:<claude mcp add ... 或 json>, npmPackage?, repoUrl?, mcpbUrl? }`。

`desc` 用 Pattern C（人話、可含安裝步驟 markdown）；詳情頁「快速安裝」tab 吃 typeData。

### 3.7 可見性

全部 `status:"pending"` → 非 admin 看不到（rules 既有）→ Jason 在 /admin 逐個（或批次）審核發布。authorUid = Jason，wizard 顯示作者正常。

## 4. 草稿分類（實作時逐個讀 SKILL.md 定案、dry-run 給 Jason 過）

- 🟢 自己可共用：`security-audit`、`批次excel轉word`、`progress-report`、`ai-collaboration-standards`（+ 視內容 `presentation-*`）
- 🔵 第三方：`logo-generator`、`agent-browser`、`agent-builder`、`mcp-builder`
- ⚪ 個人專屬（不上）：`ai`、`ai-inbox`、`coord-add`、`daily-morning-briefing`、`daily-stock-email-digest`、`gb10-model-mgmt`、`inbox-review`、`update-project`、`progress-report-workspace`
- ❓ 待 Jason 定：`dot-skill`、`vibe-to-agentic-framework`

## 5. 影響檔案

| 檔案                                                    | 動作                                                                                       |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `scripts/import-local-resources.mjs`                    | **新**：掃描+分類+scrub+打包上傳+Gemini+batch 寫 pending tools（dry-run/--apply/--update） |
| `scripts/lib/skillScrub.mjs`(+test)                     | **新**：敏感檔/secret 樣式判定（純函式、TDD——這是唯一可乾淨單測的核心邏輯）                |
| `docs/...-import-manifest.md` 或腳本內 `SHAREABLE_MCPS` | **新**：curated MCP 清單                                                                   |

> 不改 app 程式（skill/mcp type 已存在）。腳本只寫資料（Firestore pending + Storage）。

## 6. 測試 / 驗證

- **TDD**：`skillScrub.mjs`（判定哪些檔案排除、secret 樣式命中）→ `.test.mjs`（test:unit）。
- **dry-run**：印出「每個 skill 分類 + 打包檔案清單 + 會建的卡片標題 + Gemini 文案」→ Jason 過目。
- **--apply 後**：Firestore 查 `where source==import-script` 確認 pending docs；Storage 確認 zip 在；Gemini 文案合理。
- **Jason 發布幾個** → live /hub 看 skill/mcp 卡 + CTA（下載 zip / 安裝 config）正確。

## 7. Rollout

腳本 PR 合併（記錄用）→ 我本地跑 `--apply`（有 skills 檔 + SA + Storage + GEMINI_API_KEY）→ 建 pending → Jason admin 發布。pending 對同仁隱形，無破壞性。idempotent 可重跑。

## 8. 非目標（YAGNI）

- ❌ admin「上傳 skill」UI（一次性 bulk 用不到；未來單個走現成 wizard）。
- ❌ 個人專屬 skill / 帳號綁定 MCP 上架。
- ❌ 自動同步（本地 skill 更新→自動更新卡片）；要更新重跑腳本 `--update` 即可。
- ❌ 改 skill/mcp 的詳情頁渲染（沿用既有）。
