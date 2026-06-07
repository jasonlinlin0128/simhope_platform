# 全站硬編色 dark-mode 普查 + 共用常數收斂 — 設計

> 日期：2026-06-07 ｜ 分支：`feature-color-token-sweep`
> 來源：`docs/optimization-audit-2026-06-07.md` #17 / #33 / #35（+ 普查擴及全庫同類）
> 主題：償還 audit §5 主題 5「UI 一致性 / 設計 token 債」

---

## 1. 背景

平台 2.6/2.7 已開頭把硬編色改成 dark-aware（`bg-X-50 dark:bg-X-900/30 …`）與
CSS 變數 token（`--color-clay-*` / `--color-card-*` / `--color-text-*`），但**收尾未完**：
散落各檔仍有「只有淺色、無 `dark:` 變體」的硬編色，在 dark mode 呈現亮塊割裂；
另有少數裸 hex。本案做**全庫普查**，把所有破壞 dark mode 的色彩補齊，並把重複叢集收斂成共用常數。

color 系統現況（`app/globals.css`）：Tailwind v4 `@theme inline` + `:root`/`.dark` 兩套 CSS 變數。
`@custom-variant dark (&:where(.dark, .dark *))` → class-based dark mode（`.dark` 掛在 root）。

## 2. 目標 / 非目標

**目標**

- 全站每個 UI 表面在 dark mode 呈現連貫，**無**「淺色亮塊」割裂深色。
- 消滅所有破壞 dark mode 的硬編色與裸 hex。
- 重複色彩叢集收斂成共用 class 常數（單一真相、未來改一處生效）。
- **淺色模式外觀維持不變**（少數刻意統一除外，見 §6）。

**非目標**

- 不新增整套語意 CSS 變數 token 詞彙（被否決的策略③）。
- 不重新設計配色 / 品牌識別——只把現有色彩變 dark-safe + 去重。
- 不重構大檔非色彩邏輯（tool/[id] 1109 行、wizard 768 行的拆分＝audit #22，另案）。
- 不動 `firestore.rules`、無資料 migration。

## 3. 策略（已定案：策略②「正確性 + 抽共用常數」）

每處色彩歸到五類處理：

| 類  | 情況                                                                         | 處理                                                             |
| --- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| (a) | 已有 `dark:` 變體                                                            | **不碰**                                                         |
| (b) | 重複叢集（input / before-after / danger 鈕 / 灰 ghost 鈕）                   | 抽 `uiClasses.js` 共用常數                                       |
| (c) | 一次性淺色漏 `dark:`                                                         | 就地補 `dark:` 變體                                              |
| (d) | 裸 hex                                                                       | 換 Tailwind utility（值相同）+ `dark:`；品牌 accent 用既有 token |
| (e) | 本就 dark-safe（白字在飽和彩色鈕、`<option>`、`bg-X/opacity` over token 面） | **不碰**（spec 註明）                                            |

## 4. 架構：共用常數

### 4.1 新增 `src/lib/uiClasses.js`

純 `.js`、export 字串常數（比照 `src/lib/taxonomy.js` 慣例，client component 可 import）。
每個常數**只含色彩 + 邊框 + dark:**，版面（padding / radius / width / font）由各站點自行組合，
確保替換**不動淺色版面**。

```js
// src/lib/uiClasses.js
// 跨檔共用的 UI class 原子（含 dark: 變體）。只含色彩/邊框，版面各站點自接。
// 加新原子請維持「淺色逐字沿用現狀 + 補 dark:」原則，避免視覺迴歸。

// 痛點卡 Before/After（色彩部分；PainCard 與 admin 預覽共用）
export const BEFORE_BOX =
  "bg-red-50 dark:bg-red-950/40 text-red-900 dark:text-red-200 border border-red-100/60 dark:border-red-900/50";
export const AFTER_BOX =
  "bg-green-50 dark:bg-green-950/40 text-green-900 dark:text-green-200 border border-green-200/50 dark:border-green-900/50";
// PainCard 中段 ↓ 圓圈
export const STEP_ARROW =
  "bg-white dark:bg-gray-800 text-gray-400 dark:text-gray-500 border-2 border-green-100 dark:border-green-900/50";

// 灰底輸入框 chrome（色彩/邊框核心；padding/rounded/text-size/focus 各站接）
export const FORM_INPUT =
  "bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600";

// 紅色 danger 鈕（有框；對齊 admin:492 既有 dark 寫法）
export const DANGER_BTN =
  "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-900/40";
// 紅色 icon 鈕（無框、text-red-400）
export const DANGER_ICON_BTN =
  "bg-red-50 dark:bg-red-900/20 text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40";

// 灰 ghost / 次要鈕
export const MUTED_BTN =
  "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600";
// 灰 icon 鈕（text-gray-500）
export const MUTED_ICON_BTN =
  "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600";
```

> 命名 + 拆分原則：常數＝「語意角色」（before/after/danger/muted/input），不是「顏色」；
> 各站點 `` `${FORM_INPUT} w-full p-2 rounded-lg text-sm outline-none focus:border-[var(--color-clay-purple)]` `` 這樣組。

### 4.2 就地修（單一真相檔 / 一次性）

- **`src/lib/taxonomy.js` `getCTA()`**：terminated/dev/fallback 的 `cls` 漏 dark:（`bg-red-100 text-red-600` / `bg-gray-200 text-gray-500` / `bg-gray-300 text-gray-700`）→ 就地補 dark:（它已是 CTA 單一真相檔，不外搬）。
- **`app/tool/[id]/page.jsx`** 自有一套 type/media badge（`24/57/61/65/69`）與 CTA（`1044/1053`）漏 dark:，與 ToolCard 走 taxonomy 的版本平行 → 就地補 dark:（routing 進 `taxonomy.typeBadge()` 屬 audit #22 拆分範圍，本案只補色）。
- **admin row-action 鈕**（`318` 紫 / `324` 藍 / `330` 紅）、**sidebar hover**（`160-193` `hover:bg-gray-100`）、**狀態 pill**（`365`）→ 就地補 dark:（`330` 套 `DANGER_BTN`）。

### 4.3 AIPanel（#35，裸 hex）

關鍵：裸 hex 本就是 Tailwind palette 值（`#7E22CE`=purple-700、`#9333EA`=purple-600、
`#6366f1`=indigo-500、`#FAEDFF`≈purple-50），去 hex 在淺色**近乎零位移**，收益是補 dark:。

- panel bg `from-[#FAEDFF] to-white` → `from-purple-50 dark:from-purple-950/30 to-transparent`
- label `text-[#7E22CE]`（×5）→ `text-purple-700 dark:text-purple-300`（text 用 Tailwind 紫保對比；
  品牌 `--color-clay-purple` 是淺紫 accent、當文字對比不足，故 text 不直接套 token）
- 標題 `text-[#7E22CE]` 同上
- 漸層鈕 `from-[#9333EA] to-[#6366f1]`（白字、飽和、本 dark-safe）→ `from-purple-600 to-indigo-500`（純去 hex）
- `fieldCls`（`bg-white/60 border-purple-100 placeholder-purple-300 focus:border-purple-300 focus:ring-purple-200`）
  → 補 dark：`dark:bg-gray-800/60 dark:border-purple-900/50 dark:placeholder-purple-700 dark:focus:border-purple-600 dark:focus:ring-purple-900`
- toggle 鈕已用 `text-[var(--color-clay-purple)]` + `from-purple-100 to-blue-100 border-purple-200` → 補 `dark:from-purple-900/30 dark:to-blue-900/30 dark:border-purple-700`
- 載入遮罩 `bg-white/40`（139）→ `bg-white/40 dark:bg-gray-900/50`（dark 下避免白霧）

## 5. Inventory & change plan（普查工作集）

> 由 `app/globals.css` 外的 `{app,src}/**/*.{jsx,js}` grep 出。實作時除下列已知集，
> 另對每個 pattern 重 grep 一次掃尾，確保無遺漏（grep patterns 見 §8）。

### 5.1 Before/After 紅綠框（→ §4.1 常數）

- `src/components/PainCard.jsx:76,81,86`（before / ↓圈 / after）
- `app/admin/page.jsx:358,361`（痛點卡預覽 before/after；統一成 PainCard 看相，見 §6）

### 5.2 FORM_INPUT 去重（→ `FORM_INPUT`；**已 dark-safe，純 DRY**）

- `app/dashboard/page.jsx:232,247,273`
- `src/components/ReviewToolWizard.jsx`：329,336,344,351,364,380,391,424,438,447,455,483,673,687,701,716,731,739,747,771,779,787,802,811,819,834（約 26 處）
- `src/components/RequestCard.jsx:142,149,158`
- `src/components/RequestInbox.jsx:138`
- `src/components/FaqManager.jsx:94,101,109,124`

### 5.3 紅色 danger 鈕（→ `DANGER_BTN` / `DANGER_ICON_BTN`；漏 dark:）

- 有框：`app/admin/page.jsx:330`、`src/components/PasskeyManager.jsx:146`、`src/components/ReviewToolWizard.jsx:603`（`border-red-300` 微差，統一成 DANGER_BTN）
- icon：`app/tool/[id]/page.jsx:256,422`、`src/components/VersionEditor.jsx:97`

### 5.4 灰 ghost / icon 鈕（→ `MUTED_BTN` / `MUTED_ICON_BTN`；漏 dark:）

- `src/components/AiAssist.jsx:181`（`bg-gray-200`，統一成 MUTED_BTN）
- icon：`app/tool/[id]/page.jsx:241,249`、`src/components/VersionEditor.jsx:78,88`
- 已有 base dark 但 hover 漏：`src/components/ReviewToolWizard.jsx:244,263`（hover:bg-gray-200 補 dark:hover）

### 5.5 dashboard 類別 radio（#33；就地補 dark:）

- `app/dashboard/page.jsx:292`：`border-gray-200` → `border-gray-200 dark:border-gray-600`

### 5.6 taxonomy.js getCTA pills（就地補 dark:）

- `src/lib/taxonomy.js:118`（terminated 紅）、`126`（dev 灰）、`145,191`（fallback 灰）

### 5.7 tool/[id] 自有 badge / CTA（就地補 dark:）

- type badge：`24,69`（gray）、`57`（blue）、`61`（orange）、`65`（emerald）
- media badge：`34`（video，與 5.3 同色但是 badge 非鈕）
- 終止/停用 CTA：`1044`（gray）、`1053`（red）
- gray icon 鈕：見 5.4

### 5.8 admin 其他（就地補 dark:）

- row-action：`318`（purple）、`324`（blue）；`330` 走 DANGER_BTN
- sidebar hover：`160,169,178,187,193`（`hover:bg-gray-100` → 補 `dark:hover:bg-gray-700`）
- 狀態 pill：`365`（`text-gray-500 bg-gray-200/50` → 補 dark:）

### 5.9 其他零星（就地補 dark:）

- `src/components/RequestInbox.jsx:181`（`bg-red-100 text-red-600` 拒絕 pill）
- `src/components/ReviewToolWizard.jsx:578`（status swatch `bg-gray-100 … border-gray-300`）、`584`（`border-gray-200`）
- `src/components/FaqManager.jsx:144`（`border border-gray-300` 取消鈕）
- `app/hub/page.jsx:86`（`text-gray-400 hover:text-gray-700` 清除 X）
- `src/components/LoginModal.jsx:231,311`（`hover:border-gray-300` 漏 dark hover）

### 5.10 AIPanel 裸 hex（→ §4.3）

- `src/components/AIPanel.jsx:35,42,48,52,62,72,82,92,107,139`

### 5.11 明確不動（(e) dark-safe；spec 記錄理由）

- 飽和彩色實心鈕 + 白字：`taxonomy.js` getCTA/TYPE_ACTION 的 `bg-*-500 text-white`、`AiAssist:174` `bg-green-500 text-white`、embedded `bg-indigo-500` 等 → 兩模式皆可讀。
- `<code>` chip `bg-gray-100 dark:bg-gray-700`（MarkdownContent/changelog/docs/tool[id]:604）→ 已 dark-safe。
- `app/tool/[id]/page.jsx:232` `<option className="text-gray-800 bg-white">` → 原生 select option，dark 樣式瀏覽器掌控、無法可靠覆寫，留。
- `page.jsx:153,339` / `Navbar.jsx:31,79` 的 `[#1e1b4b]` → 已配 dark: 變體（`#1e1b4b`＝品牌 `--text-dark`，可選 tidy 成 `var(--color-text-dark)`，非必要、不影響 dark）。

## 6. 淺色保真 & 刻意可見變動

共用常數的淺色 class **逐字沿用現狀**；唯三刻意可見變動，PR 描述點名、請 Jason live 看：

1. **admin 痛點卡預覽** before/after（`358/361` `text-red-600`/`text-green-600`）統一成 PainCard 版（`text-red-900`/`text-green-900`）→ admin 內部頁、低風險。
2. **ReviewToolWizard:603** 拒絕鈕 `border-2 border-red-300` 統一成 `DANGER_BTN`（`border-red-200`）→ 邊框色階微調。
3. **AiAssist:181** `bg-gray-200` 統一成 `MUTED_BTN`（`bg-gray-100`）→ 底色微淺一階。

（AIPanel 去 hex 因 hex＝Tailwind 值，視為**無**可見變動。）

## 7. 測試 / 驗證

- `npm run build` 綠。
- `npm run lint`：基準 5 problems（ThemeProvider / tool[id] / dashboard 既有），**新碼零新增**。
- `npm run test:unit`：26 綠（本案不動 lib helper 邏輯，常數無 test，見下）。**不**為常數加 node:test（靜態字串、低迴歸風險，且 `.js` 常數檔不入 `test:unit` 的 `.mjs` glob；靠 lint+視覺+review）。
- 視覺驗證（dark mode 純 client CSS、**不需登入/Firestore**）：
  - **自驗公開頁**：`/`、`/hub`、`/faq`、`/changelog`、一個 live `/tool/[id]` → 本地 `npm run dev` + 瀏覽器自動化截 light/dark（best-effort；dev server 不穩則退人工 + review）。
  - **需 Jason live 驗（auth-gated，我截不到）**：admin（痛點預覽 / row-action / sidebar / 各 pill）、dashboard（radio / input）、各 modal、AIPanel 展開、wizard。

## 8. 實作掃尾 grep patterns

實作每類後重跑，確認無漏（人工判 (a)/(e) 例外）：

- `bg-(red|green|blue|purple|orange|amber|emerald|teal|indigo|fuchsia|pink|gray|yellow|violet)-(50|100|200|300)\b` → 檢查是否各配 `dark:`
- `border-gray-(200|300)\b`、`text-gray-(700|800|900)\b`
- `\[#[0-9A-Fa-f]{3,8}\]` → 應只剩 `[#1e1b4b]`（已 dark-paired）或全清

## 9. 交付 / 風險

- 單一 feature branch `feature-color-token-sweep` → PR → **獨立 reviewer subagent** → CI/Vercel 綠 → **等 Jason 喊才 merge**（比照 #16–22）。
- **無 migration、不動 rules** → 可乾淨 `git revert`。
- commit 分層：(1) `uiClasses.js` 新增；(2) before/after（PainCard+admin）；(3) FORM_INPUT 去重；(4) danger/muted 鈕；(5) taxonomy + tool[id] + admin 就地補；(6) AIPanel；(7) 零星。便於 reviewer 逐層核。
- 最大 churn＝5.2 FORM_INPUT（~36 處）；因原字串**已含 dark:**，替換為「抽相同核心」故行為等價，reviewer 逐處核 old→new 即可。

## 10. 完成定義（DoD）

- §5 工作集全處理；§8 三組 grep 重跑後僅剩 (a)/(e) 例外。
- build 綠、lint 無新增、test:unit 26 綠。
- 公開頁 light/dark 自驗截圖無割裂。
- PR 描述列出 §6 三項刻意變動 + 自驗範圍 + 待 Jason live 驗清單。
