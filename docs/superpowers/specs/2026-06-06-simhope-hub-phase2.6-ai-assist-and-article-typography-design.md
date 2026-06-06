# SimHope Hub Phase 2.6 — AI 輔助撰寫鈕 + 文章式閱讀排版

> 狀態：設計定稿（2026-06-06）。承接 Phase 2.5 上線後 Jason 測試時提的兩個 UX 需求。
> 視覺定案參考：`C:/dev/outputs/phase2.6-typography-mock-v2.html`（強調 A 乾淨加粗 + 容器 B 細線分隔）。

## 0. 目標與不變的核心洞察

平台使用者**多是一般讀者（非技術同仁）**。詳情頁的「詳細說明 / 專案介紹」目前以原始 markdown 風格渲染——
**每段、每個列點都被設成粗體**（`mdComponents` 的 `p`/`li` 都 `font-bold`），整片又重又「技術文件感」，
讀者不知從哪看起。本階段兩件事，共同服務一個目標：**讓內容讀起來像一篇部落格文章**。

- **Part A（寫的人）**：在 block 文字編輯器加 AI 輔助鈕，用「Jason 部落格解說口吻、寫給一般讀者」**潤飾/生成**內容。
- **Part B（看的人）**：把 `desc` 與 `text` block 的渲染升級成**文章式閱讀排版**（輕盈內文、細線分段、乾淨強調）。

兩者獨立、可分別實作，但同屬 Phase 2.6。

---

## Part A — Block 文字編輯器 AI 輔助鈕

### A.1 範圍

- **只先做詳情頁編輯模式 `BlockEditor` 的 `text` block textarea**（作者寫說明書/介紹最常用、最需要）。
- tip / warning / faq / 版本 notes / wizard desc **本輪不做**（YAGNI；同元件日後可複用）。

### A.2 UX

- `text` block 的 textarea 旁（右上或下方）一顆「✨ AI」鈕 → 點開 inline 小面板：
  - **指示輸入框**：placeholder「要 AI 幫你做什麼？例如：用部落格口吻介紹這個版本更新了什麼」
  - **可選「來源連結」**：placeholder「可貼 GitHub README 或文件連結，AI 會讀內容再寫」
  - 兩個動作鈕：
    - **「✨ 潤飾現有內容」** → 送目前 textarea 內容請 AI 潤飾成部落格口吻。
    - **「✨ 依指示生成」** → 依指示（＋可選來源連結內容）生成。
- 送出 → loading → 結果顯示在**預覽框（唯讀）**。
- 作者按 **「採用」** 才覆寫 textarea；按 **「取消」** 丟棄（**不直接覆寫**，保護作者原文）。
- 失敗（quota/網路/格式）→ 面板內紅字提示，**不影響繼續手動編輯**。

### A.3 元件

- 新 `src/components/AiAssist.jsx`（受控）：props `{ value, onAccept(text), context? }`。
  - 自管 open / instruction / sourceUrl / loading / preview / error 本地 state。
  - `onAccept(text)` 由 BlockEditor 傳入 → 設該 block 的 `content`。
- `BlockEditor` 的 `text` 分支：在 textarea 區塊加 `<AiAssist value={block.content} onAccept={(t)=>onChange({...block, content:t})} />`。

### A.4 後端 `POST /api/ai/assist-block`

沿用 `app/api/admin/enrich-tool/route.js` 的結構（Bearer idToken → Identity Toolkit lookup → Firestore users/{uid}.role）。差異：

- **Gating**：`role in ['developer','admin']`（作者也能用；非僅 admin）。未登入 401、角色不符 403。
- **Body**：`{ mode: 'polish' | 'generate', currentText?, instruction?, sourceUrl? }`。
- **來源連結抓取**（generate 且有 sourceUrl 時）：複用 enrich 的 GitHub README 抓法；非 GitHub 則 `fetch(sourceUrl)` 取純文字、`.slice(0, 6000)`。抓不到就略過（靠 instruction 生成）。
- **Gemini**：`gemini-2.5-flash:generateContent`，**純文字回應**（不是 JSON；要的是 markdown 散文）。`temperature` 約 0.7。
- **System prompt（語氣是重點）**：
  > 你是 SimHope 內部 AI 工具平台的內容撰寫助理。用**親切、像在跟一般同仁解釋**的部落格口吻寫——娓娓道來的內文，
  > 寫給**非技術的一般讀者**。**避免**：條列式技術 changelog 腔、整段粗體、堆砌 markdown 標記。
  > 適度用 `##` 小標分段（2–4 段）讓人好讀；關鍵字才加粗；多用完整句子與生活化比喻。輸出**繁體中文 markdown**。
  - mode=polish：「把下面這段內容潤飾成上述口吻，保留原意與事實，只改表達」＋ `currentText`。
  - mode=generate：「依下面指示撰寫；若附了來源內容請據實摘要、不要編造」＋ `instruction` ＋（來源內容）。
- **Returns**：`{ text }`（markdown 字串）。失敗回 4xx/5xx + `{ error }`。
- **Env**（皆已設）：`GEMINI_API_KEY`、`FIREBASE_WEB_API_KEY`、`FIREBASE_PROJECT_ID`。

---

## Part B — desc + text block 文章式閱讀排版

視覺定案：**強調 A（乾淨加粗、不換色）+ 容器 B（細線分隔、不包框）**。

### B.1 升級共用 `mdComponents`（影響 desc + text block）

`app/tool/[id]/page.jsx` 的 `mdComponents`（被 `MarkdownContent` 用）改成**文章級 typography**：

| 元素       | 現在                     | 改成                                                                                                      |
| ---------- | ------------------------ | --------------------------------------------------------------------------------------------------------- |
| `p`        | `font-bold` 緊湊         | **正常字重** `font-normal`、`leading-[1.9]`、約 `text-[1.04rem]`、`text-[var(--color-text-dark)]`、`mb-4` |
| `li`       | `font-bold`              | **正常字重**、`leading-relaxed`、自訂記號（✦／柔和點）、舒服間距                                          |
| `strong`   | 紫色 `text-clay-purple`  | **乾淨加粗** `font-bold` 用一般深墨色（**不換色** — 強調 A）                                              |
| `h2`       | `font-black text-xl`     | 柔和些：`font-extrabold`、適度上下留白                                                                    |
| `h3`       | `font-extrabold text-lg` | 同調性微調                                                                                                |
| `code`/`a` | 沿用                     | 沿用（tasteful）                                                                                          |

> ⚠️ 此改動同時影響 `desc` 與詳情頁的 `text` block（皆走 `MarkdownContent`）——**正是 Jason 要的「desc + text block 一起」**。
> tip/warning/steps/faq/image/video 有各自樣式、**不受影響**。

### B.2 新 helper `src/lib/article.js`（純函式，可 node 斷言）

`splitMarkdownSections(md)` → `{ lead: string, sections: Array<{ heading, body }> }`：

- `lead` = 第一個 `## ` 標題前的內容（trim）。
- `sections` = 每個 `## 標題` 到下一個 `##` 之間，拆成 `{ heading, body }`。
- 無任何 `## ` → `{ lead: md, sections: [] }`（短文案不強切）。
- 邊界：標題前後空白、空段落、CRLF 容錯。
- 斷言：`scripts/__verify-article.mjs`。

### B.3 新元件 `src/components/ArticleDesc.jsx`

props `{ desc }`，用 `splitMarkdownSections`：

- **lead**（若有）：略大、`leading` 放鬆、`text-[var(--color-text-mid)]` 的「導言」段（用 `MarkdownContent` 渲染，外層加 lead 樣式）。
- **sections**：逐段渲染，每段 = 小編號 `01`/`02`…（clay-purple 小字）+ 標題（`font-extrabold`）+ body（`MarkdownContent`）。
  - **容器 B（細線分隔）**：段與段之間用 `border-t border-[var(--color-card-border)]` + 充足上下 `padding`/間距分隔，**不包卡片框、不加底色**。第一段無上線。
- 無 sections（純 lead）→ 就渲染成一段文章 body，不硬切。

### B.4 接進 DetailTab

`app/tool/[id]/page.jsx` 的 `DetailTab`：把

```jsx
{
  tool.desc && (
    <div className="max-w-none">
      <MarkdownContent>{tool.desc}</MarkdownContent>
    </div>
  );
}
```

換成

```jsx
{
  tool.desc && <ArticleDesc desc={tool.desc} />;
}
```

`text` block 不改結構（仍 `MarkdownContent`），自動吃 B.1 的新 typography。

---

## 風險與迴歸面

1. **`mdComponents` 全域字重改變**（最大視覺位移）：desc + 所有 `text` block 從「整片粗體」變「正常字重」——
   要 preview 實際內容確認可讀、不破版、既有內容不依賴粗體呈現。
2. **`ArticleDesc` 切段**：含 `##` 的長 desc 變多段細線分隔；無 `##` 的 Pattern C 短文案維持單段（lead）——兩條路都要測。
3. **AI endpoint**：Gemini 額度/延遲；gating 要擋非 developer/admin（401/403）；失敗不可卡死編輯（面板紅字、textarea 照常可手改）。
4. **AI 語氣**：靠 system prompt + 預覽再採用把關；不直接覆寫作者原文。
5. **firestore.rules**：不需改（不新增 collection；AI endpoint 不寫 DB，只回文字）。

## 不做（YAGNI）

- AI 鈕擴到 tip/warning/faq/版本 notes/wizard desc（先 text block）。
- drop-cap 首字放大、TOC/on-this-page、pull-quote、自訂字體。
- 包框卡片（已選細線分隔）、純 typography 以外的版面重構。
- 把文章排版套到詳情頁以外（首頁/hub 卡片不動）。

## 驗收標準

- [ ] `text` block 有「✨ AI」鈕；潤飾與生成皆可用；結果先預覽、按「採用」才填入、「取消」丟棄；輸出讀起來是部落格口吻。
- [ ] `/api/ai/assist-block`：未登入 401、非 developer/admin 403；GitHub README / 純文字 URL 抓取可用；錯誤回 4xx/5xx 且前端不卡死。
- [ ] `desc` 文章式呈現：lead 導言 + 細線分隔的編號段落；強調為乾淨加粗（不換色）；無 `##` 的 desc 渲染為單段文章 body。
- [ ] `text` block 吃到新 typography（正常字重內文、乾淨加粗）；tip/warning/steps/faq/image/video 無迴歸。
- [ ] `node scripts/__verify-article.mjs` 通過；`npm run build` + `npm run lint`（touched 檔無新增錯誤）；preview 目視 desc + text block 體感符合 mock v2。

## 實作引擎

subagent-driven（同 2.5）：每 task implementer → spec review → quality review，最後一支整體 review。

## 順帶（非本 spec 主體）

spec 2.5 §12 的 cleanup（root scratch `test*.js`、stale branch、`taxonomy.js TYPE_DATA_FIELDS` 廢欄位）可在這輪或另開一起清。
