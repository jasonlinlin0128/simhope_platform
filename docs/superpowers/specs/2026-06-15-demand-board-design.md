# 需求看板（AI 主題分群）

- 日期：2026-06-15
- 狀態：設計定案（待 writing-plans）
- 主題：admin 後台新分頁，把「待處理的 feature 需求」用 Gemini 分群成主題，導引「該做什麼」。

## 背景與問題

飛輪「回饋 → 發現」環節的收尾。現有「📥 申請/需求」(RequestInbox) 是**原始清單**；缺一層**彙整/洞察**——把一堆自由文字需求歸納成「大家最想要什麼」。本案＝需求看板：on-demand 用 Gemini 分群。

## 決策（brainstorm 定案）

| 維度     | 決定                                           | 理由                                                |
| -------- | ---------------------------------------------- | --------------------------------------------------- |
| 彙整方式 | **AI 主題分群**（Gemini）                      | 自由文字需要語意歸納才有洞察；用既有免費 Gemini     |
| 觸發     | **on-demand「分析需求」按鈕**                  | 控免費額度（按了才呼叫），非自動                    |
| 範圍     | **只 pending 的 feature 需求**                 | 「要做什麼」的依據；access 申請（開發者註冊）不在此 |
| 誠實     | 總數用**真實 DB 計數**；主題/筆數標「AI 歸納」 | 不假裝精確統計                                      |

## 目標 / 非目標

**目標**

- admin 點「分析需求」→ 看到待處理需求被分成幾個主題（主題名 / AI 歸納筆數 / 代表例句）+ 真實總數。
- 沿用既有免費 Gemini，零新付費 API；零 rules/資料/SA。

**非目標（之後）**

- handled/趨勢與跨期統計、自動定期分析、主題→建立工具的連動、匯出。

## 架構與資料流

```
admin 後台新分頁「💡 需求看板」→ 點「分析需求」
  → POST /api/analyze-demand（admin-only，帶 admin idToken Bearer；比照 enrich-tool）
     ① requireRole(request, ["admin"]) + IP 限流
     ② Admin SDK 讀「待處理 feature 需求」：requests where status=='pending'（讀後濾 type=='feature'），取 message（截長度、上限筆數）
     ③ 無待處理 → 回 { themes:[], total:0 }
     ④ callGemini({ json:true, 低溫 })：buildDemandPrompt(messages) → { themes:[{theme,count,examples}] }
     ⑤ normalizeThemes(geminiResult, limit) 清理 → 回 { themes, total }
  → 看板顯示：真實 total + 主題卡（主題名 / AI 歸納筆數 / 代表例句）
```

## 元件（邊界清楚、可獨立測）

1. **`src/lib/demandBoard.mjs`（新，純函式，無 firebase/browser 依賴）**
   - `buildDemandPrompt(messages)`：組分群 prompt（含每筆需求文字、指示「只歸納提供內容、不編造、輸出 JSON `{themes:[{theme,count,examples}]}`」）。
   - `normalizeThemes(geminiResult, limit = 6)`：確保回 `{themes}`；每筆 theme 需有字串 `theme`、數字 `count`、字串陣列 `examples`（examples 截 ≤2）；丟棄壞結構；themes 截 `limit`；壞輸入安全回 `[]`。
   - → TDD。
2. **`app/api/analyze-demand/route.js`（新）** — admin-only + 限流 → Admin SDK 讀 pending feature 需求 message → 空則回 `{themes:[],total:0}` → `callGemini` → `normalizeThemes` → `{themes, total}`。錯誤走 `handleApiError`。
3. **`src/components/DemandBoard.jsx`（新，client）** — 「分析需求」按鈕（取 `auth.currentUser.getIdToken()` 帶 Bearer）→ loading / 主題卡結果 / 空（無待處理）/ 錯誤。比照 ReviewToolWizard 呼叫 enrich-tool 的 Bearer 模式。
4. **`app/admin/page.jsx`（改）** — 加「💡 需求看板」分頁鈕 + `activeTab==="demand"` 時 render `<DemandBoard/>`（比照既有 inbox/usage 分頁）。

## 誠實 / 邊界

- **total 用真實 DB 計數**（pending feature 數）；主題與每主題 count 是 **AI 歸納**，UI 明示。
- Gemini 只摘要「提供的需求文字」，不編造需求。
- on-demand（按了才呼叫，控免費額度）；admin-only（requireRole）+ IP 限流。
- 無待處理需求 → 顯示「目前沒有待處理需求」。
- 截斷：每筆 message 截長度（如 500）、送 Gemini 的需求上限（如 100 筆）避免 prompt 過長。

## 💰 成本 / 不需要的基礎設施

- **沿用既有免費 tier Gemini**（同一把 key），零新付費 API、零新 npm 依賴（見 [[no-paid-apis]]）。
- **無 firestore.rules 變更**（admin 讀 requests 既有允許；route 走 Admin SDK）、無新 collection / index / TTL / SA / Console。
- → **merge 即由 Vercel 部署生效**。

## 測試（TDD）

- `demandBoard.test.mjs`：
  - `buildDemandPrompt`：輸出含每筆需求文字、含「不編造 / 輸出 JSON / themes」指示。
  - `normalizeThemes`：正常 → 回 themes 陣列（theme/count/examples 正確）；examples 截 ≤2；themes 截 limit；缺欄位/型別錯的 theme 丟棄；壞結構（null / 非陣列 / 缺 themes）安全回 `[]`。
- route / DemandBoard UI / admin 分頁：build / lint + 部署後人工驗。

## Rollout

1. merge → Vercel 部署（無前置 ops）。
2. 部署後人工驗（admin 帳號）：①有待處理 feature 需求時點「分析需求」→ 出現主題卡 + 真實總數 ②無待處理需求 → 顯「目前沒有待處理需求」③非 admin 打 route → 403。

## 風險 / 緩解

- **Gemini 壞 JSON / 逾時** → callGemini 既有 502/504 + `normalizeThemes` 安全退化 → UI 友善錯誤。
- **需求量大 prompt 過長** → message 截長度 + 上限筆數。
- **主題筆數不精確** → UI 標「AI 歸納」，total 另用真實計數。
