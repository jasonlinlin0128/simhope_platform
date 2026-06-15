# 工具評分（👍 有幫助）

- 日期：2026-06-15
- 狀態：設計定案（待 writing-plans → 另開 session 實作）
- 主題：詳情頁加「👍 有幫助」計數，作為使用回饋訊號。Phase 3「工具評分·下架流程」之評分部分（下架已存在＝status=terminated，不重做）。

## 背景與問題

飛輪「使用 → 訊號」：目前只有瀏覽/開啟的被動訊號，缺使用者「主動表態這工具有用」。👍 有幫助＝低摩擦的主動回饋，沿用既有 analytics track 基礎設施（tool_view 同款）。

## 決策（brainstorm 定案）

| 維度 | 決定                                                                   | 理由                                          |
| ---- | ---------------------------------------------------------------------- | --------------------------------------------- |
| 形式 | **👍「有幫助」計數**（非 5 星 / 非 👎）                                | 低摩擦；倒讚對內部工具傷士氣                  |
| 機制 | **沿用 analytics track**（匿名 + session/localStorage 去重 + IP 限流） | 與 tool_view 一致、零 rules 變更、零依賴      |
| 顯示 | **僅詳情頁**（「N 人覺得有幫助」+ 👍 鈕）                              | YAGNI；ToolCard 顯數字、依 helpful 排序＝之後 |
| 誠實 | 真實 aggregate；匿名「方向性」訊號、可清 storage 繞過                  | 內部站可接受，UI 不假裝精準                   |

## 目標 / 非目標

**目標**

- 詳情頁顯示「N 人覺得有幫助」+ 👍 鈕；點一下記一筆、變「已標記」、樂觀更新。
- 零外部付費 API、零新依賴、零 rules 變更。

**非目標（之後）**

- 5 星 / 👎、依 helpful 排序首頁、ToolCard 顯數字、per-user 帳號級評分與可取消、防灌水強化。

## 架構與資料流

```
詳情頁 view 模式底部 <HelpfulButton toolId={id} />
  mount：client 讀 analytics/toolHelpful（公開讀）取本工具 count；localStorage `simhope_helpful_<id>` → 已標記態
  點 👍（未標記才可）：
    → track("tool_helpful", { toolId })（fire-and-forget、session 去重）
    → POST /api/track → 若 inc.helpfulToolKey → analytics/toolHelpful.{id} +1（Admin SDK；analytics 規則公開讀 / client 禁寫）
    → localStorage 標記 + 樂觀 count++ + 鈕變「✓ 已標記有幫助」
```

## 元件（多為擴充既有檔，鏡像 tool_view）

1. **`src/lib/trackEvents.mjs`（改）** — `TRACK_EVENTS` 加 `tool_helpful: "toolHelpful"`；`buildIncrements` 回值加 `helpfulToolKey`（`tool_helpful` + toolId → toolId，否則 null）。
2. **`src/lib/trackEvents.test.mjs`（改）** — 既有 `buildIncrements` deepEqual 全部加 `helpfulToolKey: null`；新增 `tool_helpful` 測試；`eventField` 測試加 `tool_helpful`。
3. **`app/api/track/route.js`（改）** — `inc.helpfulToolKey` 存在時，batch `set(analytics/toolHelpful, { [id]: increment(1) }, { merge:true })`（比照既有 toolViews 區塊）。
4. **`src/lib/track.js`（改）** — `tool_helpful` 納入 session 去重（`dedup` 條件加 `|| event === "tool_helpful"`）+ JSDoc event union 加 `tool_helpful`。
5. **`src/components/HelpfulButton.jsx`（新，client）** — props `{toolId}`：mount 讀 count（`getDoc(analytics/toolHelpful)`）+ localStorage 標記態；render「👍 有幫助 / ✓ 已標記有幫助」+「N 人覺得有幫助」；點擊 → track + localStorage + 樂觀 count++。封裝所有評分邏輯。
6. **`app/tool/[id]/page.jsx`（改）** — import `HelpfulButton`，在 **view 模式**（非 isEditMode）內容區（DetailTabs 之後）render `<HelpfulButton toolId={id} />`。最小改動。

## 誠實 / 邊界

- 「N 人覺得有幫助」＝真實 aggregate；匿名（localStorage + session 去重），可清 storage 繞過 → 內部站可接受、屬方向性訊號。
- 只在詳情頁；不影響首頁/排序（之後）。
- analytics/toolHelpful 公開可讀（同 toolViews）→ client 讀 count 合法。

## 💰 成本 / 基礎設施

- **零新付費 API、零新 npm 依賴**；`analytics/toolHelpful` 由既有 `analytics/{docId}` 規則涵蓋（公開讀 / client 禁寫）→ **無 firestore.rules 變更**、無 index/TTL/SA。→ merge 即部署。

## 測試（TDD）

- `trackEvents.test.mjs`（擴充）：`eventField("tool_helpful")==="toolHelpful"`；`buildIncrements("tool_helpful","t1")` → `{field:"toolHelpful", byToolKey:null, viewToolKey:null, helpfulToolKey:"t1"}`；既有 open/view/search 測試補 `helpfulToolKey:null`。
- route / track.js dedup / HelpfulButton UI / 詳情頁掛載：build / lint + 部署後人工驗。

## Rollout

1. merge → Vercel 部署（無前置 ops）。
2. 部署後人工驗：詳情頁出現 👍 + 「N 人覺得有幫助」；點一下 → 變「✓ 已標記」、count+1；重整仍顯已標記；`analytics/toolHelpful` 有累加。

## 風險 / 緩解

- **灌水（清 storage 重點）** → 內部站、方向性訊號可接受；既有 /api/track IP 60/min 限流。
- **analytics/toolHelpful 不存在（第一次）** → getDoc 不存在 → count 視為 0；首次 increment 由 merge 建立。
