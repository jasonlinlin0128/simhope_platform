# 🩺 健檢看板（Health-check Dashboard）設計

> 日期：2026-06-21 ・ 狀態：設計定稿，待寫 plan
> 飛輪定位：訊號層的「守門」—— 不是發現/排名，而是揪出「已發布內容在不在爛」。

## 背景與問題

飛輪前段（content → discovery → signal → feedback）已做滿：首頁熱門、/hub 排序、find-tool、使用分析、👍 評分、使用概況三訊號表、需求看板、即時公告、每週摘要。**但沒有任何訊號守「已發布的內容是否在腐爛」。**

對內部站，最致命的失敗模式不是「沒人來」，而是「熱門工具默默壞掉、沒人維護，靜默侵蝕信任」。`AGENTS.md` 開頭那場事故（首頁工具從 13 掉到 8、破了一段時間才發現）本質就是「資料 × 程式碼不一致沒被即時發現」。

現有的 `📊 使用概況`（`UsageDashboard.jsx`）只 join **使用**訊號（views/opens/helpful），完全不看 **freshness**（`updatedAt` / `versions[]`），也沒有「殭屍 / 孤兒 / 卡關」的治理概念。健檢看板補上這個缺口。

## 目標

- 給 admin 一頁，把既有 freshness × usage 訊號 **join 起來**，一眼看出四種需要動手的問題工具。
- 純讀、零寫入、零 firestore.rules 變更、零付費、零新讀取 pattern —— 是「對已載入資料換個角度切」。
- 偵測邏輯為純函式、可完整 TDD，輸出設計成日後行動層（標記已驗證 / cron 告警）能直接吃。

## 非目標（YAGNI）

- 不寫入：不做「標記已驗證 / lastVerifiedAt」、不清孤兒 analytics key（→ 留給後續 owner 課責迴路）。
- 不做 cron 自動告警（→ 留給後續，沿用 notify.js / weekly-digest 模式）。
- 門檻不做 UI 可調，先用程式碼常數。
- 不做 dev-stall（規劃中工具停擺）flag。

## 行動層級決策：純雷達（唯讀）

v1 只做「列出問題 + 連到該工具詳情/編輯頁」，實際處理由 admin 手動去做。理由：

1. 真正的難點與價值在「偵測邏輯」（freshness×usage 的 join 與門檻），那是純函式、可 TDD；把這層做到可信才是重點。
2. 在偵測還沒被驗證可信前就加行動，等於對雜訊動手（如 import 工具只有 `createdAt` 易誤標陳舊）。先讓雷達跑幾週、確認 flag 是訊號不是噪音，再加行動。
3. 標記已驗證（B）、cron 告警（C）是兩個獨立想法；現在併入會把三件事綁死。把 `healthFlags.mjs` 輸出設計成 B/C 能直接消費，門開著、成本留到需要時付。

## 架構

完全比照 `UsageDashboard` 的 client 模式：

- **`app/admin/page.jsx`**：加第 7 個 tab `health`（標籤 `🩺 健檢`），mirror `usage` / `demand` 的 nav button ＋ `{activeTab === "health" && (<div className="…card…"><HealthDashboard /></div>)}`。
- **`src/components/HealthDashboard.jsx`**（新，client 島）：讀 analytics + tools，呼叫純函式，渲染四個分區。
- **`src/lib/healthFlags.mjs`**（新，純函式）：偵測邏輯本體，無 firebase / 無 browser 依賴。
- **`src/lib/healthFlags.test.mjs`**（新）：node:test。

否決的替代方案：

- **server RSC 算 flag**：與既有 client admin 模式不一致，admin-only 無收益。
- **塞進「使用概況」分頁**：把「排名」與「待修問題」兩種不同工作混在一起，反而難用。

## 資料讀取 — 零新增

跟 `UsageDashboard` 同一組讀取，無新 collection、無新 rules：

- `analytics/toolViews` → `viewsMap`（全期，`pickNumericFields`）
- `analytics/toolHelpful` → `helpfulMap`（全期）
- 近 14 天 `analytics_daily/{YYYYMMDD}.byTool` 加總 → `opensMap`
- `getAllTools()` → 工具清單

**實作前要確認**：`getAllTools()` 在 admin 情境回傳含 `status=pending` 的工具（卡關 flag 需要）。若它過濾掉 pending，改用含 pending 的 admin 變體（或既有 admin 已載入的工具陣列）。

## 偵測模組 `healthFlags.mjs`（純函式）

```
buildHealthReport(tools, { viewsMap, opensMap, helpfulMap, nowMs })
  → { staleHot: Row[], zombies: Row[], stuckPending: Row[], orphanKeys: OrphanRow[], counts: {...} }
```

- 回新物件/新陣列，不 mutate 輸入（比照 `toolSignals.mjs`）。
- **freshness**：內建 `toolFreshnessMs(tool)` ＝ `lastUpdatedDate(versions[])`（解析 `YYYY-MM-DD`）→ `updatedAt` → `createdAt`，容忍 Firestore Timestamp（`.seconds`/`.toMillis`）／數字（ms）／字串三型。
- `nowMs` 由呼叫端傳入（純函式不呼叫 `new Date`，比照 `versions.js` 傳 today 的慣例 → 測試可決定性）。
- **median**：內部算「使用門檻」＝ **僅對 views > 0 的公開工具**取全期 views 中位數，再 `max(1, …)` 設地板（奇偶數都要對）。**刻意排除零瀏覽工具**——否則多數工具無瀏覽時 median 會是 0、`views ≥ 0` 恆真，使「熱門但陳舊」對任何 >180 天公開工具都觸發（噪音）。無任何 views>0 工具時，median 門檻 = 1。
- 缺欄位／非數值 → 安全預設（比照 `signal()`）。

### 門檻常數（一處集中，好調）

```
STALE_DAYS        = 180   // 熱門但陳舊：多久沒更新算「陳舊」
ZOMBIE_GRACE_DAYS = 90    // 殭屍：給新工具的曝光寬限期
ZOMBIE_VIEW_MAX   = 3     // 殭屍：全期 views 低於此視為「沒人理」
PENDING_STUCK_DAYS = 14   // 卡關：送審後多久沒處理
```

> 這些是起點，看真實資料再重新校準。

## 四個 Flag 定義

| Flag                      | 判定條件                                                                                                                                                         |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 🔥🕸 **熱門但陳舊**       | 公開中（`status ∈ {live,beta,new}`）＋（全期 `views ≥ 使用門檻`〔= `max(1, median(views>0 公開工具))`〕 **或** 14d `opens ≥ 1`）＋ freshness 距今 `> STALE_DAYS` |
| 🧟 **殭屍工具**           | `status=live` ＋ `views < ZOMBIE_VIEW_MAX` ＋ 14d `opens=0` ＋ `helpful=0` ＋ 上架（createdAt）距今 `> ZOMBIE_GRACE_DAYS`                                        |
| 🐌 **卡關過久**           | `status=pending` ＋ `createdAt` 距今 `> PENDING_STUCK_DAYS`                                                                                                      |
| 👻 **孤兒 analytics key** | `(viewsMap ∪ helpfulMap ∪ opensMap)` 的 key 集合 − 現存 tool id 集合（工具被刪、analytics 殘留）。**純列出，不自動清**                                           |

說明：

- 🔥🕸 與 🧟 互斥（前者要有使用、後者要近零使用）。
- import 工具只有 `createdAt` 又舊又高使用 → 被標「熱門但陳舊」是**正確**的（它從沒被維護過、該找人確認還能用），非誤報。

## UI / 呈現

- 四個分區（section），每區：emoji 標題 ＋ 計數徽章 ＋ 一行「為什麼重要」說明 ＋ 表格。
- 表格欄位依 flag 而定（如熱門但陳舊顯 views/opens/最後更新日/距今天數；孤兒 key 顯 key/殘留 views/helpful）。
- 每個工具列含 `status` pill ＋ 連到 `/tool/{id}`（連結即「行動」）。孤兒 key 無對應工具，不連結。
- **空的區顯綠色「✓ 沒有問題」**（正向回饋，不留空白焦慮）。
- 沿用 `UsageDashboard` 的 dark-mode class／`STATUS_PILL`／`overflow-x-auto`。

## 測試（TDD）

`healthFlags.test.mjs`（node:test），覆蓋每 flag 的邊界：

- 剛好等於門檻（180 天整、90 天整、14 天整、views 剛好等於中位數）。
- 缺欄位（無 versions、無 updatedAt、無 createdAt）。
- import 工具只有 createdAt。
- 孤兒 key 跨三 map union（只在 helpfulMap、只在 14d opensMap…）。
- median 奇數/偶數筆；**全部工具皆零瀏覽 → 使用門檻退到地板 1**（不可讓「熱門但陳舊」全觸發）。
- 空輸入（無工具 / 空 map）→ 全區空陣列。
- 🔥🕸 與 🧟 不重複命中同一工具。

## 錯誤處理 / 邊界

- 缺欄位 → 安全預設（比照 `toolSignals.signal()`）。
- 無工具 → 所有區空陣列 → UI 全顯「✓ 沒有問題」。
- Timestamp 多型 → `toolFreshnessMs` 容忍解析。
- HealthDashboard 載入失敗 → `console.error` ＋ 不炸頁（比照 UsageDashboard try/catch）。

## 風險

- **誤報**：門檻沒調好會把好工具標陳舊/殭屍。緩解：門檻集中常數、純讀無副作用（誤報只是多看一眼，不造成傷害）、上線後依真實資料校準。
- **`getAllTools` 是否含 pending**：實作前驗證（見資料讀取段）。
- **admin-only 效能**：讀取量同 UsageDashboard（已驗可接受），admin 人數少，N+1 非問題。

## 交付清單（給 plan 用）

1. `src/lib/healthFlags.mjs` ＋ `src/lib/healthFlags.test.mjs`（TDD 先行）。
2. `src/components/HealthDashboard.jsx`。
3. `app/admin/page.jsx` 掛 `health` tab。
4. 驗證 `getAllTools()` 含 pending（否則調整資料來源）。

零 rules／零 migration／零 SA／零付費／零新依賴 → merge 即部署。
