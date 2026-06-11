# C-1 OG metadata + 品牌 logo — 設計

> 日期：2026-06-11 ｜ branch：`feature-og-metadata`
> 來源：平台體檢 Top-5 #3「公開頁 RSC + OG」的 C-1 切片（OG 先做，RSC=C-2 之後）。

## 1. 問題

- 連結被貼到 Slack / Discord / LINE / FB 時**沒有預覽圖**（無 OG metadata）→ 看起來不專業、沒品牌。
- **無 favicon**（體檢 finding）→ 瀏覽器分頁是空白圖示。
- 順帶：navbar 的 logo 是 🏭 emoji，不夠精緻。

## 2. 目標 / 非目標

**目標**：① 全站有品牌 OG 分享圖 ② 有 favicon ③ navbar 換成新 hub mark（OG/favicon/navbar 品牌一致）。

**非目標（YAGNI / 之後）**：❌ C-2 公開頁 RSC 轉換（另案）❌ 不改頁面背景 / 排版 / 效果 / 任何可見 UI（除了 navbar 那顆 logo 圖示）❌ 不個別客製每個工具頁的 OG 圖（工具頁共用全站圖，只各自帶 og:title）。

## 3. 已確認的設計（Jason 逐步預覽核可）

- **Logo**：V1 Hub 節點網（中心節點 + 4 衛星 + **弧線**連線，已放大），配色 **C3 紫→靛藍漸層 `#a78bfa → #6366f1`**。
- **OG 卡**（1200×630）：深紫靛漸層底 + C3 mark 在質感方塊 + 「SimHope AI Hub」+ 副標「工具 · 平臺 · 專案 · MCP · Skill，打開就能用」+ 5 chips。**無 emoji**（Satori 預設不渲染 emoji，避免破圖 → 預覽＝實際輸出）。
- **字型**：動態抓 **Noto Sans TC 子集**（只含 OG 用到的中文字，text-scoped fetch from Google Fonts）給 Satori 渲染中文。build 時抓一次（圖是靜態的）。
- **navbar**：**保留現有漸層 tile**，只把 🏭 → **白色** hub mark（Jason 明示「只換圖示，背景/排版/效果不動」）。
- **favicon**（`app/icon.svg`）：漸層 tile + 白 mark（app-icon 風，與 navbar 一致、分頁好認）。

> 註：OG 卡是深色 ≠ 網站變深色。網站維持暖色亮背景；OG 只是分享卡片自己的設計。hub 形狀三處一致，配色依情境（OG=漸層 mark on dark；navbar/favicon=白 mark on 漸層 tile）。

## 4. 影響檔案

| 檔案                         | 動作                                                                                                          |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `src/components/HubMark.jsx` | **新**：品牌 mark 元件（gradient 預設；給 `color` 則單色、無 defs 不撞 id）。navbar 用                        |
| `app/opengraph-image.js`     | **新**：`next/og` ImageResponse 畫 OG 卡 + 動態抓 Noto Sans TC 子集                                           |
| `app/icon.svg`               | **新**：favicon（漸層 tile + 白 mark）                                                                        |
| `app/layout.js`              | **改**：加 `metadataBase` + `openGraph`（siteName/locale/type）+ `twitter`（summary_large_image）             |
| `app/tool/[id]/layout.jsx`   | **改**：returned metadata 加 `openGraph`/`twitter`（工具頁分享顯示工具標題，圖共用全站 root opengraph-image） |
| `src/components/Navbar.jsx`  | **改**：tile 內 🏭 → `<HubMark color="#fff" />`（其餘不動）                                                   |

## 5. 測試 / 驗證

- **無乾淨純邏輯可單測**（SVG markup + ImageResponse/Satori 渲染 + metadata 物件回傳，無可抽純函式）。誠實標明，靠下列把關：
- **build**：`npm run build` 過（OG route 編得過、font fetch 不爆）。
- **lint**：基準不變。
- **我代驗（dev server 起站 + playwright）**：
  1. navbar 新 hub mark 顯示正常（亮/暗模式）。
  2. 打 `/opengraph-image` 截圖 → 比對 `.tmp-og-preview`（確認 Satori 輸出＝預覽、中文有渲染）。
  3. favicon 載入（`/icon.svg`）。
  4. view-source 檢查 `og:image` / `og:title` / `twitter:card` meta 存在。
- 部署後（Jason merge → Vercel）可用 Slack/實貼或 opengraph 檢測器驗 unfurl。

## 6. Rollout

純前端 + metadata，**無 rules / 無資料遷移 / 無 SA 動作**。merge → Vercel 自動部署即生效。reviewer READY 後開 PR 等 Jason merge。
