# SimHope Hub Phase 1 (MVP) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把現有單頁平台擴成 twinkle-hub 風格的多頁式資源中心 MVP — 5 大類別（platform/tool/project/mcp/skill）、統一目錄 `/hub`、共用 chrome，並把散落的 type 元資料收斂到單一 `taxonomy.js`。

**Architecture:** 沿用現有 Next.js 16 App Router + Firebase。新增 `src/lib/taxonomy.js` 作為 category/type 的單一真相來源，既有 5 個面（ToolCard / 詳情頁 / dashboard / wizard / 首頁）改 import。資料層沿用單一 `tools` collection、新增 `category` 欄位。新增 `/hub` 目錄頁 + Footer/Banner chrome；首頁重構為 hub landing。

**Tech Stack:** Next.js 16.2 / React 19 / Firebase 12 (Firestore + Storage) / Tailwind 4 / Fuse.js 7 / react-markdown。

**驗證取向（重要）：** 本專案**無測試框架**（package.json 只有 dev/build/lint/start），既有慣例＝build + lint + 手動視覺驗證。本 plan 不引入 Jest/RTL（屬另一範圍）。每個 task 的 gate：

1. `npm run build` 通過（type/import/語法錯誤會在此擋下）；
2. `npm run dev` 後在瀏覽器**實測指定畫面**（每個 task 有明確檢查點）；
3. 純邏輯（taxonomy helper、migration 對應）附獨立 `node` 斷言檔，可直接 `node` 跑、無需框架。

**全域鐵律（AGENTS.md）：** 改資料結構的 migration（Task 10 的 `--apply`）**必須等依賴新結構的 code 先 merge + deploy 成功**才跑，跑完**連 live 站驗證**首頁工具數不掉。本 plan 只「建立」migration script 並 dry-run；`--apply` 是部署後的人工步驟。

**Branch：** 開 `feature-hub-phase1`（依 CLAUDE.md：不在 main 直接 commit 實作）。

---

## 檔案結構（Phase 1 動到的檔案）

**新增：**

- `src/lib/taxonomy.js` — category/type 元資料 + helper（getCTA / getTabsForType / typeDataFields / categoryCounts）
- `src/components/Footer.jsx` — 全站 footer
- `src/components/Banner.jsx` — 維護/更新公告條（可隱藏）
- `src/components/CategoryEntryCard.jsx` — 首頁 5 類別入口卡
- `src/components/MetricsBand.jsx` — 首頁數字帶
- `src/components/CategoryTabs.jsx` — /hub 類別 tab
- `app/hub/page.jsx` — 統一目錄頁
- `scripts/migrate-category.mjs` — 補 category（idempotent + 備份）
- `scripts/__verify-taxonomy.mjs` — taxonomy 純函式斷言（暫時，跑完可留可刪）

**修改：**

- `src/components/ToolCard.jsx` — 改 import taxonomy（TYPE_BADGES/getCTA）
- `app/tool/[id]/page.jsx` — 改 import taxonomy + 加 skill tab + 修 descHtml bug
- `app/dashboard/page.jsx` — 上傳表單主選改 category
- `src/components/ReviewToolWizard.jsx` — 加 category 下拉 + skill typeData 分支
- `src/lib/db.js` — 加 `getCatalog({category})`
- `src/components/Navbar.jsx` — 加「資源中心」連結
- `app/layout.js` — 掛 Footer（+ 可選 Banner）
- `app/page.jsx` — 重構為 hub landing（hero + 類別入口 + metrics；保留痛點/回饋/CTA）

**依賴順序：** Task 1（taxonomy）→ 2/3/4/5（各面 refactor，可平行但建議逐一）→ 6（db）→ 7（chrome）→ 8（/hub）→ 9（首頁）→ 10（migration）。

---

## Task 1: taxonomy.js 單一真相來源

**Files:**

- Create: `src/lib/taxonomy.js`
- Create: `scripts/__verify-taxonomy.mjs`

**重點：** badge 樣式 / CTA 文案要**逐字沿用** `ToolCard.jsx` 現有的 `TYPE_BADGES` 與 `getCTA`，確保 refactor 後零視覺差異。只多加 `skill` 一種 type。

- [ ] **Step 1: 建立 `src/lib/taxonomy.js`**

```js
// src/lib/taxonomy.js
// 單一真相來源：category（給使用者看的目錄分類）+ type（技術交付格式）的顯示與行為。
// 加新 type/category 只改這裡。各 UI（ToolCard / 詳情頁 / dashboard / wizard / hub）一律 import。

// ─── 5 大類別（目錄分類；決定在 /hub 哪個 tab） ───
export const CATEGORIES = {
  platform: {
    key: "platform",
    label: "平臺",
    emoji: "🏢",
    desc: "大型多功能系統 / 應用",
    defaultType: "webapp",
  },
  tool: {
    key: "tool",
    label: "工具",
    emoji: "🧰",
    desc: "單點 AI 小工具，即開即用",
    defaultType: "webapp",
  },
  project: {
    key: "project",
    label: "專案",
    emoji: "📁",
    desc: "單一時限性的案子，展示進度與成果",
    defaultType: "webapp",
  },
  mcp: {
    key: "mcp",
    label: "MCP",
    emoji: "🔌",
    desc: "給 AI agent 串接的連接器",
    defaultType: "mcp",
  },
  skill: {
    key: "skill",
    label: "Skill",
    emoji: "🧠",
    desc: "Agent skill，下載裝到 ~/.claude/skills/",
    defaultType: "skill",
  },
};
export const CATEGORY_ORDER = ["platform", "tool", "project", "mcp", "skill"];

// ─── 7 種交付格式（決定 badge / CTA / 安裝 tab / typeData 欄位） ───
// badgeCls / label 逐字沿用原 ToolCard.TYPE_BADGES，避免視覺迴歸。
export const TYPES = {
  webapp: {
    key: "webapp",
    label: "🌐 網頁應用",
    badgeCls:
      "bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-700",
  },
  download: {
    key: "download",
    label: "⬇️ 軟體下載",
    badgeCls:
      "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-700",
  },
  doc: {
    key: "doc",
    label: "📄 文件 / 表單",
    badgeCls:
      "bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-700",
  },
  mcp: {
    key: "mcp",
    label: "🔌 AI 連接器",
    badgeCls:
      "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-700",
  },
  api: {
    key: "api",
    label: "🧩 API / SDK",
    badgeCls:
      "bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-700",
  },
  embedded: {
    key: "embedded",
    label: "📍 場域工具",
    badgeCls:
      "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-700",
  },
  skill: {
    key: "skill",
    label: "🧠 Agent Skill",
    badgeCls:
      "bg-fuchsia-50 dark:bg-fuchsia-900/30 text-fuchsia-700 dark:text-fuchsia-300 border-fuchsia-200 dark:border-fuchsia-700",
  },
};

export function typeBadge(type) {
  return TYPES[type] || TYPES.webapp;
}

// ─── 卡片「一鍵動作」CTA（沿用原 ToolCard.getCTA 邏輯，多加 skill） ───
// 回傳 { label, href, cls, disabled, external? }
export function getCTA(tool) {
  const { type = "webapp", status, url, id, typeData = {} } = tool;

  if (status === "terminated") {
    return {
      label: "⛔ 已終止維護",
      href: null,
      cls: "bg-red-100 text-red-600 cursor-not-allowed",
      disabled: true,
    };
  }
  if (status === "dev" || status === "pending") {
    return {
      label: "🚧 開發中，敬請期待",
      href: `/tool/${id}`,
      cls: "bg-gray-200 text-gray-500 hover:bg-gray-300",
      disabled: false,
    };
  }
  if (type === "embedded") {
    return {
      label: "📍 查看部署資訊 →",
      href: `/tool/${id}`,
      cls: "bg-indigo-500 text-white hover:bg-indigo-600",
      disabled: false,
    };
  }
  // skill：下載 zip（典型 href 來自 typeData.skillZipUrl）
  if (type === "skill") {
    const zip = typeData.skillZipUrl || url;
    if (!zip) {
      return {
        label: "👀 看詳情 →",
        href: `/tool/${id}`,
        cls: "bg-gray-300 text-gray-700 hover:bg-gray-400",
        disabled: false,
      };
    }
    return {
      label: "⬇️ 下載 SKILL →",
      href: zip,
      cls: "bg-fuchsia-500 text-white hover:bg-fuchsia-600",
      disabled: false,
      external: true,
    };
  }

  const ctaByType = {
    webapp: {
      label: "🌐 馬上打開 →",
      cls: "bg-gradient-to-r from-purple-500 to-blue-500 text-white hover:opacity-90",
    },
    download: {
      label: "⬇️ 下載安裝檔 →",
      cls: "bg-blue-500 text-white hover:bg-blue-600",
    },
    doc: {
      label: "⬇️ 下載 →",
      cls: "bg-orange-500 text-white hover:bg-orange-600",
    },
    mcp: {
      label: "📦 安裝到 Claude / Cursor →",
      cls: "bg-emerald-500 text-white hover:bg-emerald-600",
    },
    api: {
      label: "🔗 看 API 文件 →",
      cls: "bg-amber-500 text-white hover:bg-amber-600",
    },
  };
  const base = ctaByType[type] || ctaByType.webapp;

  if (!url) {
    return {
      label: "👀 看詳情 →",
      href: `/tool/${id}`,
      cls: "bg-gray-300 text-gray-700 hover:bg-gray-400",
      disabled: false,
    };
  }
  return {
    ...base,
    href: url,
    external: ["webapp", "download", "doc", "api"].includes(type),
    disabled: false,
  };
}

// ─── 詳情頁「一鍵動作」（sidebar / quick tab 用，沿用原 TYPE_ACTION + skill） ───
export const TYPE_ACTION = {
  webapp: {
    label: "🌐 前往網頁工具",
    cls: "text-white bg-gradient-to-r from-[var(--color-clay-purple)] to-[var(--color-clay-blue)]",
  },
  download: {
    label: "⬇️ 下載安裝檔",
    cls: "text-white bg-blue-500 hover:bg-blue-600",
  },
  doc: {
    label: "⬇️ 下載文件",
    cls: "text-white bg-orange-500 hover:bg-orange-600",
  },
  mcp: {
    label: "📦 安裝到 Claude/Cursor",
    cls: "text-white bg-emerald-500 hover:bg-emerald-600",
  },
  api: {
    label: "🔗 看 API 文件",
    cls: "text-white bg-amber-500 hover:bg-amber-600",
  },
  skill: {
    label: "⬇️ 下載 SKILL (.zip)",
    cls: "text-white bg-fuchsia-500 hover:bg-fuchsia-600",
  },
};

// ─── 詳情頁 tab 組成（依 type）。沿用原 DetailTabs 規則，skill = quick + detail ───
export function getTabsForType(type) {
  const tabs = [];
  if (type === "embedded") tabs.push({ key: "deploy", label: "📍 部署資訊" });
  if (["download", "doc", "mcp", "skill"].includes(type))
    tabs.push({ key: "quick", label: "🚀 快速安裝" });
  if (["mcp", "api"].includes(type))
    tabs.push({ key: "advanced", label: "🧰 進階設定" });
  tabs.push({ key: "detail", label: "📖 詳細說明" });
  return tabs;
}

// 詳情頁預設開哪個 tab
export function defaultTabForType(type) {
  if (type === "embedded") return "deploy";
  if (["download", "doc", "mcp", "skill"].includes(type)) return "quick";
  return "detail";
}

// ─── 各 type 在 wizard 要編輯的 typeData 欄位（給 TypeDataEditor 用） ───
// 形狀：{ key, label, kind: 'text'|'textarea'|'select'|'upload', placeholder?, options?, uploadPrefix? }
export const TYPE_DATA_FIELDS = {
  webapp: [],
  download: [
    {
      key: "fileUrl",
      label: "fileUrl（檔案下載連結）",
      kind: "upload",
      uploadPrefix: "downloads",
    },
    {
      key: "platform",
      label: "platform",
      kind: "select",
      options: ["", "windows", "mac", "linux", "crossplatform"],
    },
    { key: "version", label: "version", kind: "text", placeholder: "v1.2.0" },
    {
      key: "fileName",
      label: "fileName",
      kind: "text",
      placeholder: "installer.exe",
    },
  ],
  doc: [
    { key: "fileUrl", label: "fileUrl", kind: "upload", uploadPrefix: "docs" },
    {
      key: "fileType",
      label: "fileType",
      kind: "select",
      options: ["", "pdf", "docx", "xlsx", "zip", "other"],
    },
    { key: "version", label: "version", kind: "text", placeholder: "v2026.05" },
    {
      key: "fileName",
      label: "fileName",
      kind: "text",
      placeholder: "表單名.docx",
    },
  ],
  mcp: [
    {
      key: "mcpbUrl",
      label: "mcpbUrl (.mcpb 一鍵安裝包)",
      kind: "text",
      placeholder: "https://.../x.mcpb",
    },
    {
      key: "npmPackage",
      label: "npmPackage",
      kind: "text",
      placeholder: "@simhope/x-mcp",
    },
    {
      key: "repoUrl",
      label: "repoUrl",
      kind: "text",
      placeholder: "https://github.com/...",
    },
    { key: "configSnippet", label: "configSnippet (JSON)", kind: "textarea" },
  ],
  api: [
    {
      key: "endpoint",
      label: "endpoint",
      kind: "text",
      placeholder: "https://api.simhope.local/...",
    },
    {
      key: "docsUrl",
      label: "docsUrl",
      kind: "text",
      placeholder: "https://docs.simhope.local/...",
    },
    {
      key: "sdkPackage",
      label: "sdkPackage",
      kind: "text",
      placeholder: "@simhope/x-sdk",
    },
  ],
  embedded: [
    { key: "location", label: "location（部署地點）", kind: "text" },
    {
      key: "accessNote",
      label: "accessNote（怎麼用 / 找誰開通）",
      kind: "textarea",
    },
    { key: "contact", label: "contact（負責窗口）", kind: "text" },
  ],
  skill: [
    {
      key: "skillZipUrl",
      label: "skillZipUrl（.zip 下載連結）",
      kind: "upload",
      uploadPrefix: "skills",
    },
    { key: "version", label: "version", kind: "text", placeholder: "v1.0.0" },
    {
      key: "installPath",
      label: "installPath",
      kind: "text",
      placeholder: "~/.claude/skills/",
    },
  ],
};

// ─── 依工具陣列算各 category 數量（首頁入口卡 / hub tab 用） ───
export function categoryCounts(tools) {
  const counts = { all: 0 };
  for (const k of CATEGORY_ORDER) counts[k] = 0;
  for (const t of tools) {
    if (t.status === "terminated") continue; // 計數只算 active（沿用首頁慣例）
    counts.all += 1;
    const c =
      t.category && counts[t.category] !== undefined ? t.category : "tool";
    counts[c] += 1;
  }
  return counts;
}
```

- [ ] **Step 2: 建立純函式斷言 `scripts/__verify-taxonomy.mjs`**

```js
// scripts/__verify-taxonomy.mjs — 純函式 sanity check（無框架，直接 node 跑）
import assert from "node:assert";
import {
  getCTA,
  getTabsForType,
  categoryCounts,
  CATEGORY_ORDER,
} from "../src/lib/taxonomy.js";

// terminated → disabled
assert.equal(
  getCTA({ type: "webapp", status: "terminated", id: "x" }).disabled,
  true,
);
// dev → 引導詳情頁
assert.equal(
  getCTA({ type: "webapp", status: "dev", id: "x" }).href,
  "/tool/x",
);
// skill 有 zip → 下載外連
const s = getCTA({
  type: "skill",
  status: "live",
  id: "x",
  typeData: { skillZipUrl: "https://z/a.zip" },
});
assert.equal(s.href, "https://z/a.zip");
assert.equal(s.external, true);
// skill 無 zip → 退回看詳情
assert.equal(
  getCTA({ type: "skill", status: "live", id: "x", typeData: {} }).href,
  "/tool/x",
);
// webapp 有 url → 外連
assert.equal(
  getCTA({ type: "webapp", status: "live", id: "x", url: "https://a" })
    .external,
  true,
);
// skill tabs = quick + detail
assert.deepEqual(
  getTabsForType("skill").map((t) => t.key),
  ["quick", "detail"],
);
// mcp tabs = quick + advanced + detail
assert.deepEqual(
  getTabsForType("mcp").map((t) => t.key),
  ["quick", "advanced", "detail"],
);
// 計數：terminated 不算；未知 category 歸 tool
const counts = categoryCounts([
  { category: "skill", status: "live" },
  { category: "mcp", status: "live" },
  { category: "tool", status: "terminated" },
  { status: "live" }, // 無 category → tool
]);
assert.equal(counts.all, 3);
assert.equal(counts.skill, 1);
assert.equal(counts.tool, 1);
assert.deepEqual(CATEGORY_ORDER, [
  "platform",
  "tool",
  "project",
  "mcp",
  "skill",
]);

console.log("✅ taxonomy verify passed");
```

- [ ] **Step 3: 跑斷言**

Run: `node scripts/__verify-taxonomy.mjs`
Expected: `✅ taxonomy verify passed`（任何 assert 失敗會丟錯）

- [ ] **Step 4: build**

Run: `npm run build`
Expected: 成功（taxonomy.js 尚未被 import，僅驗證無語法錯）

- [ ] **Step 5: Commit**

```bash
git add src/lib/taxonomy.js scripts/__verify-taxonomy.mjs
git commit -m "feat(taxonomy): 新增 category/type 單一真相來源 + skill type

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

## Task 2: ToolCard 改用 taxonomy（第 1 個面）

**Files:**

- Modify: `src/components/ToolCard.jsx`

**做法：** 刪掉檔內 `TYPE_BADGES` 與 `getCTA` 兩個本地定義，改 import taxonomy 的 `typeBadge` / `getCTA`。`getStatusLabel` 保留（status 不在 taxonomy 範圍）。

- [ ] **Step 1: 改 import 與引用**

在檔頭 `import Link from "next/link";` 下方加：

```js
import { typeBadge, getCTA } from "@/lib/taxonomy";
```

刪除檔內 `export const TYPE_BADGES = {...}`（整段）與 `export function getCTA(tool) {...}`（整段）。

> 注意：原本 `TYPE_BADGES` / `getCTA` 是 `export` 的。先 grep 確認除了本檔還有誰 import：
> `grep -rn "TYPE_BADGES\|from \"@/components/ToolCard\"\|getCTA" app src` — 預期只有 ToolCard 自用 + 詳情頁 import `getStatusLabel`。若有他處 import `TYPE_BADGES`/`getCTA`，那些檔在後續 task 一併改 import 自 taxonomy。

在 `ToolCard` 元件內，把：

```js
const typeBadge = TYPE_BADGES[type] || TYPE_BADGES.webapp;
```

改為（變數名與 import 衝突，改用呼叫）：

```js
const badge = typeBadge(type);
```

並把 JSX 中 `typeBadge.cls` / `typeBadge.label` 改成 `badge.badgeCls` / `badge.label`。

- [ ] **Step 2: build**

Run: `npm run build`
Expected: 成功，無 "TYPE_BADGES is not defined" 之類錯誤。

- [ ] **Step 3: 視覺實測**

Run: `npm run dev` → 開 `http://localhost:3000`
檢查點：工具卡的**類型 badge 文字/顏色**與**底部 CTA 按鈕文字/顏色**跟改動前一致（webapp/download/doc/mcp/api/embedded 各至少一張）。terminated 工具（摺疊區）CTA 仍是紅色「⛔ 已終止維護」。

- [ ] **Step 4: Commit**

```bash
git add src/components/ToolCard.jsx
git commit -m "refactor(ToolCard): 改用 taxonomy 的 typeBadge/getCTA

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

## Task 3: 詳情頁改用 taxonomy + 加 skill tab + 修 descHtml bug（第 2 個面）

**Files:**

- Modify: `app/tool/[id]/page.jsx`

- [ ] **Step 1: 改 import**

檔頭加：

```js
import { TYPE_ACTION, getTabsForType, defaultTabForType } from "@/lib/taxonomy";
```

刪除檔內本地的 `const TYPE_ACTION = {...}`（整段，約 line 320-326）。

- [ ] **Step 2: `DetailTabs` 改用 `getTabsForType`**

把 `DetailTabs` 內手刻 tabs 的那段（`const tabs = []; if (type === 'embedded')...` 到 `tabs.push({ key: 'detail', ... })`）整段替換成：

```js
const tabs = getTabsForType(type);
```

其餘（activeKey 計算、tab bar、tab content 渲染）不動。

- [ ] **Step 3: `QuickInstallTab` 加 skill 分支**

在 `QuickInstallTab` 函式開頭（`if (type === 'mcp') {` 之前）插入：

```js
if (type === "skill") {
  const zip = td.skillZipUrl || tool.url || "";
  const installPath = td.installPath || "~/.claude/skills/";
  return (
    <div className="flex flex-col gap-5">
      <div className="bg-gradient-to-br from-fuchsia-50 to-white dark:from-fuchsia-900/10 dark:to-transparent border-2 border-fuchsia-200 dark:border-fuchsia-800/40 rounded-2xl p-6">
        <h3 className="font-extrabold text-lg mb-2">🧠 安裝這個 Skill</h3>
        <p className="text-sm text-[var(--color-text-mid)] mb-4">
          下載 .zip 後解壓到{" "}
          <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">
            {installPath}
          </code>
          ，重啟 Claude Desktop 即生效。
        </p>
        {zip ? (
          <a
            href={zip}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block px-6 py-3 rounded-xl bg-fuchsia-500 text-white font-extrabold text-sm shadow hover:bg-fuchsia-600 transition"
          >
            ⬇️ 下載 SKILL (.zip)
          </a>
        ) : (
          <p className="text-sm text-[var(--color-text-mid)] italic">
            .zip 還沒上傳，請聯絡作者或看詳細說明。
          </p>
        )}
        {td.version && (
          <p className="text-sm text-[var(--color-text-mid)] mt-3">
            <strong>版本：</strong>
            {td.version}
          </p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: 修 `descHtml` bug（DetailTab）**

在 `DetailTab` 函式內，把：

```js
            {!descHtml && blocks.length === 0 && (
```

改成：

```js
            {!tool.desc && blocks.length === 0 && (
```

- [ ] **Step 5: sidebar 預設 tab 改用 helper（可選收斂）**

`fetchTool` 內設定預設 tab 那段：

```js
const type = data.type || "webapp";
setActiveTab(
  type === "embedded"
    ? "deploy"
    : ["download", "doc", "mcp"].includes(type)
      ? "quick"
      : "detail",
);
```

改成：

```js
setActiveTab(defaultTabForType(data.type || "webapp"));
```

> sidebar 的 `TYPE_ACTION[tool.type]` 引用因已改 import taxonomy 的 `TYPE_ACTION`（含 skill），自動支援 skill；無需再改。

- [ ] **Step 6: build**

Run: `npm run build`
Expected: 成功。

- [ ] **Step 7: 視覺實測**

`npm run dev`：

1. 開一個既有 mcp 工具詳情頁 → tab 仍是「快速安裝/進階設定/詳細說明」。
2. 開一個既有 webapp 工具 → 只有「詳細說明」，內容正常。
3. （skill 詳情頁要等有 skill 資料才能測；Task 10 種一筆後回來測，或先在 Firestore 手動建一筆 `type:skill` 驗證下載 tab）。
4. 找一個 desc 與 blocks 都空的工具開「詳細說明」→ 顯示「這個工具還沒有詳細說明」**而非 crash**。

- [ ] **Step 8: Commit**

```bash
git add app/tool/[id]/page.jsx
git commit -m "refactor(detail): 改用 taxonomy + 加 skill 安裝 tab + 修 descHtml crash

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

## Task 4: dashboard 上傳表單主選改 category（第 3 個面）

**Files:**

- Modify: `app/dashboard/page.jsx`

**做法：** 把「④ 類型」從 7 種 `type` 選項改成 5 種 `category`（更直覺）。送出時 `type = CATEGORIES[category].defaultType`，`category` 一起寫入。

- [ ] **Step 1: 改 import + 表單 state**

檔頭加：

```js
import { CATEGORIES, CATEGORY_ORDER } from "@/lib/taxonomy";
```

把 `TYPE_OPTIONS` 整段（line 14-69）刪除，改用一個本地的 category 顯示陣列（含給同仁看的 helper 文案）：

```js
const CATEGORY_OPTIONS = [
  {
    key: "tool",
    emoji: "🧰",
    label: "工具",
    helper: "單點 AI 小工具，同仁點連結或下載就能用。",
    urlPlaceholder: "https://... 或 GitHub repo 連結",
  },
  {
    key: "platform",
    emoji: "🏢",
    label: "平臺",
    helper: "較大型、多功能、長期維運的系統或應用。",
    urlPlaceholder: "https://平臺網址",
  },
  {
    key: "project",
    emoji: "📁",
    label: "專案",
    helper: "單一、時限性的案子（例：某個補助案），展示進度與成果。",
    urlPlaceholder: "參考連結（可留空）",
  },
  {
    key: "mcp",
    emoji: "🔌",
    label: "MCP",
    helper: "給 AI agent 串接的連接器，裝一次 Claude/Cursor 就能用。",
    urlPlaceholder: "GitHub repo 連結",
  },
  {
    key: "skill",
    emoji: "🧠",
    label: "Skill",
    helper: "Agent skill，下載 .zip 裝到 ~/.claude/skills/。",
    urlPlaceholder: "GitHub repo 連結（zip 審核時上傳）",
  },
];
```

把 `formData` 預設由 `type: 'webapp'` 改成 `category: 'tool'`：

```js
const [formData, setFormData] = useState({
  title: "",
  tagline: "",
  url: "",
  category: "tool",
});
```

- [ ] **Step 2: 改 submit 寫入**

`handleFormSubmit` 內 `toolData` 把 `type: formData.type` 改為：

```js
                category: formData.category,
                type: CATEGORIES[formData.category]?.defaultType || 'webapp',
```

並把重置 `setFormData(...)` 的 `type: 'webapp'` 改 `category: 'tool'`。

- [ ] **Step 3: 改 ④ 區塊的 radio 渲染**

把 `TYPE_OPTIONS.map(...)` 改成 `CATEGORY_OPTIONS.map(...)`，`name="type"` 改 `name="category"`，`formData.type` 改 `formData.category`，`opt.activeAccent/accent` 用統一樣式（移除原本 per-type 的 accent class，改用一組通用 active/idle）：

```js
className={`flex gap-3 items-start cursor-pointer rounded-xl p-3 border-2 transition ${isActive ? 'border-[var(--color-clay-purple)] bg-[var(--color-clay-purple)]/5' : 'border-gray-200 hover:border-[var(--color-clay-purple)]/40'}`}
```

標題改 `④ 類別（這是什麼樣的東西？）`。`currentType` 改 `currentCategory = CATEGORY_OPTIONS.find(c => c.key === formData.category) || CATEGORY_OPTIONS[0]`，③ 主連結的 `required`/placeholder 引用改用 `currentCategory`（skill/project 可留空：`required={!['project','skill'].includes(formData.category)}`）。

- [ ] **Step 4: build**

Run: `npm run build`
Expected: 成功。

- [ ] **Step 5: 視覺實測**

`npm run dev` → 用 developer 帳號登入 → `/dashboard`：

1. ④ 區塊顯示 5 個類別選項（工具/平臺/專案/MCP/Skill）。
2. 選「Skill」送出一筆測試 → 「我提交的工具」出現該筆；到 Firestore 確認該 doc 有 `category:'skill'` + `type:'skill'` + `status:'pending'`。

- [ ] **Step 6: Commit**

```bash
git add app/dashboard/page.jsx
git commit -m "feat(dashboard): 上傳表單主選改 5 大 category（type 由預設帶入）

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

## Task 5: ReviewToolWizard 加 category 下拉 + skill typeData 分支（第 4 個面）

**Files:**

- Modify: `src/components/ReviewToolWizard.jsx`

- [ ] **Step 1: 改 import**

檔頭 `import { DEPTS } from '@/lib/db';` 旁加：

```js
import { CATEGORIES, CATEGORY_ORDER, TYPES } from "@/lib/taxonomy";
```

把本地 `const TYPE_LABELS = {...}`（line 10-17）刪除，後面用 `TYPES`（注意 `TYPES[k].label` 已含 emoji，原 `TYPE_LABELS` 是 `{emoji,label}` 拆開的；把所有 `TYPE_LABELS[x]?.emoji` + `TYPE_LABELS[x]?.label` 的並用改成單一 `TYPES[x]?.label`）。

- [ ] **Step 2: form state 加 category**

`useState` 的 `form` 初值加：

```js
        category: tool.category || CATEGORIES[tool.type]?.key || 'tool',
```

`handleSaveOnly` 的 `payload` 加：

```js
            category: form.category,
```

- [ ] **Step 3: Step 2 加 category 下拉（放在「類型」下拉前）**

在 `<FormField label="類型">` 之前插入：

```jsx
<FormField label="類別（目錄分類，使用者看的）">
  <select
    value={form.category}
    onChange={(e) => update({ category: e.target.value })}
    className="w-full bg-gray-50 dark:bg-gray-700 p-2 rounded-lg border border-gray-200 dark:border-gray-600 text-sm"
  >
    {CATEGORY_ORDER.map((k) => (
      <option key={k} value={k}>
        {CATEGORIES[k].emoji} {CATEGORIES[k].label}
      </option>
    ))}
  </select>
</FormField>
```

「類型」下拉的 `<option>` 由 `Object.entries(TYPE_LABELS)` 改 `Object.entries(TYPES)`，顯示 `{v.label}`（已含 emoji）。

- [ ] **Step 4: `TypeDataEditor` 加 skill 分支**

在 `TypeDataEditor` 內、`if (type === 'embedded')` 之後、`return null` 之前插入：

```jsx
if (type === "skill") {
  return (
    <div className="flex flex-col gap-3">
      <FormField label="skillZipUrl（.zip 下載連結）">
        <div className="flex gap-2">
          <input
            value={td.skillZipUrl || ""}
            onChange={(e) => updateTd({ skillZipUrl: e.target.value })}
            placeholder="https://.../my-skill.zip"
            className="flex-1 bg-gray-50 dark:bg-gray-700 p-2 rounded-lg border border-gray-200 dark:border-gray-600 text-sm font-mono"
          />
          <UploadButton
            pathPrefix="skills"
            accept=".zip,application/zip"
            onUploaded={(url) => updateTd({ skillZipUrl: url })}
          />
        </div>
      </FormField>
      <FormField label="version">
        <input
          value={td.version || ""}
          onChange={(e) => updateTd({ version: e.target.value })}
          placeholder="v1.0.0"
          className="w-full bg-gray-50 dark:bg-gray-700 p-2 rounded-lg border border-gray-200 dark:border-gray-600 text-sm"
        />
      </FormField>
      <FormField label="installPath">
        <input
          value={td.installPath || ""}
          onChange={(e) => updateTd({ installPath: e.target.value })}
          placeholder="~/.claude/skills/"
          className="w-full bg-gray-50 dark:bg-gray-700 p-2 rounded-lg border border-gray-200 dark:border-gray-600 text-sm font-mono"
        />
      </FormField>
    </div>
  );
}
```

Step 1（唯讀）與 Step 3（preview）中引用 `TYPE_LABELS[tool.type]` / `TYPE_LABELS[form.type]` 的地方，改成 `TYPES[tool.type]?.label` / `TYPES[form.type]?.label`（移除分開的 emoji 串接）。

- [ ] **Step 5: build + 視覺實測**

Run: `npm run build` → 成功。
`npm run dev` → admin 登入 → `/admin` → 開 Task 4 種的 skill 待審工具 → 進 wizard Step 2：

1. 看到「類別」下拉預設 Skill；「類型」下拉預設 Agent Skill。
2. typeData 區出現 skillZipUrl（含 📤 上傳）/ version / installPath。
3. 上傳一個 .zip → skillZipUrl 自動填入；上架成 live。

- [ ] **Step 6: Commit**

```bash
git add src/components/ReviewToolWizard.jsx
git commit -m "feat(wizard): 加 category 下拉 + skill typeData 編輯 + 改用 taxonomy

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

## Task 6: db.js 加 getCatalog

**Files:**

- Modify: `src/lib/db.js`

**做法：** `getCatalog({category})` 重用既有 `getApprovedTools()` 的可見性邏輯，再依 category 過濾（client 端過濾即可，量小；避免 Firestore 複合索引）。

- [ ] **Step 1: 加函式**

在 `getApprovedTools` 之後加：

```js
/**
 * 取目錄（catalog）— 重用 getApprovedTools 的可見性，再依 category 過濾。
 * @param {{category?: string}} opts  category 省略或 'all' = 全部
 * @returns {Promise<object[]>}
 */
export async function getCatalog({ category } = {}) {
  const tools = await getApprovedTools();
  if (!category || category === "all") return tools;
  // 無 category 欄位的舊資料視為 'tool'（與 categoryCounts 一致）
  return tools.filter((t) => (t.category || "tool") === category);
}
```

- [ ] **Step 2: build**

Run: `npm run build`
Expected: 成功。

- [ ] **Step 3: Commit**

```bash
git add src/lib/db.js
git commit -m "feat(db): 加 getCatalog({category}) 重用可見性 + 類別過濾

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

## Task 7: 共用 chrome — Footer + Banner + Navbar 連結 + 掛 layout

**Files:**

- Create: `src/components/Footer.jsx`
- Create: `src/components/Banner.jsx`
- Modify: `src/components/Navbar.jsx`
- Modify: `app/layout.js`

- [ ] **Step 1: 建立 `src/components/Footer.jsx`**

```jsx
import Link from "next/link";

/** 全站 footer — 品牌 + 三欄 + 版權。內部站，無外部社群連結。 */
export default function Footer() {
  return (
    <footer className="mt-24 border-t border-[var(--color-nav-border)] bg-[var(--color-nav-bg)]">
      <div className="max-w-6xl mx-auto px-6 py-12 grid grid-cols-1 md:grid-cols-4 gap-8">
        <div className="md:col-span-1">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-400 to-blue-400 flex items-center justify-center text-lg">
              🏭
            </div>
            <span className="font-black text-[var(--color-text-dark)]">
              SimHope Hub
            </span>
          </div>
          <p className="text-sm text-[var(--color-text-mid)] font-semibold leading-relaxed">
            公司內部 AI 資源中心 · 工具 / 平臺 / 專案 / MCP / Skill
          </p>
        </div>
        <div>
          <div className="text-xs font-extrabold text-gray-400 uppercase tracking-wider mb-3">
            資源
          </div>
          <ul className="flex flex-col gap-2 text-sm font-bold text-[var(--color-text-mid)]">
            <li>
              <Link
                href="/hub"
                className="hover:text-[var(--color-clay-purple)]"
              >
                資源中心
              </Link>
            </li>
            <li>
              <Link
                href="/#painpoints"
                className="hover:text-[var(--color-clay-purple)]"
              >
                痛點解法
              </Link>
            </li>
            <li>
              <Link
                href="/#feedback"
                className="hover:text-[var(--color-clay-purple)]"
              >
                同仁回饋
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <div className="text-xs font-extrabold text-gray-400 uppercase tracking-wider mb-3">
            開發者
          </div>
          <ul className="flex flex-col gap-2 text-sm font-bold text-[var(--color-text-mid)]">
            <li>
              <Link
                href="/dashboard"
                className="hover:text-[var(--color-clay-purple)]"
              >
                上架工具
              </Link>
            </li>
            <li>
              <a
                href="mailto:jasonlin@simhope.com.tw?subject=AI工具需求"
                className="hover:text-[var(--color-clay-purple)]"
              >
                提需求
              </a>
            </li>
          </ul>
        </div>
        <div>
          <div className="text-xs font-extrabold text-gray-400 uppercase tracking-wider mb-3">
            關於
          </div>
          <p className="text-sm text-[var(--color-text-mid)] font-semibold">
            經企室建置維運
          </p>
        </div>
      </div>
      <div className="border-t border-[var(--color-nav-border)] py-5 text-center text-xs text-[var(--color-text-mid)] font-semibold">
        © 2026 SimHope · 內部使用，未經授權禁止外部散佈 · v0.8
      </div>
    </footer>
  );
}
```

- [ ] **Step 2: 建立 `src/components/Banner.jsx`**

```jsx
"use client";
import Link from "next/link";

/**
 * 公告條 — variant: 'changelog'（最新更新）。內部站非必要，預設 show=false 可關。
 * 之後要顯示就在 layout 設 <Banner show variant="changelog" text="..." href="/changelog" />。
 */
export default function Banner({
  show = false,
  text = "",
  href,
  variant = "changelog",
}) {
  if (!show || !text) return null;
  const icon = variant === "maintenance" ? "🛠️" : "📌";
  return (
    <div className="w-full bg-[var(--color-clay-purple)]/10 border-b border-[var(--color-clay-purple)]/20 text-center text-sm font-bold text-[var(--color-text-dark)] py-2 px-4">
      <span className="mr-1">{icon}</span>
      {text}
      {href && (
        <Link
          href={href}
          className="ml-2 text-[var(--color-clay-purple)] underline hover:opacity-80"
        >
          查看 →
        </Link>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Navbar 加「資源中心」連結**

`src/components/Navbar.jsx` 中，把現有的 `工具總覽` 連結（指向 `/#tools`）改指向 `/hub` 並改名「資源中心」：

```jsx
<Link
  href="/hub"
  className="hidden md:inline hover:text-violet-500 dark:hover:text-violet-400 transition-colors"
>
  資源中心
</Link>
```

（保留 `關於這個平台` `/#about`、`同仁回饋` `/#feedback`。「找工具 →」CTA 的 href 由 `/#tools` 改 `/hub`。）

- [ ] **Step 4: layout 掛 Footer**

`app/layout.js` 中，在主要內容容器結束、`</body>` 之前掛上 `<Footer />`（import 自 `@/components/Footer`）。Banner 先不啟用（預設 show=false），保留日後可加。

> 先 Read `app/layout.js` 確認現有結構（Navbar 怎麼掛、main wrapper 在哪），把 `<Footer />` 放在主內容之後、同一層。

- [ ] **Step 5: build + 視覺實測**

Run: `npm run build` → 成功。
`npm run dev` → 每頁底部都有 Footer；Navbar 點「資源中心」會到 `/hub`（此時 `/hub` 可能 404，Task 8 才建 — 先確認連結指向正確即可）。

- [ ] **Step 6: Commit**

```bash
git add src/components/Footer.jsx src/components/Banner.jsx src/components/Navbar.jsx app/layout.js
git commit -m "feat(chrome): 新增 Footer/Banner + Navbar 加資源中心連結 + 掛 layout

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

## Task 8: /hub 統一目錄頁 + CategoryTabs

**Files:**

- Create: `src/components/CategoryTabs.jsx`
- Create: `app/hub/page.jsx`

**做法：** 把首頁現有「工具總覽」的搜尋/grid 邏輯（Fuse.js + 卡片）搬到 `/hub`，頂部用 category tab 取代原 type chip；支援 `?cat=` 進入。

- [ ] **Step 1: 建立 `src/components/CategoryTabs.jsx`**

```jsx
"use client";
import { CATEGORIES, CATEGORY_ORDER } from "@/lib/taxonomy";

/** 類別 tab（全部 + 5 類別），含各類別計數。 */
export default function CategoryTabs({ active, counts, onChange }) {
  const tabs = [
    { key: "all", label: "全部", emoji: "" },
    ...CATEGORY_ORDER.map((k) => CATEGORIES[k]),
  ];
  return (
    <div className="flex flex-wrap gap-2 justify-center mb-6">
      {tabs.map((t) => {
        const isActive = active === t.key;
        const count = counts?.[t.key] ?? 0;
        return (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-extrabold border-2 transition-all ${
              isActive
                ? "bg-[var(--color-clay-purple)] text-white border-[var(--color-clay-purple)] shadow-md"
                : "bg-white dark:bg-gray-800 text-[var(--color-text-mid)] border-gray-200 dark:border-gray-700 hover:border-[var(--color-clay-purple)]/40 hover:-translate-y-0.5"
            }`}
          >
            {t.emoji && <span>{t.emoji}</span>}
            {t.label}
            <span
              className={`text-xs ${isActive ? "opacity-80" : "opacity-60"}`}
            >
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: 建立 `app/hub/page.jsx`**

```jsx
"use client";

import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import Fuse from "fuse.js";
import { getCatalog } from "@/lib/db";
import { categoryCounts, CATEGORIES } from "@/lib/taxonomy";
import ToolCard from "@/components/ToolCard";
import CategoryTabs from "@/components/CategoryTabs";

export default function HubPage() {
  const searchParams = useSearchParams();
  const initialCat = searchParams.get("cat") || "all";

  const [tools, setTools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeCat, setActiveCat] = useState(initialCat);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  useEffect(() => {
    getCatalog()
      .then((data) => setTools(data))
      .catch((e) => console.error("Failed to load catalog:", e))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchQuery.trim()), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const activeTools = useMemo(
    () => tools.filter((t) => t.status !== "terminated"),
    [tools],
  );
  const counts = useMemo(() => categoryCounts(tools), [tools]);

  const fuse = useMemo(
    () =>
      new Fuse(activeTools, {
        keys: ["title", "tagline", "tags", "desc"],
        threshold: 0.4,
        ignoreLocation: true,
      }),
    [activeTools],
  );

  const filtered = useMemo(() => {
    let result = activeTools;
    if (debouncedQuery) result = fuse.search(debouncedQuery).map((r) => r.item);
    if (activeCat !== "all")
      result = result.filter((t) => (t.category || "tool") === activeCat);
    return result;
  }, [activeTools, debouncedQuery, fuse, activeCat]);

  return (
    <div className="px-4 md:px-0 max-w-6xl mx-auto py-10">
      <div className="text-center mb-8">
        <h1 className="text-4xl md:text-5xl font-black text-[var(--color-text-dark)] mb-3">
          資源中心
        </h1>
        <p className="text-[var(--color-text-mid)] font-semibold">
          {activeCat === "all"
            ? "公司所有 AI 資源 — 工具、平臺、專案、MCP、Skill"
            : CATEGORIES[activeCat]?.desc}
        </p>
      </div>

      <div className="relative mb-5 max-w-2xl mx-auto">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="🔍 搜尋名稱、描述、關鍵字..."
          className="w-full pl-5 pr-12 py-3.5 rounded-2xl bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 text-base font-medium focus:border-[var(--color-clay-purple)] focus:outline-none focus:ring-4 focus:ring-[var(--color-clay-purple)]/10 transition-all shadow-sm"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700"
            aria-label="清除搜尋"
          >
            ✕
          </button>
        )}
      </div>

      <CategoryTabs
        active={activeCat}
        counts={counts}
        onChange={setActiveCat}
      />

      {loading ? (
        <div className="text-center py-20 text-gray-400">載入中，請稍候…</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {filtered.map((t) => (
            <ToolCard key={t.id} tool={t} />
          ))}
          {filtered.length === 0 && (
            <div className="col-span-full py-20 text-center text-gray-500 font-bold bg-white dark:bg-gray-800 rounded-[24px] border border-dashed border-gray-300 dark:border-gray-600">
              這個分類目前沒有項目
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

> Next.js 16 注意：`useSearchParams()` 需在 client component 且包在 `<Suspense>` 內才不會在 build 時警告。若 `npm run build` 報 "useSearchParams should be wrapped in a suspense boundary"，把 `HubPage` 內容抽成 `<HubInner/>`，外層 `export default function HubPage(){ return <Suspense fallback={null}><HubInner/></Suspense> }`（import `Suspense` from "react"）。實作時依 build 結果決定。

- [ ] **Step 3: build**

Run: `npm run build`
Expected: 成功（若 useSearchParams 報錯，依 Step 2 註記包 Suspense 後重 build）。

- [ ] **Step 4: 視覺實測**

`npm run dev` → `http://localhost:3000/hub`：

1. 顯示卡片 grid + 5 類別 tab + 各 tab 計數。
2. 點 tab 切換 → 卡片正確過濾；搜尋可用。
3. `http://localhost:3000/hub?cat=skill` 直接進 Skill tab。

- [ ] **Step 5: Commit**

```bash
git add src/components/CategoryTabs.jsx app/hub/page.jsx
git commit -m "feat(hub): 新增 /hub 統一目錄頁（類別 tab + Fuse 搜尋）

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

## Task 9: 首頁重構為 hub landing

**Files:**

- Create: `src/components/CategoryEntryCard.jsx`
- Create: `src/components/MetricsBand.jsx`
- Modify: `app/page.jsx`

**做法：** 首頁 hero 之後加「5 類別入口卡」+「metrics band」；**移除**原「工具總覽」整段（搜尋/type chip/grid/terminated）—— 該功能已移到 `/hub`，首頁改放入口卡導去 `/hub?cat=`。**保留**痛點卡（§painpoints）、同仁回饋（§feedback）、CTA help（§about）。

- [ ] **Step 1: 建立 `src/components/CategoryEntryCard.jsx`**

```jsx
import Link from "next/link";

/** 首頁 5 類別入口卡 — icon + 標題 + 數量 + 描述，點擊去 /hub?cat= */
export default function CategoryEntryCard({ category, count }) {
  return (
    <Link
      href={`/hub?cat=${category.key}`}
      className="group block bg-[var(--color-card-bg)] rounded-[24px] p-6 shadow-sm border border-[var(--color-card-border)] hover:shadow-lg hover:-translate-y-1 transition-all duration-300"
    >
      <div className="flex items-center gap-3 mb-2">
        <div className="w-12 h-12 rounded-2xl bg-[var(--color-clay-purple)]/10 flex items-center justify-center text-2xl">
          {category.emoji}
        </div>
        <div>
          <h3 className="font-extrabold text-lg text-[var(--color-text-dark)]">
            {category.label}
          </h3>
          <span className="text-xs font-bold text-[var(--color-text-mid)]">
            {count} 個項目
          </span>
        </div>
      </div>
      <p className="text-sm text-[var(--color-text-mid)] font-medium leading-snug">
        {category.desc}
      </p>
      <span className="inline-block mt-3 text-sm font-extrabold text-[var(--color-clay-purple)] group-hover:translate-x-1 transition-transform">
        瀏覽 →
      </span>
    </Link>
  );
}
```

- [ ] **Step 2: 建立 `src/components/MetricsBand.jsx`**

```jsx
/** 首頁數字帶 — 接受 stats 陣列 [{value, label}]。 */
export default function MetricsBand({ stats }) {
  return (
    <div className="flex flex-wrap gap-5 justify-center">
      {stats.map((s) => (
        <div
          key={s.label}
          className="bg-white/85 dark:bg-gray-800/85 border-2 border-white/90 dark:border-white/10 backdrop-blur-sm rounded-2xl px-7 py-5 text-center shadow-[var(--shadow-clay)]"
        >
          <div className="text-3xl font-black text-[var(--color-text-dark)]">
            {s.value}
          </div>
          <div className="text-sm font-semibold text-[var(--color-text-mid)] mt-1">
            {s.label}
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: 重構 `app/page.jsx`**

3a. import 改：移除 `ToolCard`、`Fuse` 不再首頁用（搜尋移走）；加：

```js
import { getCatalog } from "@/lib/db";
import { categoryCounts, CATEGORIES, CATEGORY_ORDER } from "@/lib/taxonomy";
import CategoryEntryCard from "@/components/CategoryEntryCard";
import MetricsBand from "@/components/MetricsBand";
```

（保留 `PainCard`、`Link`。`getApprovedTools` 改 `getCatalog`。）

3b. 資料載入：把 `getApprovedTools()` 改 `getCatalog()`；移除 type chip / scenario / fuse / filteredTools / terminated 等與「工具總覽」相關的 state 與 useMemo（searchQuery/selectedType/selectedScenarios/fuse/filteredTools/activeTools 的篩選版本…）。保留 `tools`（算 counts 用）與痛點相關 state。加：

```js
const counts = useMemo(() => categoryCounts(tools), [tools]);
const activeCount = counts.all;
```

3c. HERO 內的 stats 改用 `MetricsBand`：

```jsx
<MetricsBand
  stats={[
    { value: loading ? "…" : activeCount, label: "可用資源" },
    { value: "30+", label: "同仁每週使用" },
    { value: "10h", label: "估計每週省下" },
  ]}
/>
```

（移除 hero 內原本手刻的 3 stat 區塊。）

3d. 在 HERO `</section>` 之後、`§painpoints` 之前，插入「5 類別入口」段落：

```jsx
{
  /* ── 5 類別入口 ── */
}
<section id="catalog" className="scroll-mt-32">
  <div className="mb-8 text-center">
    <h2 className="text-3xl md:text-4xl font-black text-[var(--color-text-dark)] mb-3">
      探索資源
    </h2>
    <p className="text-[var(--color-text-mid)] font-semibold">
      依類別瀏覽，或到
      <Link
        href="/hub"
        className="text-[var(--color-clay-purple)] font-bold underline mx-1"
      >
        資源中心
      </Link>
      搜尋全部。
    </p>
  </div>
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
    {CATEGORY_ORDER.map((k) => (
      <CategoryEntryCard
        key={k}
        category={CATEGORIES[k]}
        count={loading ? 0 : counts[k]}
      />
    ))}
  </div>
</section>;
```

3e. **刪除**整個 `{/* ── TOOLS（Vercel Marketplace 風） ── */}` section（搜尋框 + type chip + scenario chip + grid + terminated 摺疊）。HERO 的兩個按鈕 href 把 `#tools` 改 `#catalog` 或 `/hub`。

3f. 保留 `§painpoints`（痛點卡）、`§feedback`（同仁回饋）、`§about`（CTA help）三段不動。

- [ ] **Step 4: build**

Run: `npm run build`
Expected: 成功，無 unused import / undefined var（移除的 state 引用要清乾淨）。

- [ ] **Step 5: 視覺實測**

`npm run dev` → `http://localhost:3000`：

1. HERO 下方出現 5 類別入口卡 + 正確計數；點卡片到 `/hub?cat=`。
2. metrics band 顯示「可用資源」數＝active 總數。
3. 痛點卡區、同仁回饋、提需求 CTA 都還在、正常。
4. 不再有舊「工具總覽」搜尋/grid（已移到 /hub）。

- [ ] **Step 6: Commit**

```bash
git add src/components/CategoryEntryCard.jsx src/components/MetricsBand.jsx app/page.jsx
git commit -m "feat(home): 首頁重構為 hub landing（5 類別入口 + metrics；工具總覽移至 /hub）

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

## Task 10: migration script migrate-category.mjs（建立 + dry-run，不 apply）

**Files:**

- Create: `scripts/migrate-category.mjs`

**做法：** 仿現有 `scripts/migrate-embedded-type.mjs` 結構（Admin SDK + 備份 + dry-run 預設）。為現有每筆 tools 補 `category`：`type==='mcp'` → mcp；`type` 已是 skill → skill；其餘預設 tool。platform/project 由人工清單指定（先留空 map，Jason 過目後填）。

- [ ] **Step 1: 先看既有 migration 範本**

Run: `cat scripts/migrate-embedded-type.mjs`
目的：照抄它的 Admin SDK 初始化、`--apply` 旗標、備份 collection 寫法，保持一致。

- [ ] **Step 2: 建立 `scripts/migrate-category.mjs`**

```js
// scripts/migrate-category.mjs
// 為現有 tools 補 category 欄位。預設 dry-run；--apply 才寫入。寫入前備份到 tools-backup-2026-06-01/。
// 映射：type==='mcp'→mcp；type==='skill'→skill；其餘→tool。platform/project 用 MANUAL_OVERRIDE 指定。
// ⚠️ 依 AGENTS.md：依賴 category 的 code 先 merge+deploy 成功才跑 --apply，跑完連 live 站驗證。
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "node:fs";

const APPLY = process.argv.includes("--apply");
const BACKUP = "tools-backup-2026-06-01";

// 人工指定（Jason 過目後填）：{ toolId: 'platform' | 'project' }
const MANUAL_OVERRIDE = {
  // 例：'t_xxx': 'platform',
};

const sa = JSON.parse(
  readFileSync(new URL("../serviceAccountKey.json", import.meta.url)),
);
initializeApp({ credential: cert(sa) });
const db = getFirestore();

function deriveCategory(data) {
  if (MANUAL_OVERRIDE[data.__id]) return MANUAL_OVERRIDE[data.__id];
  if (data.type === "mcp") return "mcp";
  if (data.type === "skill") return "skill";
  return "tool";
}

const snap = await db.collection("tools").get();
console.log(
  `tools 共 ${snap.size} 筆。模式：${APPLY ? "APPLY（會寫入）" : "DRY-RUN（只印）"}`,
);

let changed = 0;
for (const doc of snap.docs) {
  const data = { __id: doc.id, ...doc.data() };
  const target = deriveCategory(data);
  if (data.category === target) continue; // idempotent
  changed += 1;
  console.log(
    `  ${doc.id}: category ${data.category || "(無)"} → ${target}  [type=${data.type}]`,
  );
  if (APPLY) {
    await db.collection(BACKUP).doc(doc.id).set(doc.data()); // 備份原文件
    await doc.ref.update({ category: target });
  }
}
console.log(
  `${APPLY ? "已更新" : "將更新"} ${changed} 筆。${APPLY ? "備份於 " + BACKUP : "（dry-run，未寫入）"}`,
);
process.exit(0);
```

- [ ] **Step 3: dry-run**

Run: `node scripts/migrate-category.mjs`
Expected: 印出每筆 `category (無) → mcp/skill/tool` 的對應與「將更新 N 筆（dry-run，未寫入）」。**確認 mcp 工具被歸 mcp、其餘合理**。把印出的清單給 Jason 看，決定哪些要進 `MANUAL_OVERRIDE` 改 platform/project。

- [ ] **Step 4: Commit（只 commit script，不 apply）**

```bash
git add scripts/migrate-category.mjs
git commit -m "chore(scripts): 加 migrate-category.mjs（dry-run 預設 + 備份 + idempotent）

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

> **⚠️ `--apply` 不在本 plan 執行範圍。** 正確時序（人工，部署後）：
>
> 1. feature-hub-phase1 開 PR → review → merge main；
> 2. Vercel production deploy 成功；
> 3. （視需要先填 `MANUAL_OVERRIDE` 再）`node scripts/migrate-category.mjs --apply`；
> 4. **連 live 站驗證**：首頁「可用資源」數不掉、`/hub` 各 tab 計數正確。

---

## 完成後（整個 Phase 1）

- [ ] 全 task 完成後跑一次完整 `npm run build` + `npm run lint`，確認無錯。
- [ ] 對照 spec §7 驗收標準逐項打勾。
- [ ] 用 superpowers:finishing-a-development-branch 決定合併方式（建議開 PR）。
- [ ] merge + deploy 後，依 Task 10 註記跑 migration `--apply` 並驗 live 站。
- [ ] 收尾：`scripts/__verify-taxonomy.mjs` 可留作 sanity check 或刪除。

---

## Self-Review（plan 對照 spec）

- **§1 架構/路由**：Task 7（chrome）+ Task 8（/hub）+ Task 9（首頁）覆蓋；`/login` 不動；Phase 2/3 頁面明確不在本 plan。✅
- **§2.2 雙軸**：taxonomy.js（Task 1）同時定義 CATEGORIES + TYPES。✅
- **§2.3 typeData / skill 上傳**：Task 5（wizard skill 分支 + UploadButton pathPrefix="skills"）。✅
- **§2.5 migration**：Task 10（建立 + dry-run；--apply 為部署後人工步驟，含時序警告）。✅
- **§2.6 taxonomy 集中化**：Task 1 建立；Task 2/3/4/5 各面改 import。✅
- **§2.7 上傳 UX**：Task 4（dashboard 主選 category）+ Task 5（wizard category 下拉）。✅
- **§3 Phase 1 清單 1-9**：對應 Task 1-10（順序重排為安全增量）。✅
- **descHtml bug**：Task 3 Step 4。✅
- **型別一致性**：getCTA/getTabsForType/categoryCounts/TYPE_ACTION/TYPE_DATA_FIELDS 在 Task 1 定義，後續 task 引用名稱一致。✅
- **無 placeholder**：各 step 附實際程式碼或精確指令。MANUAL_OVERRIDE 留空是刻意（待 Jason 看 dry-run 後填），已註明。✅
