# ChatbotWidget 誠實化 — 設計（audit #16）

> 日期：2026-06-08 ｜ 分支：`feature-chatbot-honesty`（從 main `7a96faa`，含 #23/#25）
> 來源：`docs/optimization-audit-2026-06-07.md` #16

---

## 1. 背景

`src/components/ChatbotWidget.jsx`（全站掛在 `app/layout.js:44`）右下角 🤖 浮鈕，點開是聊天面板：有 input 框、按送出後假打字「輸入中…」延遲 800ms，然後**不管輸入什麼都回固定一句**「目前 AI 回覆功能正在建置中…可去工具總覽或寄信」。這是 dark-pattern 式失望（假裝有 AI 對話、假裝思考）。

平台其實已有對應的真實入口：`/hub`（Fuse.js 工具搜尋）+ RequestCard（提需求，已於 #25 改為共用 `<Modal>`）。浮鈕功能上與這兩者重疊，且「假裝 AI」誤導。

## 2. 目標 / 非目標

**目標**

- 移除假對話 dark pattern（input/假打字/固定「建置中」回覆/「AI 小幫手」框架）。
- 浮鈕改成**誠實的「需要幫忙?」小面板**，導流到兩個真實動作：找工具（/hub）、提需求（RequestCard）。
- 保留全站右下角快速入口的價值。

**非目標**

- 不接真 AI Q&A（要新後端，超出 #16 的 S；方向 C 已否決）。
- 不動 layout 掛載、不動 RequestCard 內部、不動 API/rules、無 migration。
- 不為小 popover 加 focus trap（它非 modal；RequestCard 開出來才是 modal，a11y 由 #25 顧）。

## 3. 架構

只改 **`src/components/ChatbotWidget.jsx`** 一檔（重寫）。`app/layout.js` 的 `<ChatbotWidget />` 掛載不變。提需求動作重用既有 `src/components/RequestCard.jsx`（props `{ onClose }`，#25 後是 `<Modal>`）。

## 4. 元件行為（重寫後）

state：`const [open, setOpen] = useState(false)`（面板開關）+ `const [showReq, setShowReq] = useState(false)`（RequestCard 開關）。**刪除** `messages` / `input` / `loading` / `send()` / `handleKey` / `bottomRef` / useEffect 捲動。

- **浮鈕**（保留位置 `fixed bottom-6 right-6 z-50`、漸層樣式）：
  - 圖示 `🤖` → **`💬`**；開啟態 `✕`。
  - `aria-label="需要幫忙?"`（原「開啟 AI 助手」）。
  - onClick toggle `open`。
- **面板**（`open` 時顯示；沿用卡片外觀 `w-80 bg-white dark:bg-gray-900 rounded-2xl shadow border`，但內容改）：
  - header 漸層列：標題「**需要幫忙?**」、副標「找現成工具，或把需求告訴經企室」、右上 ✕（`setOpen(false)`）。（移除「SimHope AI 小幫手 / 有問題直接說」）
  - body 兩個動作鈕（縱向）：
    1. **`🔍 找現有工具`** — `next/link` `href="/hub"`，onClick `setOpen(false)`。
    2. **`💬 提需求給經企室`** — `<button>` onClick `() => { setShowReq(true); setOpen(false); }`。
  - 移除 input 區、messages 區、loading 區。
- **RequestCard**：元件尾端 `{showReq && <RequestCard onClose={() => setShowReq(false)} />}`。
- import 加 `import Link from "next/link";` 與 `import RequestCard from "@/components/RequestCard";`。

## 5. 資料流 / 錯誤態

無 API 呼叫（假的已拔）。找工具＝純導航；提需求＝RequestCard 自行處理 `/api/refine-request` + `/api/request`（其錯誤態原本就有）。本元件無 loading/error 態。

## 6. 測試 / 驗證

- `npm run build` 綠、`npm run lint` 基準 5 problems 不增。
- **playwright E2E（公開、免登入）**：
  1. 右下浮鈕（aria-label「需要幫忙?」）可開面板。
  2. 面板**無 textarea/input、無「輸入中…」、無「建置中」**字樣。
  3. 點「🔍 找現有工具」→ 導到 `/hub`。
  4. 點「💬 提需求給經企室」→ `[role=dialog]`（RequestCard）跳出、面板關閉。
- grep 確認元件內 `建置中` / `輸入中` / `setTimeout` / `messages` 歸零。

## 7. 交付 / 風險

- 單檔重寫 + 重用 RequestCard；浮鈕仍全站掛載。無 migration/rules → 可乾淨 `git revert`。
- 分支 `feature-chatbot-honesty`（從 main）→ PR → 獨立 reviewer → CI/Vercel 綠 → 等 Jason merge。
- commit：單一 commit（單檔重寫），或拆「重寫元件」+「接 RequestCard」兩步——因高度耦合，傾向單 commit。

## 8. 完成定義（DoD）

- 假對話全移除（grep 歸零）；浮鈕→誠實面板→/hub + RequestCard。
- build 綠、lint 不增、E2E 四項過。
- PR 描述：行為前後對比 + 待 Jason 正式站點按（含手機 RWD：浮鈕/面板在小螢幕不擋內容）。
