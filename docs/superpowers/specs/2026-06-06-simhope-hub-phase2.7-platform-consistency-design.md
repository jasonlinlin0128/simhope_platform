# SimHope Hub Phase 2.7 — 全平台呈現一致性

> 狀態：設計定稿（2026-06-06）。承接 2.6 文章式 typography 上線後，Jason 要求「平台每個頁面都一致、改成計畫的樣子」。
> 依據：全平台一致性 audit（2026-06-06）。

## 0. 目標與核心洞察

2.6 在詳情頁上線了「文章式 typography」（共用 `src/components/MarkdownContent.jsx`：正常字重內文、乾淨加粗、
✦ 清單、舒服行距）。但 **`/faq`、`/changelog`、版本歷史各自用裸 `ReactMarkdown`**，所以同樣是文章內容、
詳情頁是新風、這些頁還是舊樣。**不一致的根源是「prose 各自渲染」，不是每頁都要大改。**

**決策（Jason 拍板）**：

- **範圍＝全部做（P1–P4）**：所有 prose 走共用 `MarkdownContent`；UI 頁的硬編灰色換品牌 token。
- **聲量＝內頁文章輕、首頁保留行銷聲量**：內容頁（/docs /faq /changelog）內文用輕盈文章 typography、
  內文區的 section 標題降成 `font-extrabold`；**首頁（行銷頁）維持 `font-black` 大標題**，不收斂。
  各頁的「頁面標題 h1」（置中大標）屬結構頁首、維持既有一致 pattern、不動。

## 1. P1 — `/faq` 與 `/changelog` 走共用 MarkdownContent（最高效益）

### 1.1 `src/components/Accordion.jsx`（修好 /faq + 詳情頁 faq block）

- 答案區把 `<ReactMarkdown remarkPlugins={[remarkGfm]}>{item.a}</ReactMarkdown>` 換成 `<MarkdownContent>{item.a}</MarkdownContent>`。
- 拔掉 wrapper `<div>` 的臨時排版 class：`text-sm`、`leading-relaxed`、`[&_a]:…`、`[&_ul]:list-disc …`、`[&_ol]:…`、`[&_code]:…`
  （這些由 `mdComponents` 接手）。保留 padding / border-t / 容器結構。
- 移除 `ReactMarkdown`/`remarkGfm` import（改 import `MarkdownContent`）。
- 結果：FAQ 答案＝文章 body（正常字重、✦ 清單、乾淨加粗、品牌連結色）。

### 1.2 `src/components/ChangelogTimeline.jsx`（修好 /changelog）

- `Section` 元件：每個 bullet 是獨立字串 `items: string[]`。把目前「`<ul>` + 逐項 `<ReactMarkdown p→span>`」改成
  **把 items 組成 markdown 無序清單丟給一個 `MarkdownContent`**：
  ```jsx
  <MarkdownContent>{items.map((it) => `- ${it}`).join("\n")}</MarkdownContent>
  ```
  → 拿到正確的 ✦ 清單 + 文章 li typography + 品牌粗體/連結/code，不用逐項包、不用 p→span hack。
- `heading` 小標籤（`text-xs font-extrabold uppercase tracking-wider text-mid`）＝結構標籤，**保留**。
- `VersionCard` 的 `summary`：`font-semibold` → `font-normal`（內文輕盈）。
- 版本號 `font-black text-lg` → `font-extrabold text-lg`（內頁標題輕化）。
- timeline 左 rail / dot 結構保留（這是 /changelog 專屬好設計）。
- 移除 `ReactMarkdown`/`remarkGfm` import（改 import `MarkdownContent`）。

## 2. P2 — 版本歷史走共用 MarkdownContent

### `src/components/VersionHistory.jsx`

- notes 區把裸 `<ReactMarkdown remarkPlugins={[remarkGfm]}>{v.notes}</ReactMarkdown>` 換成 `<MarkdownContent>{v.notes}</MarkdownContent>`。
- 拔掉 wrapper 的 `[&_p]:mb-1 [&_ul]:list-disc [&_ul]:ml-5 [&_a]:…` 臨時 class。
- 移除 `ReactMarkdown`/`remarkGfm` import（改 import `MarkdownContent`）。

## 3. P3 — `/docs` prose 正規化（手寫 JSX，就地調 class，不整頁改寫）

`app/docs/page.jsx` 是手寫 JSX（無 markdown）。**不做整頁 markdown 化（YAGNI、風險高）**，只就地把 prose 字重/標題對齊文章感：

- 內文段落與清單項的 `font-semibold` → `font-normal`；長段落加 `leading-relaxed`（或 `leading-[1.9]`）。
- 內文區 section `<h2>`：`text-2xl font-black` → `text-xl font-extrabold`（內頁標題輕化）。
- 置中**頁面標題 h1**（頁首）維持既有 pattern、不動（與其他內容頁一致）。
- 行內 `<code>` 既有 `bg-gray-100 dark:bg-gray-700` 與 mdComponents 一致、保留。

## 4. P4 — UI 頁硬編灰色 → 品牌 token（一致性清理，非 typography）

各 UI 頁把散落的硬編 `gray` class 換成品牌 CSS var（**只換對應到既有 token 的顏色，不動版面/邏輯**）：

- `app/hub/page.jsx`：搜尋框 `border-gray-200 dark:border-gray-700` → `border-[var(--color-card-border)]`；空狀態 `text-gray-500` → `text-[var(--color-text-mid)]`。
- `app/dashboard/page.jsx`：歡迎標題列 `border-gray-100 dark:border-gray-700` → `border-[var(--color-card-border)]`。
- `app/admin/page.jsx`：`<aside>` `border-gray-200` → `border-[var(--color-card-border)]`、sidebar nav `text-gray-600` → `text-[var(--color-text-mid)]`；補一個漏 token 的 `h2` 加 `text-[var(--color-text-dark)]`。（黃色 pending 警示塊＝狀態色，保留。）
- `app/access/page.jsx`：role 卡 `rounded-3xl` → `rounded-2xl`（與站內慣用一致）。
- `app/page.jsx`（首頁）：testimonial 卡 `style={{ borderTop: '4px solid <hex>' }}` 的**硬編 hex** → 改用品牌 token CSS var（其餘行銷字重 `font-black`/`font-semibold` **維持不動**）。

## 5. 風險與迴歸面

1. **prose 走 MarkdownContent 的視覺位移**：/faq 答案、/changelog bullet、版本歷史 notes 會從「小字緊湊」變「文章級行距 + ✦」。
   要 preview 確認 compact 內容（如 changelog 密集條列）不會過於鬆散；體感過鬆再回來微調 mdComponents 或在這些容器加局部 override。
2. **Changelog items → `- {it}` 組裝**：假設每個 item 是單行純文字 bullet（CHANGELOG 解析後即如此）。若 item 含換行需注意；
   驗收要看實際 /changelog 渲染正確（✦、inline 粗體/連結、技術細節收合仍動）。
3. **Accordion 共用**：/faq 與詳情頁 faq block 都用這顆 → 兩處都要驗無迴歸（展開/收合、markdown）。
4. **token 替換**：只換顏色 class、不動結構；逐頁 preview 無破版。
5. **首頁不動行銷字重**：只換一個 testimonial 硬編 hex；其餘維持。
6. **firestore.rules / 資料**：完全不動；無 migration。

## 6. 不做（YAGNI）

- /docs 整頁 markdown 化、抽 docs 內容到資料層。
- 首頁/dashboard/admin 的字重「行銷→文章」收斂（決策：首頁保留聲量；dashboard/admin 是工具 UI 不需文章 typography）。
- 改 mdComponents 的尺寸/行距去遷就 compact 場景（先用既有；真的太鬆再局部 override）。
- 新增任何頁面 / 元件 / collection。

## 7. 驗收標準

- [ ] `/faq` 答案：文章 typography（正常字重、✦ 清單、乾淨加粗、品牌連結色）；展開/收合與詳情頁 faq block 無迴歸。
- [ ] `/changelog`：每版 bullet ✦ 清單 + inline 粗體/連結/code 正確；summary 正常字重；版本號 font-extrabold；技術細節收合仍動。
- [ ] 詳情頁版本歷史 notes 走 MarkdownContent、與全站一致。
- [ ] `/docs`：內文 font-normal、section 標題 font-extrabold；頁首 h1 不變；讀起來與文章頁一致。
- [ ] UI 頁（hub/dashboard/admin/access/home）硬編灰色換 token、無破版；首頁行銷字重維持。
- [ ] `npm run build` + `npm run lint`（新增/改動檔無新增錯誤）；逐頁 preview 目視一致。

## 8. 實作引擎

subagent-driven（同 2.5/2.6）：每 task implementer → spec review → quality review，最後一支整體 review。
本輪以 UI/視覺為主、邏輯改動少 → 驗證重 preview 目視。

## 9. 順帶（非本 spec 主體）

2.5 §12 的 cleanup（root scratch `test*.js`、`taxonomy.js TYPE_DATA_FIELDS` 廢欄位）仍待清，可另開。
