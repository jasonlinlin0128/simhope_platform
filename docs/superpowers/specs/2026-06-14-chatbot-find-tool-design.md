# Chatbot 找工具助理（語意找工具）

- 日期：2026-06-14
- 狀態：設計定案（待 writing-plans）
- 主題：把現有「誠實版」ChatbotWidget 升級成 AI 語意找工具——使用者描述需求，回傳目錄裡最相符的工具卡。

## 背景與問題

現有 `ChatbotWidget`（右下浮鈕）是刻意的「誠實版」：不假裝 AI 對話，只有兩顆按鈕——「找現有工具」(連 /hub) 與「提需求」(RequestCard)。
缺口：使用者不一定知道用什麼關鍵字搜、也不知道某個需求有沒有對應工具。語意找工具能把「我想做 X」直接對應到現成工具，是飛輪的「發現」環節。

## 決策（brainstorm 定案）

| 維度     | 決定                           | 理由                                               |
| -------- | ------------------------------ | -------------------------------------------------- |
| 互動模式 | **單次語意比對**（非多輪對話） | 符合平台「不假裝 AI 對話」原則；低幻覺、低成本、快 |
| 比對引擎 | **Gemini**（語意）             | 比關鍵字模糊搜更懂「我想做 X」；callGemini 已現成  |
| 結果呈現 | **卡片 + 一句整體回應**        | 有「助理感」又把幻覺面壓到最小（不做每工具理由）   |
| 落點     | **沿用 ChatbotWidget**         | 既有入口；保留兩顆按鈕當 fallback                  |
| 找不到   | **誠實回應 + 引導提需求**      | 不硬湊；接既有 RequestCard                         |

## 目標 / 非目標

**目標**

- 使用者在 widget 打一句需求 → 回傳目錄中最相符的工具卡（上限 4）+ 一句整體回應。
- 嚴格 grounding：只推目錄裡真實存在的工具；找不到就誠實說、引導提需求。
- 匿名可用、IP 限流；完全自我完整（無 rules/資料/SA）。

**非目標（之後）**

- 多輪對話、每工具推薦理由、搜尋歷史、點擊回饋學習。

## 架構與資料流

```
ChatbotWidget（client，浮動面板）新增輸入框「描述你想做的事…」
  送出 → POST /api/find-tool { query }
     ① IP 限流（10/min，比照 /api/refine-request）
     ② getServerCatalog()（REST、已快取）→ 篩 status in [live,beta,new]
        → 精簡成 [{ id, title, tagline, scenarios, tags }]
     ③ callGemini({ json:true, temperature:0.3 })：
        prompt = buildFindToolPrompt(query, 精簡清單)
        規則：只能從清單挑、回 { toolIds:[...], reply:"一句話" }、找不到 toolIds 回 []、不可編造 id
     ④ validateToolMatches(geminiResult, fullCatalog, limit=4)
        → 濾掉不在目錄的 id、截上限、帶出 reply
     → 回 { reply, tools:[ 被選中的完整工具物件 ] }
  面板顯示：reply + 對應 <ToolCard>；tools 為空 → 顯示 reply（誠實「沒有現成的」）+「提需求」按鈕
送出當下 client 端 track("search")（沿用既有事件，計入搜尋數）
```

## 元件（邊界清楚、可獨立測）

1. **`src/lib/findTool.mjs`（新，純函式，無 firebase/browser 依賴）**
   - `buildFindToolPrompt(query, tools)`：組 Gemini prompt（含使用者 query + 精簡工具清單；明確指示只回清單內 id、輸出 JSON `{toolIds, reply}`、找不到回空）。
   - `validateToolMatches(geminiResult, catalog, limit = 4)`：把 Gemini 回的 `toolIds` 濾成「確實存在於 catalog」的、去重、截 `limit`，回 `{ reply: string, tools: object[] }`；任何缺漏 / 壞輸入安全退化（reply 給通用字串、tools=[]）。
   - → TDD。
2. **`app/api/find-tool/route.js`（新）**
   - 匿名（無 requireRole）+ IP 限流；`getServerCatalog` 篩 live/beta/new；`callGemini`（json）；`validateToolMatches`；回 `{reply, tools}`。錯誤走既有 `handleApiError`（HttpError → 對應碼；其它 → 500 通用）。
3. **`src/components/ChatbotWidget.jsx`（改）**
   - 面板加：輸入框 + 送出鈕 + loading 狀態 + 結果區（reply 一句 + ToolCard 列）+ 無結果 fallback（reply + 既有「提需求」按鈕）。
   - 保留既有「找現有工具 / 提需求」兩顆按鈕。
   - 送出時 `track("search")`。

## 誠實 / 防幻覺（平台核心原則）

- Gemini 只能從清單挑、回 id；**server `validateToolMatches` 驗證所有 id 都在目錄內**，幻覺 id 一律丟掉。
- 低溫（0.3）、上限 4 筆。
- 找不到 → 誠實 reply + 引導提需求（不硬湊）。
- Gemini 逾時 / 壞 JSON（callGemini 既有 502/504）→ widget 顯示友善錯誤，不假裝有結果。
- 只送「使用者主動輸入的 query」+ 公開工具清單給 Gemini；不送任何個人資料。

## 不需要的基礎設施

- 無 `firestore.rules` 變更（只讀公開目錄 + 呼叫 Gemini）
- 無新 collection / index / TTL / SA / Console 操作
- `GEMINI_API_KEY` 已設（與其他 AI route 共用）
- **成本／不串付費 API（Jason 確認）**：沿用既有 **免費 tier** Gemini（同一把 key、~5 req/min 免費額度、零帳單），**不引入任何新付費 API**。見 [[no-paid-apis]]。
- → **merge 即由 Vercel 部署生效**

## 預設值（可於 plan/實作微調）

- 比對上限 = **4**
- 排序範圍 = **live / beta / new**（不推 terminated/dev/pending）
- Gemini temperature = **0.3**、`json:true`
- IP 限流 = **10/min**（比照 refine-request）
- 輸入框 placeholder 例：「描述你想做的事，例：把 PDF 合併、翻譯產線術語…」
- 送出記一筆 `track("search")`

## 測試（TDD）

- `findTool.test.mjs`：
  - `buildFindToolPrompt`：輸出含 query、含每個工具的 id 與 title、不漏工具、含「只回清單內 id」指示字串。
  - `validateToolMatches`：濾掉不存在的 id；保留存在的；去重；截 `limit`；空 toolIds 回 `{reply, tools:[]}`；Gemini 回壞結構（null / 缺欄位）安全退化；reply 缺時給通用字串。
- route / widget UI：build / lint + 部署後人工驗（打幾個 query、找不到的情境、Gemini 失敗情境）。

## Rollout

1. merge → Vercel 部署（無前置 ops）。
2. 部署後人工驗：①打「PDF 合併」「翻譯」等 query → 回相符工具卡 + 一句回應；②打目錄沒有的需求 → 誠實回應 + 提需求按鈕；③（可選）模擬 Gemini 失敗 → 友善錯誤。

## 風險 / 緩解

- **幻覺工具** → server 端 id 驗證（最重要防線）+ 低溫 + 明確 prompt。
- **Gemini 額度濫用** → IP 限流（既有 rateLimit）。
- **空目錄 / REST 失敗** → getServerCatalog fail-soft 回 []；validateToolMatches 空安全 → widget 顯示「暫時找不到，請改用搜尋或提需求」。
