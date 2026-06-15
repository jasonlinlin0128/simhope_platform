# 每週新增資源摘要（Vercel cron → Discord）

- 日期：2026-06-15
- 狀態：設計定案（待 writing-plans）
- 主題：每週一次自動把「本週新增的公開工具」摘要發到 Discord。Phase 1 通知尾巴。

## 背景與問題

飛輪「內容 → 發現」：新工具上架後，同仁不一定知道。每週摘要讓大家被動收到「本週有什麼新資源」，把新內容推回眼前。範圍選**每週摘要（cron）**——一個機制涵蓋「新工具公告」（批次），最簡、免費。

## 決策（brainstorm 定案）

| 維度         | 決定                                                  | 理由                                       |
| ------------ | ----------------------------------------------------- | ------------------------------------------ |
| 範圍         | **每週摘要（cron）**                                  | 一個機制涵蓋新工具公告（批次）；最簡、免費 |
| 通道         | **Discord（`notify.js`）**                            | 既有、免費（符合不串付費 API）             |
| 排程         | **Vercel cron，每週一 01:00 UTC（台北 09:00）**       | 免費；週初提醒                             |
| 「本週新增」 | **createdAt 在近 7 天內 + 公開狀態（live/beta/new）** | 純 cron 不 hook 發布 → 用 createdAt 當代理 |
| 空週         | **不發**（不洗版）                                    | 避免噪音                                   |
| 安全         | **CRON_SECRET**（Authorization: Bearer）              | 防外部亂打 route                           |

## 目標 / 非目標

**目標**

- 每週自動把近 7 天新增的公開工具摘要發到 Discord；空週不發。
- 零外部付費 API（Vercel cron + Discord 皆免費）；零 rules/資料/SA/index。

**非目標（之後）**

- 即時 on-publish 公告、email/LINE、個人化訂閱、痛點卡/其它內容類型的摘要。

## 架構與資料流

```
Vercel cron（schedule "0 1 * * 1" = 每週一 01:00 UTC）
  → GET /api/cron/weekly-digest
     ① 驗 CRON_SECRET：Authorization === `Bearer ${process.env.CRON_SECRET}`；不符 → 401（未設 secret 也 401，fail-safe）
     ② Admin SDK 讀公開工具：tools where status in [live,beta,new]
     ③ selectRecentTools：篩 createdAt 在近 7 天內（缺 createdAt 跳過）
     ④ buildDigestMessage：有 → 「📢 本週新增資源（N）：…」字串；空 → null
     ⑤ message 非 null → notify(message)（既有 Discord webhook）
     → 回 { ok:true, count }
```

## 元件（邊界清楚、可獨立測）

1. **`src/lib/weeklyDigest.mjs`（新，純函式，無 firebase/browser 依賴）**
   - `selectRecentTools(tools, nowMs, windowDays = 7)`：回 `tools` 中「status ∈ {live,beta,new} 且 `createdAtMs` 為數字且 ≥ nowMs − window」者。
   - `buildDigestMessage(tools)`：tools 空 → `null`；否則回字串（含筆數、每筆 `• 名稱 — tagline`、結尾 hub 連結）。
   - → TDD。
2. **`app/api/cron/weekly-digest/route.js`（新，GET）** — 驗 CRON_SECRET → `getAdmin()` 讀公開工具（map 出 `{id,title,tagline,status,createdAtMs}`，`createdAtMs = data.createdAt?.toMillis?.() ?? null`）→ `selectRecentTools(tools, Date.now())` → `buildDigestMessage` → 非 null 才 `notify`。錯誤 try/catch 吞掉（cron 不該噴 500、不擋）。
3. **`vercel.json`（改）** — 加 `"crons": [{ "path": "/api/cron/weekly-digest", "schedule": "0 1 * * 1" }]`。

## 誠實 / 邊界

- 只列真實、近 7 天、公開的工具；**空週不發**。
- createdAt 當「新增」代理（caveat：很久前提交、這週才發布的不列入；純 cron 取捨）。
- 缺 createdAt 的舊工具跳過（不誤列）。

## 💰 成本 / 基礎設施

- **Vercel cron 免費、Discord 免費**、零新付費 API、零 npm 依賴。
- **Jason 一次性 todo（非付費）**：在 Vercel 設 `CRON_SECRET` env（route 未讀到 secret 一律 401，fail-safe，不會誤發）。`DISCORD_WEBHOOK_URL` 已設。
- 無 rules / 資料 / index / SA / migration。
- → **merge 即部署**（cron 由 Vercel 依 vercel.json 註冊）。

## 測試（TDD）

- `weeklyDigest.test.mjs`：
  - `selectRecentTools`：保留近 7 天 + 公開；排除超過 7 天的；排除非公開狀態；排除缺/非數字 createdAtMs；空/null 安全。
  - `buildDigestMessage`：多筆 → 含筆數與每筆名稱；空陣列/null → `null`。
- route：`node --check` + build（`/api/cron/weekly-digest` 在 route 清單）+ 部署後人工驗（帶 `CRON_SECRET` 手動 GET）。

## Rollout

1. merge → Vercel 部署 + 依 vercel.json 註冊 cron。
2. **Jason：在 Vercel 設 `CRON_SECRET`**（否則 route 一律 401、cron 不會發）。
3. 部署後人工驗：帶 `Authorization: Bearer <CRON_SECRET>` GET `/api/cron/weekly-digest` → 有近 7 天新工具則 Discord 收到摘要 / 無則不發、回 `{ok:true,count:0}`；不帶 secret → 401。

## 風險 / 緩解

- **CRON_SECRET 未設 → 不會發**（fail-safe，非當機）。
- **notify 失敗** → notify.js 既有吞錯、回 false，不擋。
- **時區** → Vercel cron 用 UTC；"0 1 \* \* 1" = 台北週一 09:00。
