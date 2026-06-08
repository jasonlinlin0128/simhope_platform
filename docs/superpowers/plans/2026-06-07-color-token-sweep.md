# 全站硬編色 dark-mode 普查 + 共用常數 — 實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把全站破壞 dark mode 的硬編色 / 裸 hex 補成 dark-safe，重複叢集抽共用常數；淺色外觀不變。

**Architecture:** 新增 `src/lib/uiClasses.js`（含 `dark:` 的語意 class 常數，比照 `taxonomy.js`）。各檔 import 常數取代重複叢集；單一真相檔（taxonomy）與一次性點就地補 `dark:`。**無 migration、不動 rules**。

**Tech Stack:** Next.js 16 + React 19 + Tailwind v4（class-based dark：`@custom-variant dark (&:where(.dark, .dark *))`）。import 別名 `@/* → src/*`。

**設計來源：** [spec](../specs/2026-06-07-color-token-sweep-design.md)（§5 工作集、§6 刻意變動、§8 掃尾 grep）。

**全域驗證慣例（每 Task 結尾）：**

- `npm run lint` → 維持基準 5 problems（ThemeProvider/tool[id]/dashboard 既有），**不得新增**。
- 改完該 Task 對應 §8 pattern 重 grep，確認該類無漏。
- commit（Conventional + 結尾 `Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>`）。
- `npm run build` 與視覺驗證集中在 Task 7（避免每 task 慢 build）。

**通用 dark 變體規則：**

- pastel `bg-X-50/100` 漏 dark → 加 `dark:bg-X-900/30`（或 `/20`，比照鄰近既有）+ 文字 `text-X-700→dark:text-X-300`、`text-X-600→dark:text-X-400`、`text-X-900→dark:text-X-200`、邊框 `border-X-100/200→dark:border-X-800/900`。
- 漸層 pastel 磚 `from-X-100 to-X-200` → 加 `dark:from-X-900/40 dark:to-X-800/30`。

---

## Task 1: 新增 `src/lib/uiClasses.js`

**Files:**

- Create: `src/lib/uiClasses.js`

- [ ] **Step 1: 建立常數檔**

建立 `src/lib/uiClasses.js`，內容如下（7 個常數；只含色彩+邊框+dark:，版面各站接）：

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

- [ ] **Step 2: lint**

Run: `npm run lint`
Expected: 仍 5 problems（無新增）；`uiClasses.js` 無 error。

- [ ] **Step 3: commit**

```bash
git add src/lib/uiClasses.js
git commit -m "feat(ui): 新增共用 dark-safe class 常數 (uiClasses)

before/after 框、danger/muted 鈕的語意 class 原子，含 dark: 變體。
供後續各檔取代重複叢集；本 commit 僅新增、尚未接線。

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

## Task 2: Before/After 紅綠框（PainCard + admin 預覽）

**Files:**

- Modify: `src/components/PainCard.jsx`（76,81,86）
- Modify: `app/admin/page.jsx`（358,361）

- [ ] **Step 1: PainCard import + 套常數**

在 `src/components/PainCard.jsx` 頂部（`import Link from "next/link";` 下一行）加：

```js
import { BEFORE_BOX, AFTER_BOX, STEP_ARROW } from "@/lib/uiClasses";
```

before 框（76）— 把 class 字串改成 template literal、色彩段換 `BEFORE_BOX`：

- old: `className="bg-red-50 text-red-900 border border-red-100/60 rounded-2xl p-3.5 pr-4 text-[0.95rem] font-bold shadow-sm leading-snug"`
- new: ``className={`${BEFORE_BOX} rounded-2xl p-3.5 pr-4 text-[0.95rem] font-bold shadow-sm leading-snug`}``

↓ 圓圈（81）：

- old: `className="w-8 h-8 rounded-full bg-white flex items-center justify-center text-gray-400 font-black shadow-md border-2 border-green-100"`
- new: ``className={`w-8 h-8 rounded-full ${STEP_ARROW} flex items-center justify-center font-black shadow-md`}``

after 框（86）：

- old: `className="bg-green-50 text-green-900 border border-green-200/50 rounded-2xl p-3.5 pr-4 text-[0.95rem] font-bold shadow-sm leading-snug flex-1"`
- new: ``className={`${AFTER_BOX} rounded-2xl p-3.5 pr-4 text-[0.95rem] font-bold shadow-sm leading-snug flex-1`}``

- [ ] **Step 2: admin import + 套常數**

在 `app/admin/page.jsx` 既有 import 區加：

```js
import { BEFORE_BOX, AFTER_BOX } from "@/lib/uiClasses";
```

痛點預覽 before（358）：

- old: `className="text-sm font-bold text-red-600 bg-red-50 p-2 rounded relative border border-red-100"`
- new: ``className={`${BEFORE_BOX} text-sm font-bold p-2 rounded relative`}``

痛點預覽 after（361）：

- old: `className="text-sm font-bold text-green-600 bg-green-50 p-2 rounded border border-green-100"`
- new: ``className={`${AFTER_BOX} text-sm font-bold p-2 rounded`}``

> 注意：admin 文字 red-600→red-900、邊框 red-100→red-100/60（spec §6 刻意變動 #1，已同意）。

- [ ] **Step 3: lint + grep**

Run: `npm run lint` → 無新增。
Run grep `bg-(red|green)-50` on `app/admin/page.jsx`,`src/components/PainCard.jsx` → 應只剩有 dark: 的（429/434/492 admin 既有）。

- [ ] **Step 4: commit**

```bash
git add src/components/PainCard.jsx app/admin/page.jsx
git commit -m "fix(ui): 痛點卡 Before/After 框補 dark mode (audit #17)

PainCard 與 admin 預覽的紅綠框改用共用 BEFORE_BOX/AFTER_BOX/STEP_ARROW
常數，補上 dark: 變體。admin 預覽文字色階統一成 PainCard 版。

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

## Task 3: danger / muted 按鈕

**Files:**

- Modify: `app/admin/page.jsx`（330）
- Modify: `src/components/PasskeyManager.jsx`（146）
- Modify: `src/components/ReviewToolWizard.jsx`（603,244,263）
- Modify: `app/tool/[id]/page.jsx`（256,422,241,249）
- Modify: `src/components/VersionEditor.jsx`（97,78,88）
- Modify: `src/components/AiAssist.jsx`（181）

> 每檔加對應 import：`import { DANGER_BTN, DANGER_ICON_BTN, MUTED_BTN, MUTED_ICON_BTN } from "@/lib/uiClasses";`（只 import 該檔用到的）。

- [ ] **Step 1: DANGER_BTN（有框紅鈕）**

admin:330（import `DANGER_BTN`；admin Task 2 已有 import 行，補上 DANGER_BTN）：

- old: `className="px-3 py-1.5 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg font-bold text-xs border border-red-200"`
- new: ``className={`${DANGER_BTN} px-3 py-1.5 rounded-lg font-bold text-xs`}``

PasskeyManager:146（import `DANGER_BTN`）：

- old: `className="px-3 py-1.5 rounded-lg bg-red-50 text-red-600 font-bold text-xs border border-red-200 hover:bg-red-100 disabled:opacity-50 whitespace-nowrap"`
- new: ``className={`${DANGER_BTN} px-3 py-1.5 rounded-lg font-bold text-xs disabled:opacity-50 whitespace-nowrap`}``

ReviewToolWizard:603（import `DANGER_BTN`；spec §6 刻意變動 #2：border-red-300→DANGER_BTN 的 border-red-200）：

- old: `className="px-5 py-2.5 rounded-xl bg-red-50 text-red-600 font-bold border-2 border-red-300 disabled:opacity-50"`
- new: ``className={`${DANGER_BTN} px-5 py-2.5 rounded-xl font-bold disabled:opacity-50`}``

- [ ] **Step 2: DANGER_ICON_BTN（無框紅 icon 鈕）**

tool[id]:256（import `DANGER_ICON_BTN`）：

- old: `className="w-7 h-7 rounded-lg bg-red-50 text-red-400 hover:bg-red-100 text-sm transition-all"`
- new: ``className={`${DANGER_ICON_BTN} w-7 h-7 rounded-lg text-sm transition-all`}``

tool[id]:422：

- old: `className="w-9 rounded-lg bg-red-50 text-red-400 hover:bg-red-100 text-sm"`
- new: ``className={`${DANGER_ICON_BTN} w-9 rounded-lg text-sm`}``

VersionEditor:97（import `DANGER_ICON_BTN`）：

- old: `className="w-7 h-7 rounded-lg bg-red-50 text-red-400 hover:bg-red-100 text-sm"`
- new: ``className={`${DANGER_ICON_BTN} w-7 h-7 rounded-lg text-sm`}``

- [ ] **Step 3: MUTED_BTN / MUTED_ICON_BTN（灰鈕）**

AiAssist:181（import `MUTED_BTN`；spec §6 刻意變動 #3：bg-gray-200→MUTED_BTN 的 bg-gray-100）：

- old: `className="text-xs font-bold rounded-full px-3 py-1.5 bg-gray-200 text-gray-700 hover:bg-gray-300"`
- new: ``className={`${MUTED_BTN} text-xs font-bold rounded-full px-3 py-1.5`}``

tool[id]:241,249（import `MUTED_ICON_BTN`；兩處同字串，逐一改）：

- old: `className="w-7 h-7 rounded-lg bg-gray-100 text-gray-500 hover:bg-gray-200 disabled:opacity-25 text-sm transition-all"`
- new: ``className={`${MUTED_ICON_BTN} w-7 h-7 rounded-lg disabled:opacity-25 text-sm transition-all`}``

VersionEditor:78,88（import `MUTED_ICON_BTN`；兩處同字串）：

- old: `className="w-7 h-7 rounded-lg bg-gray-100 text-gray-500 hover:bg-gray-200 disabled:opacity-25 text-sm"`
- new: ``className={`${MUTED_ICON_BTN} w-7 h-7 rounded-lg disabled:opacity-25 text-sm`}``

- [ ] **Step 4: ReviewToolWizard hover 補 dark（244,263；base 已有 dark，只缺 hover）**

244：

- old: `hover:bg-gray-200"` （在 `className="px-4 py-2 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-bold text-sm hover:bg-gray-200"`）
- new: `hover:bg-gray-200 dark:hover:bg-gray-600"`

263：

- old: `: "bg-gray-100 dark:bg-gray-700 text-gray-500 hover:bg-gray-200"`
- new: `: "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600"`

> 244/263 不抽常數（嵌在三元/長 class 中，就地補即可；改 `hover:bg-gray-200` 時注意該檔多處同字串，逐行定位）。

- [ ] **Step 5: lint + grep**

Run: `npm run lint` → 無新增。
Run grep `bg-red-50|bg-gray-100 text-gray-500` 於上述檔 → 紅/灰 icon 鈕應已套常數或補 dark。

- [ ] **Step 6: commit**

```bash
git add app/admin/page.jsx src/components/PasskeyManager.jsx src/components/ReviewToolWizard.jsx app/tool/\[id\]/page.jsx src/components/VersionEditor.jsx src/components/AiAssist.jsx
git commit -m "fix(ui): danger/muted 按鈕補 dark mode

刪除/拒絕紅鈕與灰次要鈕改用共用 DANGER_BTN/DANGER_ICON_BTN/
MUTED_BTN/MUTED_ICON_BTN 常數；wizard 灰鈕 hover 補 dark。

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

## Task 4: taxonomy getCTA + tool[id] 自有 badge/CTA + admin 其他 + dashboard radio（就地補 dark:）

**Files:**

- Modify: `src/lib/taxonomy.js`（118,126,145,191）
- Modify: `app/tool/[id]/page.jsx`（24,34,57,61,65,69,1044,1053）
- Modify: `app/admin/page.jsx`（318,324,365,160-193）
- Modify: `app/dashboard/page.jsx`（292）

- [ ] **Step 1: taxonomy.js getCTA pills**

118（terminated 紅）：

- old: `cls: "bg-red-100 text-red-600 cursor-not-allowed",`
- new: `cls: "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 cursor-not-allowed",`

126（dev 灰）：

- old: `cls: "bg-gray-200 text-gray-500 hover:bg-gray-300",`
- new: `cls: "bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-300 dark:hover:bg-gray-600",`

145 與 191（fallback 灰，兩處同字串，逐一改）：

- old: `cls: "bg-gray-300 text-gray-700 hover:bg-gray-400",`
- new: `cls: "bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-400 dark:hover:bg-gray-500",`

- [ ] **Step 2: tool[id] 自有 type/media badge**

24（fallback gray badge）與 69（同字串，逐一改）：

- old: `"bg-gray-100 text-gray-600 border-gray-200"`
- new: `"bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600"`

34（video media badge）：

- old: `badge: "bg-red-50 text-red-600 border-red-200" }`
- new: `badge: "bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 border-red-200 dark:border-red-700" }`

57（blue）：

- old: `cls: "bg-blue-100 text-blue-700 border-blue-200"`
- new: `cls: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-700"`

61（orange）：

- old: `cls: "bg-orange-100 text-orange-700 border-orange-200"`
- new: `cls: "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-700"`

65（emerald）：

- old: `cls: "bg-emerald-100 text-emerald-700 border-emerald-200"`
- new: `cls: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-700"`

- [ ] **Step 3: tool[id] 終止/停用 CTA（1044,1053）**

1044（gray disabled）：

- old: `className="w-full text-center px-6 py-4 rounded-xl font-extrabold bg-gray-200 text-gray-500 cursor-not-allowed"`
- new: `className="w-full text-center px-6 py-4 rounded-xl font-extrabold bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed"`

1053（red terminated）：

- old: `className="w-full text-center px-6 py-4 rounded-xl font-extrabold bg-red-100 text-red-600 cursor-not-allowed"`
- new: `className="w-full text-center px-6 py-4 rounded-xl font-extrabold bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 cursor-not-allowed"`

- [ ] **Step 4: admin row-action（318,324）+ 狀態 pill（365）+ sidebar hover（160-193）**

318（purple）：

- old: `className="px-3 py-1.5 bg-purple-50 text-purple-600 hover:bg-purple-100 rounded-lg font-bold text-xs border border-purple-200"`
- new: `className="px-3 py-1.5 bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 hover:bg-purple-100 dark:hover:bg-purple-900/40 rounded-lg font-bold text-xs border border-purple-200 dark:border-purple-800"`

324（blue）：

- old: `className="px-3 py-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg font-bold text-xs border border-blue-200"`
- new: `className="px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40 rounded-lg font-bold text-xs border border-blue-200 dark:border-blue-800"`

365（狀態 pill）：

- old: `className="text-xs font-bold text-gray-500 bg-gray-200/50 px-2 py-1 rounded"`
- new: `className="text-xs font-bold text-gray-500 dark:text-gray-400 bg-gray-200/50 dark:bg-gray-700/50 px-2 py-1 rounded"`

sidebar hover（160,169,178,187,193 — 5 處同字串，用 replace_all）：

- old: `hover:bg-gray-100"`
- new: `hover:bg-gray-100 dark:hover:bg-gray-700"`

  > 確認 admin 內 `hover:bg-gray-100"` 只出現在這 5 個 sidebar 鈕（318 是 hover:bg-purple-100，不衝突）。

- [ ] **Step 5: dashboard 類別 radio（292，audit #33）**

- old: `: "border-gray-200 hover:border-[var(--color-clay-purple)]/40"`
- new: `: "border-gray-200 dark:border-gray-600 hover:border-[var(--color-clay-purple)]/40"`

- [ ] **Step 6: lint + grep**

Run: `npm run lint` → 無新增。
Run grep `bg-(red|gray|blue|orange|emerald|purple)-(50|100|200|300)\b` 於 taxonomy.js / tool[id] / admin → 確認各配 dark:（飽和 500 鈕除外）。

- [ ] **Step 7: commit**

```bash
git add src/lib/taxonomy.js app/tool/\[id\]/page.jsx app/admin/page.jsx app/dashboard/page.jsx
git commit -m "fix(ui): getCTA/詳情頁 badge/admin/dashboard 補 dark mode (audit #33)

taxonomy getCTA 的 terminated/dev/fallback pill、tool[id] 自有 type/media
badge 與終止 CTA、admin row-action/sidebar/狀態 pill、dashboard 類別 radio
邊框，逐一補 dark: 變體。

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

## Task 5: AIPanel 裸 hex → Tailwind + dark:（audit #35）

**Files:**

- Modify: `src/components/AIPanel.jsx`（35,42,48,52,62,72,82,92,107,139）

- [ ] **Step 1: fieldCls（35）補 dark:**

- old:

```js
const fieldCls =
  "w-full bg-white/60 p-3 rounded-xl border border-purple-100 placeholder-purple-300 text-sm focus:border-purple-300 focus:ring-2 focus:ring-purple-200 outline-none transition-all resize-none";
```

- new:

```js
const fieldCls =
  "w-full bg-white/60 dark:bg-gray-800/60 p-3 rounded-xl border border-purple-100 dark:border-purple-900/50 placeholder-purple-300 dark:placeholder-purple-700 text-sm focus:border-purple-300 dark:focus:border-purple-600 focus:ring-2 focus:ring-purple-200 dark:focus:ring-purple-900 outline-none transition-all resize-none";
```

- [ ] **Step 2: toggle 鈕（42）補 dark:**

- old: `className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-gradient-to-r from-purple-100 to-blue-100 text-[var(--color-clay-purple)] font-black text-sm hover:shadow-md transition-all border border-purple-200"`
- new: `className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-gradient-to-r from-purple-100 to-blue-100 dark:from-purple-900/30 dark:to-blue-900/30 text-[var(--color-clay-purple)] font-black text-sm hover:shadow-md transition-all border border-purple-200 dark:border-purple-700"`

- [ ] **Step 3: panel bg（48）去 hex + dark:**

- old: `className="mt-3 p-5 rounded-2xl bg-gradient-to-br from-[#FAEDFF] to-white border-2 border-purple-200/60 shadow-inner relative overflow-hidden animate-fade-in-down"`
- new: `className="mt-3 p-5 rounded-2xl bg-gradient-to-br from-purple-50 to-white dark:from-purple-950/30 dark:to-transparent border-2 border-purple-200/60 dark:border-purple-800/50 shadow-inner relative overflow-hidden animate-fade-in-down"`

- [ ] **Step 4: 標題 + 4 個 label（52,62,72,82,92）去 hex**

5 處皆 `text-[#7E22CE]` → `text-purple-700 dark:text-purple-300`：

- 52: `className="font-extrabold text-[#7E22CE] text-sm"` → `className="font-extrabold text-purple-700 dark:text-purple-300 text-sm"`
- 62: `className="text-xs font-bold text-[#7E22CE]"` → `className="text-xs font-bold text-purple-700 dark:text-purple-300"`
- 72,82,92: `className="text-xs font-bold text-[#7E22CE] mt-1"` → `className="text-xs font-bold text-purple-700 dark:text-purple-300 mt-1"`（3 處同字串，逐一改）
- 副標 55: `className="text-xs text-purple-600/80 font-bold"` → `className="text-xs text-purple-600/80 dark:text-purple-400/80 font-bold"`

- [ ] **Step 5: 漸層鈕（107）去 hex**

- old: `className="mt-3 w-full py-3 rounded-xl bg-gradient-to-r from-[#9333EA] to-[#6366f1] text-white font-extrabold text-sm shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all relative overflow-hidden"`
- new: `className="mt-3 w-full py-3 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-500 text-white font-extrabold text-sm shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all relative overflow-hidden"`

- [ ] **Step 6: 載入遮罩（139）補 dark:**

- old: `className="absolute inset-0 bg-white/40 backdrop-blur-[2px] z-10 flex items-center justify-center"`
- new: `className="absolute inset-0 bg-white/40 dark:bg-gray-900/50 backdrop-blur-[2px] z-10 flex items-center justify-center"`

- [ ] **Step 7: lint + grep**

Run: `npm run lint` → 無新增。
Run grep `\[#` 於 `src/components/AIPanel.jsx` → **0 命中**（hex 全清）。

- [ ] **Step 8: commit**

```bash
git add src/components/AIPanel.jsx
git commit -m "fix(ui): AIPanel 裸 hex 改 Tailwind + 補 dark mode (audit #35)

#FAEDFF/#7E22CE/#9333EA/#6366f1 換成等值 Tailwind purple/indigo
utility（淺色零位移）並補 dark: 變體；輸入框/遮罩 dark-safe。

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

## Task 6: 漸層 pastel icon 磚 / 面板（spec §5.12）

**Files:**

- Modify: `src/components/ToolCard.jsx`（icon 漸層 map，~6-11）
- Modify: `src/components/ReviewToolWizard.jsx`（COLOR_OPTIONS，~20-45）
- Modify: `app/admin/page.jsx`（247,289）
- Modify: `app/tool/[id]/page.jsx`（973,638）

- [ ] **Step 1: ToolCard icon 漸層 map（c1–c6）**

每行 `from-X-100 to-X-200 text-X-600` 後加 `dark:from-X-900/40 dark:to-X-800/30` 與 `dark:text-X-300`：

- c1 old: `"bg-gradient-to-br from-blue-100 to-blue-200 text-blue-600"` → new: `"bg-gradient-to-br from-blue-100 to-blue-200 dark:from-blue-900/40 dark:to-blue-800/30 text-blue-600 dark:text-blue-300"`
- c2 red：`...from-red-100 to-red-200 dark:from-red-900/40 dark:to-red-800/30 text-red-600 dark:text-red-300`
- c3 purple：`...from-purple-100 to-purple-200 dark:from-purple-900/40 dark:to-purple-800/30 text-purple-600 dark:text-purple-300`
- c4 amber：`...from-amber-100 to-amber-200 dark:from-amber-900/40 dark:to-amber-800/30 text-amber-600 dark:text-amber-300`
- c5 emerald：`...from-emerald-100 to-emerald-200 dark:from-emerald-900/40 dark:to-emerald-800/30 text-emerald-600 dark:text-emerald-300`
- c6 pink：`...from-pink-100 to-pink-200 dark:from-pink-900/40 dark:to-pink-800/30 text-pink-600 dark:text-pink-300`

- [ ] **Step 2: ReviewToolWizard COLOR_OPTIONS（無 text-X，只漸層）**

每個 `cls: "bg-gradient-to-br from-X-100 to-X-200"` 後加 `dark:from-X-900/40 dark:to-X-800/30`：

- blue: `cls: "bg-gradient-to-br from-blue-100 to-blue-200 dark:from-blue-900/40 dark:to-blue-800/30"`
- red / purple / amber / emerald / pink 同理（對應色名）。

- [ ] **Step 3: admin icon 磚（247,289）**

247：

- old: `className="w-12 h-12 rounded-xl bg-gradient-to-br from-yellow-100 to-yellow-200 flex items-center justify-center text-2xl"`
- new: `className="w-12 h-12 rounded-xl bg-gradient-to-br from-yellow-100 to-yellow-200 dark:from-yellow-900/40 dark:to-yellow-800/30 flex items-center justify-center text-2xl"`

289：

- old: `className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-100 to-blue-200 flex items-center justify-center text-xl"`
- new: `className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-100 to-blue-200 dark:from-blue-900/40 dark:to-blue-800/30 flex items-center justify-center text-xl"`

- [ ] **Step 4: tool[id] 大 icon 磚（973）+ emerald 面板（638）**

973：

- old: `className="w-20 h-20 mx-auto rounded-[24px] bg-gradient-to-br from-blue-100 to-blue-200 flex items-center justify-center text-4xl shadow-inner mb-4"`
- new: `className="w-20 h-20 mx-auto rounded-[24px] bg-gradient-to-br from-blue-100 to-blue-200 dark:from-blue-900/40 dark:to-blue-800/30 flex items-center justify-center text-4xl shadow-inner mb-4"`

638（emerald 面板，比照 :600 fuchsia 既有寫法）：

- old: `className="bg-gradient-to-br from-emerald-50 to-white border-2 border-emerald-200 rounded-2xl p-6"`
- new: `className="bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-900/10 dark:to-transparent border-2 border-emerald-200 dark:border-emerald-800/40 rounded-2xl p-6"`

- [ ] **Step 5: lint + grep**

Run: `npm run lint` → 無新增。
Run grep `(from|via|to)-\w+-(50|100|200|300)\b` 全庫 → 剩餘應全配 dark:，或屬 §5.11 (e) 飽和 400/500 例外。

- [ ] **Step 6: commit**

```bash
git add src/components/ToolCard.jsx src/components/ReviewToolWizard.jsx app/admin/page.jsx app/tool/\[id\]/page.jsx
git commit -m "fix(ui): 漸層 pastel icon 磚補 dark mode

首頁卡 icon 底色磚 (ToolCard)、wizard 色票、admin/詳情頁 icon 磚與
emerald 面板的 from-X-100 to-X-200 漸層補 dark: 加深變體（淺色不變）。

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

## Task 7: 零星收尾 + 全庫掃尾 + build + 視覺驗證

**Files:**

- Modify: `src/components/RequestInbox.jsx`（181）
- Modify: `src/components/ReviewToolWizard.jsx`（578,584）
- Modify: `src/components/FaqManager.jsx`（144）
- Modify: `app/hub/page.jsx`（86）
- Modify: `src/components/LoginModal.jsx`（231,311）

- [ ] **Step 1: 零星就地補 dark:**

RequestInbox:181（拒絕 pill）：

- old: `className="px-3 py-1 rounded-full bg-red-100 text-red-600 text-xs font-bold"`
- new: `className="px-3 py-1 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-xs font-bold"`

ReviewToolWizard:578（status swatch terminated）：

- old: `cls: "bg-gray-100 text-gray-700 border-gray-300"`
- new: `cls: "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600"`

ReviewToolWizard:584（未選 status 鈕）：

- old: `: "bg-white dark:bg-gray-800 text-gray-400 border-gray-200"}`
- new: `: "bg-white dark:bg-gray-800 text-gray-400 border-gray-200 dark:border-gray-600"}`

FaqManager:144（取消鈕）：

- old: `className="px-4 py-2 rounded-full border border-gray-300 font-bold text-sm"`
- new: `className="px-4 py-2 rounded-full border border-gray-300 dark:border-gray-600 font-bold text-sm"`

hub:86（清除 X）：

- old: `className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700"`
- new: `className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"`

LoginModal:231,311（hover:border-gray-300 漏 dark；兩處同字串，逐一）：

- old: `hover:border-gray-300 `
- new: `hover:border-gray-300 dark:hover:border-gray-500 `

  > 注意保留原字串前後脈絡（231 結尾 `transition-all disabled:opacity-60...`、311 結尾 `disabled:opacity-60...`），只在 `hover:border-gray-300` 後插 dark: 變體。

- [ ] **Step 2: 全庫掃尾 grep（§8）**

依序 grep（人工判 (a)/(e) 例外）：

```
\b(bg|text|border)-(red|green|blue|purple|orange|amber|emerald|teal|indigo|fuchsia|pink|gray|yellow|violet)-(50|100|200|300)\b
\b(from|via|to)-\w+-(50|100|200|300)\b
\bring-\w+-(100|200|300|400|500)\b
\bplaceholder-\w+-(300|400|500)\b
\[#[0-9A-Fa-f]{3,8}\]
```

預期殘留：全配 dark: 的、§5.11 (e) 例外（飽和 500 白字鈕、`<code>` chip、modal `bg-black/40`、`<option>`、`[#1e1b4b]`）、§5.2 deferred 的 input。逐一確認無「漏 dark 的 pastel」殘留。

- [ ] **Step 3: build + unit**

Run: `npm run build` → 綠。
Run: `npm run test:unit` → 26 綠（未動 lib helper）。

- [ ] **Step 4: 公開頁視覺自驗（light/dark）**

啟 `npm run dev`（背景），用瀏覽器自動化（Claude_in_Chrome / playwright）對下列頁面各截 light + dark（切換靠 Navbar 主題鈕或 `document.documentElement.classList.toggle('dark')`）：

- `/`（首頁工具卡 icon 磚 / 痛點卡 Before/After / 類型 badge / RequestButton）
- `/hub`（卡片 / 空狀態 / 搜尋清除 X）
- `/faq`（若空則略；FaqManager 屬 admin）
- `/changelog`
- 一個 live `/tool/[id]`（type badge / icon 磚 / emerald 面板 / danger·muted icon 鈕）

判讀：dark 下無「亮 pastel 塊」割裂；淺色與 main(`e0b2c28`) 比對無位移。dev server 不穩則退人工 + 仰賴 review。

- [ ] **Step 5: commit**

```bash
git add src/components/RequestInbox.jsx src/components/ReviewToolWizard.jsx src/components/FaqManager.jsx app/hub/page.jsx src/components/LoginModal.jsx
git commit -m "fix(ui): 零星硬編色補 dark mode + 完成全庫普查掃尾

拒絕 pill / status swatch / 取消鈕 / 清除 X / modal hover 邊框補 dark:。
§8 三組 grep 重跑僅剩 (a) 已 dark / (e) 例外 / (§5.2 deferred input)。

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

## 完成後

- 推分支、開 PR（body 列：spec 連結、§6 三項刻意變動、自驗截圖範圍、待 Jason live 驗清單＝admin/dashboard/modal/wizard/AIPanel auth-gated 頁）。
- **獨立 reviewer subagent** 審 → CI/Vercel 綠 → **等 Jason 喊才 merge**。
- 待 Jason live 驗（auth-gated，我截不到）：admin 痛點預覽/row-action/sidebar/pill、dashboard radio/input、各 modal、AIPanel 展開、wizard 色票/status 鈕。

---

## Self-Review（plan vs spec）

- **Spec coverage**：§5.1→T2、§5.3→T3、§5.4→T3、§5.5→T4、§5.6→T4、§5.7→T4、§5.8→T4、§5.9→T7、§5.10→T5、§5.12→T6、uiClasses(§4.1)→T1。§5.2(FORM_INPUT) 已 deferred（spec §2/§5.2 註明），不列 task ✓。§5.11(e) 不動，掃尾 grep 確認 ✓。
- **Placeholder scan**：每處皆給 exact old→new className，無 TBD/「類似上面」。✓
- **Type/命名一致**：常數名 BEFORE_BOX/AFTER_BOX/STEP_ARROW/DANGER_BTN/DANGER_ICON_BTN/MUTED_BTN/MUTED_ICON_BTN 全程一致、與 T1 定義相符 ✓。import 路徑 `@/lib/uiClasses` 一致（jsconfig `@/*→src/*`）✓。
