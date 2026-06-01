# SimHope Hub（公司版資源中心）— 設計 spec

> **建立日期**：2026-06-01
> **狀態**：📝 **設計中（待 implement）**
> **範圍**：把現有單頁平台擴展成 twinkle-hub 風格的多頁式資源中心，整合進現有 Next.js / Firebase app。本 spec 詳列 **Phase 1（MVP）** 與整體架構；Phase 2（支援頁）、Phase 3（Playground）另開 spec。
> **參考站**：https://hub.twinkleai.tw/（只參考內容架構與排版；配色/視覺沿用現有平台，不照抄）

---

## 0. 背景與動機

### 觸發點

平台從 v0.7 的「應用工具收錄站」要再擴展成「內部 AI 資源中心」。Jason 希望參考 twinkle hub 的資訊架構：多頁式、共用 chrome（navbar / banner / footer）、以 card grid 為主，並讓開發者/自己能上傳 **5 種類別**的內容。

### 核心需求（來自 brainstorming）

1. **落地方式**：併入現有平台（不是另開 repo），但要顧「可讀性 + 架構清晰度」。
2. **5 大類別**（可上傳）：平臺 / 工具 / 專案 / MCP / Skill。
3. **頁面**：參考 twinkle 全部頁面，但依公司內部情境重新定位（見 §3 分階段）。
4. **素材**：用現有 17 工具 / skills 填入。

### 5 大類別定義（Jason 確認）

| 類別              | 定義                                                      | 維度     | 例子                              |
| ----------------- | --------------------------------------------------------- | -------- | --------------------------------- |
| **平臺** platform | 大型、多功能、長期維運的系統/應用                         | 最大     | 這個 hub 本身、公司專案管理平臺   |
| **工具** tool     | 單點 AI 小工具，即開即用                                  | 小、量多 | 翻譯、PDF 清理、電子簽核          |
| **專案** project  | 單一、時限性的案子，展示進度/成果                         | 中       | 某個政府補助案                    |
| **MCP** mcp       | 給 AI agent 串接的 MCP server                             | —        | 現有 mcp 類型工具                 |
| **Skill** skill   | Agent/Claude skill，可下載 zip 安裝到 `~/.claude/skills/` | —        | （新類別，仿 twinkle .skill zip） |

---

## 1. 整體架構（Option C：Hub 首頁 + 統一目錄 tab）

### 1.1 共用 chrome（抽成共用元件，每頁一致）

twinkle 每頁都是 `Navbar → (Banner) → 頁面內容 → Footer`。我們抽成可重用元件：

- **`Navbar`**（擴充現有 `src/components/Navbar.jsx`）
  連結改為：Logo｜**資源中心** `/hub`｜文件 `/docs`(Phase 2)｜FAQ `/faq`(Phase 2)｜更新日誌 `/changelog`(Phase 2)｜深色切換｜登入區（沿用現有 Auth/LoginModal）。
  Phase 1 先放會用到的連結（資源中心），未上線的頁面連結 Phase 2 才加。
- **`Banner`**（新增 `src/components/Banner.jsx`）
  full-width 細條，`variant`：`maintenance`（維護公告）/ `changelog`（最新更新提示 + 連結）。內容可由 `DEFAULT_SITE` 或 Firestore 設定；Phase 1 可先吃常數，**可關閉/隱藏**（內部站非必要）。
- **`Footer`**（新增 `src/components/Footer.jsx`）
  品牌區（Logo + 一句 tagline）+ 三欄連結（產品 / 開發者 / 說明）+ 版權。連結指向站內既有頁面；外部社群連結可省。

> chrome 放進 `app/layout.js`（或一個 layout wrapper），讓所有頁面共用。現有 `app/layout.js` 已掛 Navbar；新增 Footer 一併掛上。

### 1.2 頁面 / 路由

| 路由                            | 內容                                                                         | 現況                    | Phase |
| ------------------------------- | ---------------------------------------------------------------------------- | ----------------------- | ----- |
| `/` Hub 首頁                    | hero + **5 類別 entry 卡** + 近期更新 + metrics band + 保留痛點卡區          | 重構 `app/page.jsx`     | 1     |
| `/hub` 資源中心                 | **統一目錄**：類別 tab（平臺/工具/專案/MCP/Skill）+ Fuse.js 搜尋 + card grid | 新增 `app/hub/page.jsx` | 1     |
| `/tool/[id]` 詳情頁             | 依 `category` 動態 tab（沿用現有 block editor / 安裝說明）                   | 擴充現有                | 1     |
| `/dashboard`                    | 上傳表單加 `category` + Skill zip 上傳                                       | 擴充現有                | 1     |
| `/admin`                        | 審核 wizard 加 `category`                                                    | 擴充現有                | 1     |
| `/login`                        | 沿用現有（Google + passkey）                                                 | 不動                    | —     |
| `/docs`                         | 3-path 安裝引導（GUI / CLI / API）                                           | 新增                    | 2     |
| `/faq`                          | accordion                                                                    | 新增                    | 2     |
| `/changelog`                    | version timeline                                                             | 新增                    | 2     |
| `/access`（repurposed pricing） | 取用說明 / 權限分級（viewer/developer/admin）                                | 新增                    | 2     |
| `/playground`                   | 完整互動 demo                                                                | 新增                    | 3     |

> 詳情頁**保留 `/tool/[id]` 路徑**（避免改 URL／既有連結失效），對外仍稱「詳情頁」。

---

## 2. 資料模型（單一 collection + category 雙軸）

### 2.1 決策

沿用現有 `tools` collection（語意視為「catalog」），**新增上層 `category` 欄位**。不開 5 個獨立 collection — 一個查詢就能跨類別搜尋、一套審核流程、最低改動。

### 2.2 雙分類軸（避免混淆，這是清晰度關鍵）

- **`category`** = 目錄組織（決定在哪個 tab）→ **使用者看的**
  enum：`platform` / `tool` / `project` / `mcp` / `skill`
- **`type`**（現有 `webapp`/`download`/`doc`/`mcp`/`api`/`embedded`）= 交付格式（決定 CTA 與安裝說明 tab）→ **技術用**

兩軸關係（同一筆資料兩個欄位並存）：

| category | 常見的 type                        | CTA / 詳情頁行為                                           |
| -------- | ---------------------------------- | ---------------------------------------------------------- |
| platform | webapp                             | 「🌐 馬上打開」+ 模組說明                                  |
| tool     | webapp / download / embedded / doc | 沿用現有 `getCTA`                                          |
| project  | webapp / doc（或無 url）           | 「看進度/成果」                                            |
| mcp      | mcp                                | 「📦 安裝到 Claude / Cursor」+ 設定 snippet                |
| skill    | （新交付）skill                    | 「⬇️ 下載 SKILL（.zip）」+ 安裝到 `~/.claude/skills/` 說明 |

> 注意：對 mcp / skill，category 與 type 對齊；對 platform / tool / project，type 是其下的交付格式變體。

### 2.3 欄位（typeData 子物件擴充）

沿用現有慣例（類型專屬欄位放 `typeData`）：

```jsonc
{
  "id": "...",
  "title": "...",
  "tagline": "...",
  "icon": "📦", "color": "c1",
  "category": "skill",          // 新增：platform | tool | project | mcp | skill
  "type": "skill",              // 交付格式（skill 為新值）
  "status": "live",             // 不變
  "scenarios": [...],           // 不變
  "desc": "...",                // Pattern C 文案（不變）
  "blog": [...],                // block editor（不變）
  "typeData": {
    // skill 專屬
    "skillZipUrl": "<Firebase Storage download URL>",
    "version": "v1.0.0",
    "installPath": "~/.claude/skills/",
    // platform 專屬
    "url": "...", "modules": ["...", "..."],
    // project 專屬
    "timeframe": "2026 Q2", "progress": "進行中", "outcome": "Before/After…"
  }
}
```

- `type` 的 enum 新增 `skill`；`TYPE_BADGES` / `getCTA`（`ToolCard.jsx`）對應補上 skill 分支。
- Skill zip 上傳沿用現有 `src/lib/storage.js` + `UploadButton.jsx`（v0.6 已建）。

### 2.4 可見性 / firestore.rules

- 沿用現有：非 admin 看 `status in [live,beta,new,dev,terminated]`；pending 只有作者/admin。
- `category` 不影響可見性規則（只是分類欄位）→ rules 幾乎不用改。
- Skill zip 存 Firebase Storage：沿用現有 storage.rules（已發布）；若要限制讀取再議。

### 2.5 migration

- 新 script `scripts/migrate-category.mjs`：為現有 17 筆 tools 補 `category`。
  - 預設 dry-run，`--apply` 才寫入；寫入前備份到 `tools-backup-2026-06-01/`；idempotent。
  - 映射規則：`type==='mcp'` → `category:'mcp'`；其餘預設 `category:'tool'`；少數手動指定為 platform/project（清單在 script 內，Jason 過目）。
- ⚠️ **遵守 AGENTS.md 鐵律**：依賴 `category` 的新程式碼（`getCatalog` 等）**先 merge + deploy 成功**，才跑 `--apply`；跑完**連 live 站驗證**（首頁工具數不可掉）。

---

## 3. 分階段計畫

### Phase 1 — MVP（本 spec 詳列）

1. 共用 chrome：`Navbar`(擴充) / `Footer`(新) / `Banner`(新) → 掛進 layout。
2. **Hub 首頁重構** `app/page.jsx`：hero + 5 類別 entry 卡（顯示各類別數量 + →`/hub?cat=`）+ 近期更新 + metrics band；**保留現有痛點卡區**移到下方。
3. **`/hub` 統一目錄** `app/hub/page.jsx`：`CategoryTabs`（5 類別 + 全部）+ Fuse.js 搜尋（沿用現有）+ `CatalogGrid`。tab 可由 `?cat=` 進入。
4. **詳情頁擴充** `app/tool/[id]/page.jsx`：依 `category` 顯示對應 tab/CTA（skill → 下載 zip + 安裝說明）。
5. **上傳/審核擴充**：`dashboard` 表單 + `ReviewToolWizard` 加 `category` 選擇；skill 類別顯示 zip `UploadButton`。
6. **`db.js`**：新增 `getCatalog({category})`；`CATEGORIES` 常數集中定義（label/emoji/desc）。
7. **migration**：`migrate-category.mjs`（依 §2.5 順序）。

### Phase 2 — 支援頁（另開 spec）

Docs（3-path 安裝引導）+ FAQ（accordion）+ 更新日誌（timeline 頁，資料模型仿 twinkle changelog 卡）+ `/access` 取用說明/權限頁。

### Phase 3 — Playground（另開 spec）

完整互動 demo（仿 twinkle 6 demo 卡 + 各自可操作頁）。工程量大、需個別設計。

---

## 4. 組件清單（Phase 1）

| 類型     | 組件                             | 新增/擴充       | 說明                                         |
| -------- | -------------------------------- | --------------- | -------------------------------------------- |
| chrome   | `Footer`                         | 新增            | 品牌 + 三欄 + 版權                           |
| chrome   | `Banner`                         | 新增            | variant: maintenance / changelog；可隱藏     |
| chrome   | `Navbar`                         | 擴充            | 加「資源中心」連結                           |
| 卡片     | `CategoryEntryCard`              | 新增            | 首頁 5 類別入口（icon+標題+數量+→）          |
| 卡片     | `CatalogCard`                    | 擴充 `ToolCard` | 支援 5 類別 badge/CTA（含 skill 下載）       |
| 目錄     | `CategoryTabs`                   | 新增            | tab 切換（全部 + 5 類別）                    |
| 目錄     | `CatalogGrid`                    | 新增/沿用       | grid + Fuse.js 搜尋（沿用首頁邏輯）          |
| 詳情     | `app/tool/[id]/page.jsx`         | 擴充            | 依 category 動態 tab/CTA                     |
| 上傳     | `dashboard` / `ReviewToolWizard` | 擴充            | category 選擇 + skill zip 上傳               |
| metrics  | `MetricsBand`                    | 新增            | 首頁數字帶（工具數/類別數…）                 |
| 資料     | `src/lib/db.js`                  | 擴充            | `getCatalog({category})` + `CATEGORIES` 常數 |
| 卡片邏輯 | `ToolCard.jsx`                   | 擴充            | `TYPE_BADGES.skill` + `getCTA` skill 分支    |
| script   | `scripts/migrate-category.mjs`   | 新增            | 補 category（備份 + idempotent）             |

---

## 5. 資料流

```
首頁 /          ── getCatalog()（全部）→ 各 category 計數 → CategoryEntryCard
                                        → MetricsBand（總數）
                                        → 痛點卡（getApprovedPainCards，不變）
資源中心 /hub   ── getCatalog({category}) → CategoryTabs 切換 → Fuse.js 搜尋 → CatalogGrid
詳情頁 /tool/id ── getTool(id) → 依 category 渲染 tab/CTA（skill: skillZipUrl 下載）
上傳 /dashboard ── 表單(category, typeData, skill zip→Storage) → 寫 tools(status:pending)
審核 /admin     ── ReviewToolWizard（category 可調）→ 改 status
```

---

## 6. 風險 / 注意事項

1. **migration 順序**（最高優先）：新碼先上、deploy 成功、再跑 `--apply`、連 live 站驗證。違反會重演 2026-05-29 P0 regression（首頁工具數掉）。
2. **type vs category 混淆**：文件與 UI 要清楚標示兩軸用途；admin 表單把 category（分類）放主選、type（交付格式）放次選。
3. **痛點卡保留**：重構首頁時別把現有痛點卡功能弄丟（getApprovedPainCards + PainCard 元件不動，只是位置下移）。
4. **Next.js 版本**：實作前讀 `node_modules/next/dist/docs/`（AGENTS.md 提醒：此版 Next.js 有 breaking changes）。
5. **YAGNI**：Banner 內部站非必要，先做成可隱藏；Pricing 不照抄，改成 `/access`（Phase 2）。

---

## 7. 驗收標準（Phase 1）

- [ ] 首頁顯示 5 類別 entry 卡 + 各類別正確計數 + metrics band；痛點卡仍在。
- [ ] `/hub` 可用 tab 切換 5 類別 + 搜尋，卡片正確過濾。
- [ ] 詳情頁對 skill 類別顯示「下載 zip + 安裝到 `~/.claude/skills/`」。
- [ ] dashboard 可上傳一筆 skill（含 zip）→ admin 審核 → 出現在 `/hub` 的 Skill tab。
- [ ] migration 跑完，現有 17 工具都有 category，**live 站工具數不變**。
- [ ] Footer 出現在所有頁；Navbar 有「資源中心」連結。
- [ ] `npm run build` 通過。
