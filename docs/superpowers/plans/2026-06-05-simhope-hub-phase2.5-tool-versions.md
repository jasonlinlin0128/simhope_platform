# SimHope Hub Phase 2.5 — 工具版本歷史 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 每個工具有一份自己的版本歷史（版號 / 日期 / markdown 說明 / 每版下載檔），單一真相 `tool.versions[]`，前台詳情頁「🕒 版本」tab 呈現，作者與 admin 用同一個 `VersionEditor` 編輯。

**Architecture:** 資料只放在 `tools/{id}.versions` 陣列（舊→新，`at(-1)`＝目前版）。純函式 helper（`src/lib/versions.js`）給所有讀取端共用；一個共用編輯元件（`VersionEditor`）嵌進「詳情頁編輯模式」與「admin 審核 wizard」；一個顯示元件（`VersionHistory`）給詳情頁 tab。三處下載來源（詳情頁快速安裝 tab、sidebar 下載鈕、卡片 `getCTA`）改以 `versions.at(-1).fileUrl` 為最優先、舊欄位 fallback。idempotent migration 把現有 `typeData.version`/檔塞成 `versions[0]`。

**Tech Stack:** Next.js 16 (App Router) + React 19 + Firebase (Firestore client + firebase-admin migration) + Tailwind 4 + react-markdown/remark-gfm。**本專案無單元測試框架**（package.json 只有 `build` / `lint`）；純邏輯用 `node scripts/__verify-*.mjs` 斷言驗證，UI 用 `npm run build` + `npm run lint` + 目視 preview 驗證（沿用既有慣例）。

**Spec:** `docs/superpowers/specs/2026-06-05-simhope-hub-phase2.5-tool-versions-design.md`

---

## File Structure

**新增：**

- `src/lib/versions.js` — 純函式：`latestVersion` / `latestVersionLabel` / `lastUpdatedDate` / `blankVersionRow`。無 React、無 Firebase，可被 node 斷言。
- `src/components/VersionEditor.jsx` — 共用編輯元件（受控）。detail 頁與 wizard 共用。
- `src/components/VersionHistory.jsx` — 前台顯示元件（新→舊列表）。
- `scripts/__verify-versions.mjs` — 純函式斷言（versions.js + getCTA versions 行為）。
- `scripts/migrate-tool-versions.mjs` — idempotent migration（dry-run 預設 + 自動備份）。

**修改：**

- `src/lib/taxonomy.js` — `getCTA` 把 `versions.at(-1).fileUrl` 設為 download/doc/skill 最優先下載來源。
- `app/tool/[id]/page.jsx` — `localVersions` state、編輯模式嵌 `VersionEditor`、版本 tab + `VersionHistory`、快速安裝 tab + sidebar 改讀最新版、儲存寫 `versions`。
- `src/components/ReviewToolWizard.jsx` — 嵌 `VersionEditor`、移除 download/doc/skill 的 `version`/`fileUrl`/`skillZipUrl` 欄、儲存寫 `versions`、AI 預填不再寫這些欄。

**依賴順序（給 workflow fan-out 參考）：** Task 1 → (Task 2, Task 3, Task 4 可平行) → (Task 5, Task 6 依賴 1/3/4，可平行) → Task 7（獨立，可早做）→ Task 8（最後）。

---

## Task 1: `src/lib/versions.js` 純函式 helper

**Files:**

- Create: `src/lib/versions.js`
- Test: `scripts/__verify-versions.mjs`（本 task 先建 versions 區塊，Task 2 再補 getCTA 區塊）

- [ ] **Step 1: 寫 helper**

Create `src/lib/versions.js`:

```js
// src/lib/versions.js
// versions[] 純函式（無 React / 無 Firebase，可被 node 斷言）。
// 單一真相：tool.versions 陣列，順序舊→新，at(-1)=目前版。

/** 目前版（陣列最後一筆）。無版本回 null。 */
export function latestVersion(tool) {
  const vs = tool?.versions;
  return Array.isArray(vs) && vs.length ? vs[vs.length - 1] : null;
}

/** 目前版號字串（給「版本：」標籤）。fallback 舊 typeData.version；都無回空字串。 */
export function latestVersionLabel(tool) {
  return latestVersion(tool)?.version || tool?.typeData?.version || "";
}

/** 最後更新日期（YYYY-MM-DD）。無則回 null（呼叫端可再退 updatedAt）。 */
export function lastUpdatedDate(tool) {
  return latestVersion(tool)?.date || null;
}

/** 新版本列的預設值；date 由呼叫端傳今天（避免在純函式裡用 new Date 不可測）。 */
export function blankVersionRow(todayYMD) {
  return { version: "", date: todayYMD || "", notes: "", fileUrl: "" };
}
```

- [ ] **Step 2: 寫斷言腳本（versions 區塊）**

Create `scripts/__verify-versions.mjs`:

```js
// scripts/__verify-versions.mjs — 純函式 sanity check（無框架，直接 node 跑）
import assert from "node:assert";
import {
  latestVersion,
  latestVersionLabel,
  lastUpdatedDate,
  blankVersionRow,
} from "../src/lib/versions.js";

// ── versions.js ──
assert.equal(latestVersion({}), null);
assert.equal(latestVersion({ versions: [] }), null);
assert.deepEqual(
  latestVersion({ versions: [{ version: "v1" }, { version: "v2" }] }),
  { version: "v2" },
);
assert.equal(
  latestVersionLabel({ versions: [{ version: "v1" }, { version: "v2" }] }),
  "v2",
);
// 空 versions → fallback typeData.version
assert.equal(latestVersionLabel({ typeData: { version: "v9" } }), "v9");
assert.equal(latestVersionLabel({}), "");
assert.equal(
  lastUpdatedDate({
    versions: [{ date: "2026-01-01" }, { date: "2026-06-05" }],
  }),
  "2026-06-05",
);
assert.equal(lastUpdatedDate({}), null);
assert.deepEqual(blankVersionRow("2026-06-05"), {
  version: "",
  date: "2026-06-05",
  notes: "",
  fileUrl: "",
});

console.log("✅ versions verify passed");
```

- [ ] **Step 3: 跑斷言，確認過**

Run: `node scripts/__verify-versions.mjs`
Expected: `✅ versions verify passed`

- [ ] **Step 4: Commit**

```bash
git add src/lib/versions.js scripts/__verify-versions.mjs
git commit -m "feat(versions): versions[] 純函式 helper + node 斷言

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

## Task 2: `getCTA` 把 versions.at(-1).fileUrl 設為最優先下載來源

**Files:**

- Modify: `src/lib/taxonomy.js`（`getCTA`，約 106–195）
- Test: `scripts/__verify-versions.mjs`（補 getCTA 區塊）

**Why:** 卡片 `getCTA` 原本完全沒讀 versions[]，會與詳情頁下載不一致（spec §3、§9.1）。

- [ ] **Step 1: 改 `getCTA`**

In `src/lib/taxonomy.js`, find the start of `getCTA`:

```js
export function getCTA(tool) {
  const { type = "webapp", status, url, id, typeData = {} } = tool;
```

Replace with（多解構 `versions`，並算出最優先檔連結）:

```js
export function getCTA(tool) {
  const { type = "webapp", status, url, id, typeData = {}, versions } = tool;
  const latestFileUrl = Array.isArray(versions) && versions.length
    ? versions[versions.length - 1].fileUrl
    : undefined;
```

- [ ] **Step 2: skill 分支改吃最新版檔**

Find（skill 分支內）:

```js
  if (type === "skill") {
    const zip = typeData.skillZipUrl || url;
```

Replace with:

```js
  if (type === "skill") {
    const zip = latestFileUrl || typeData.skillZipUrl || url;
```

- [ ] **Step 3: download/doc/api 等一般分支改吃最新版檔**

Find（函式尾段）:

```js
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
```

Replace with（用 `dlUrl` = 最新版檔優先，再 fallback url）:

```js
  const dlUrl = latestFileUrl || url;
  if (!dlUrl) {
    return {
      label: "👀 看詳情 →",
      href: `/tool/${id}`,
      cls: "bg-gray-300 text-gray-700 hover:bg-gray-400",
      disabled: false,
    };
  }
  return {
    ...base,
    href: dlUrl,
    external: ["webapp", "download", "doc", "api"].includes(type),
    disabled: false,
  };
}
```

- [ ] **Step 4: 補斷言（getCTA 區塊）**

Append to `scripts/__verify-versions.mjs`（在 `console.log` 之前插入）:

```js
// ── getCTA × versions ──
import { getCTA } from "../src/lib/taxonomy.js";

// download：最新版 fileUrl 優先於舊 url
const dl = getCTA({
  type: "download",
  status: "live",
  id: "x",
  url: "https://old/legacy.exe",
  versions: [
    { version: "v1", fileUrl: "https://old/v1.exe" },
    { version: "v2", fileUrl: "https://new/v2.exe" },
  ],
});
assert.equal(dl.href, "https://new/v2.exe");

// download：versions 為空 → fallback 舊 url（不迴歸）
assert.equal(
  getCTA({
    type: "download",
    status: "live",
    id: "x",
    url: "https://old/legacy.exe",
  }).href,
  "https://old/legacy.exe",
);

// skill：最新版 fileUrl 優先於 typeData.skillZipUrl
const sk = getCTA({
  type: "skill",
  status: "live",
  id: "x",
  typeData: { skillZipUrl: "https://z/old.zip" },
  versions: [{ version: "v1", fileUrl: "https://z/new.zip" }],
});
assert.equal(sk.href, "https://z/new.zip");

// skill：versions 空 → fallback skillZipUrl（不迴歸）
assert.equal(
  getCTA({
    type: "skill",
    status: "live",
    id: "x",
    typeData: { skillZipUrl: "https://z/old.zip" },
  }).href,
  "https://z/old.zip",
);
```

- [ ] **Step 5: 跑兩支斷言**

Run: `node scripts/__verify-versions.mjs` → Expected: `✅ versions verify passed`
Run: `node scripts/__verify-taxonomy.mjs` → Expected: `✅ taxonomy verify passed`（確認既有 getCTA 行為無迴歸）

- [ ] **Step 6: Commit**

```bash
git add src/lib/taxonomy.js scripts/__verify-versions.mjs
git commit -m "feat(versions): getCTA 以最新版 fileUrl 為最優先下載來源

卡片下載與詳情頁一致；versions 空時 fallback 舊欄位不迴歸。

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

## Task 3: `VersionEditor` 共用編輯元件

**Files:**

- Create: `src/components/VersionEditor.jsx`

- [ ] **Step 1: 寫元件**

Create `src/components/VersionEditor.jsx`:

```jsx
"use client";

import UploadButton from "@/components/UploadButton";
import { blankVersionRow } from "@/lib/versions";

// 哪些 type 的版本要綁下載檔（顯示上傳欄）→ Storage pathPrefix
const FILE_TYPES = { download: "downloads", doc: "docs", skill: "skills" };

/**
 * 版本歷史編輯器（受控）。detail 頁編輯模式與 admin wizard 共用。
 * @param {{ versions: object[], type: string, onChange: (next:object[])=>void, todayYMD: string }} props
 */
export default function VersionEditor({
  versions = [],
  type = "webapp",
  onChange,
  todayYMD,
}) {
  const filePrefix = FILE_TYPES[type]; // undefined = 此 type 不綁檔，不顯示上傳欄

  const setRow = (idx, patch) =>
    onChange(versions.map((v, i) => (i === idx ? { ...v, ...patch } : v)));
  const delRow = (idx) => onChange(versions.filter((_, i) => i !== idx));
  const moveRow = (idx, dir) => {
    const t = idx + dir;
    if (t < 0 || t >= versions.length) return;
    const next = [...versions];
    [next[idx], next[t]] = [next[t], next[idx]];
    onChange(next);
  };
  const addRow = () => onChange([...versions, blankVersionRow(todayYMD)]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h4 className="font-extrabold text-sm text-[var(--color-text-dark)]">
          🕒 版本歷史
        </h4>
        <span className="text-xs text-[var(--color-text-mid)]">
          最後一筆＝目前版（驅動下載與最新版號）
        </span>
      </div>

      {versions.length === 0 && (
        <p className="text-sm text-[var(--color-text-mid)] italic">
          還沒有版本。點下方「＋ 新增版本」加第一版。
        </p>
      )}

      {versions.map((v, idx) => (
        <div
          key={idx}
          className="border border-[var(--color-card-border)] rounded-2xl p-3 flex flex-col gap-2"
        >
          <div className="flex gap-2 items-center flex-wrap">
            <input
              value={v.version || ""}
              onChange={(e) => setRow(idx, { version: e.target.value })}
              placeholder="版本號 v1.0"
              className="w-28 bg-[var(--color-card-bg)] text-[var(--color-text-dark)] border border-[var(--color-card-border)] rounded-lg px-2 py-1.5 text-sm font-bold outline-none focus:border-[var(--color-clay-purple)]"
            />
            <input
              type="date"
              value={v.date || ""}
              onChange={(e) => setRow(idx, { date: e.target.value })}
              className="bg-[var(--color-card-bg)] text-[var(--color-text-dark)] border border-[var(--color-card-border)] rounded-lg px-2 py-1.5 text-sm outline-none focus:border-[var(--color-clay-purple)]"
            />
            {idx === versions.length - 1 && (
              <span className="text-xs font-bold text-[var(--color-clay-purple)] bg-[var(--color-clay-purple)]/10 rounded-full px-2 py-0.5">
                目前版
              </span>
            )}
            <div className="flex gap-1 ml-auto">
              <button
                type="button"
                onClick={() => moveRow(idx, -1)}
                disabled={idx === 0}
                className="w-7 h-7 rounded-lg bg-gray-100 text-gray-500 hover:bg-gray-200 disabled:opacity-25 text-sm"
                title="上移"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => moveRow(idx, 1)}
                disabled={idx === versions.length - 1}
                className="w-7 h-7 rounded-lg bg-gray-100 text-gray-500 hover:bg-gray-200 disabled:opacity-25 text-sm"
                title="下移"
              >
                ↓
              </button>
              <button
                type="button"
                onClick={() => delRow(idx)}
                className="w-7 h-7 rounded-lg bg-red-50 text-red-400 hover:bg-red-100 text-sm"
                title="刪除此版"
              >
                ✕
              </button>
            </div>
          </div>

          <textarea
            value={v.notes || ""}
            onChange={(e) => setRow(idx, { notes: e.target.value })}
            placeholder="更新說明（支援 markdown）"
            rows={2}
            className="w-full bg-[var(--color-card-bg)] text-[var(--color-text-dark)] border border-[var(--color-card-border)] rounded-lg px-2 py-1.5 text-sm outline-none focus:border-[var(--color-clay-purple)] resize-y"
          />

          {filePrefix && (
            <div className="flex gap-2 items-center">
              <input
                value={v.fileUrl || ""}
                onChange={(e) => setRow(idx, { fileUrl: e.target.value })}
                placeholder="此版下載連結 URL"
                className="flex-1 bg-[var(--color-card-bg)] text-[var(--color-text-dark)] border border-[var(--color-card-border)] rounded-lg px-2 py-1.5 text-sm font-mono outline-none focus:border-[var(--color-clay-purple)]"
              />
              <UploadButton
                pathPrefix={filePrefix}
                accept={type === "skill" ? ".zip,application/zip" : undefined}
                onUploaded={(url) => setRow(idx, { fileUrl: url })}
              />
            </div>
          )}
        </div>
      ))}

      <button
        type="button"
        onClick={addRow}
        className="self-start text-sm font-bold text-[var(--color-clay-purple)] border border-[var(--color-clay-purple)]/30 rounded-full px-3 py-1.5 hover:bg-[var(--color-clay-purple)]/5"
      >
        ＋ 新增版本
      </button>
    </div>
  );
}
```

- [ ] **Step 2: build + lint（無 runtime 測試框架，先確保可編譯）**

Run: `npm run lint`
Expected: 無 error（warning 容許）。

- [ ] **Step 3: Commit**

```bash
git add src/components/VersionEditor.jsx
git commit -m "feat(versions): VersionEditor 共用版本編輯元件

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

## Task 4: `VersionHistory` 前台顯示元件

**Files:**

- Create: `src/components/VersionHistory.jsx`

- [ ] **Step 1: 寫元件**

Create `src/components/VersionHistory.jsx`:

```jsx
"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * 版本歷史顯示（新→舊）。詳情頁「🕒 版本」tab 用。
 * @param {{ versions: object[] }} props
 */
export default function VersionHistory({ versions = [] }) {
  if (!versions.length) {
    return (
      <p className="text-center py-10 text-[var(--color-text-mid)] italic">
        這個工具還沒有版本紀錄。
      </p>
    );
  }

  const newestFirst = [...versions].reverse();
  const latest = newestFirst[0];

  return (
    <div className="flex flex-col gap-6">
      {latest?.date && (
        <p className="text-sm text-[var(--color-text-mid)] font-bold">
          最後更新：{latest.date}
        </p>
      )}
      {newestFirst.map((v, i) => (
        <div
          key={i}
          className="border-l-2 border-[var(--color-clay-purple)]/30 pl-4 flex flex-col gap-2"
        >
          <div className="flex items-center gap-3 flex-wrap">
            <span className="px-3 py-1 rounded-lg bg-[var(--color-clay-purple)]/10 text-[var(--color-clay-purple)] font-black text-sm">
              {v.version || "（未填版號）"}
            </span>
            {v.date && (
              <span className="text-sm text-[var(--color-text-mid)] font-bold">
                {v.date}
              </span>
            )}
            {i === 0 && (
              <span className="text-xs font-bold text-green-600 bg-green-50 dark:bg-green-900/20 rounded-full px-2 py-0.5">
                最新
              </span>
            )}
          </div>
          {v.notes && (
            <div className="text-sm text-[var(--color-text-dark)] font-medium [&_p]:mb-1 [&_ul]:list-disc [&_ul]:ml-5 [&_a]:text-[var(--color-clay-blue)] [&_a]:underline">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {v.notes}
              </ReactMarkdown>
            </div>
          )}
          {v.fileUrl && (
            <a
              href={v.fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="self-start inline-block px-4 py-2 rounded-lg bg-[var(--color-clay-purple)]/10 text-[var(--color-clay-purple)] font-bold text-sm border border-[var(--color-clay-purple)]/30 hover:bg-[var(--color-clay-purple)]/20"
            >
              ⬇️ 下載此版
            </a>
          )}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: lint**

Run: `npm run lint`
Expected: 無 error。

- [ ] **Step 3: Commit**

```bash
git add src/components/VersionHistory.jsx
git commit -m "feat(versions): VersionHistory 前台版本顯示元件

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

## Task 5: 詳情頁整合（state / 編輯模式 / 版本 tab / 下載讀最新版）

**Files:**

- Modify: `app/tool/[id]/page.jsx`

依賴：Task 1（versions.js）、Task 3（VersionEditor）、Task 4（VersionHistory）。

- [ ] **Step 1: 加 import**

Find:

```js
import { TYPE_ACTION, getTabsForType, defaultTabForType } from "@/lib/taxonomy";
import Accordion from "@/components/Accordion";
```

Replace with:

```js
import { TYPE_ACTION, getTabsForType, defaultTabForType } from "@/lib/taxonomy";
import Accordion from "@/components/Accordion";
import VersionEditor from "@/components/VersionEditor";
import VersionHistory from "@/components/VersionHistory";
import { latestVersionLabel } from "@/lib/versions";
```

- [ ] **Step 2: 加 state + todayYMD**

Find:

```js
const [localBlocks, setLocalBlocks] = useState([]);
const [localExtras, setLocalExtras] = useState({ url: "", type: "webapp" });
```

Replace with:

```js
const [localBlocks, setLocalBlocks] = useState([]);
const [localExtras, setLocalExtras] = useState({ url: "", type: "webapp" });
const [localVersions, setLocalVersions] = useState([]);
const todayYMD = new Date().toISOString().slice(0, 10);
```

- [ ] **Step 3: fetchTool 載入 versions**

Find:

```js
setLocalBlocks(blocks);
setLocalExtras({ url: data.url || "", type: data.type || "webapp" });
```

Replace with:

```js
setLocalBlocks(blocks);
setLocalExtras({ url: data.url || "", type: data.type || "webapp" });
setLocalVersions(Array.isArray(data.versions) ? data.versions : []);
```

- [ ] **Step 4: handleSave 寫入 versions**

Find:

```js
await updateDoc(doc(db, "tools", id), {
  blog: { ...tool.blog, blocks: localBlocks },
  url: localExtras.url,
  type: localExtras.type,
  updatedAt: new Date(),
});
```

Replace with:

```js
await updateDoc(doc(db, "tools", id), {
  blog: { ...tool.blog, blocks: localBlocks },
  url: localExtras.url,
  type: localExtras.type,
  versions: localVersions,
  updatedAt: new Date(),
});
```

- [ ] **Step 5: 取消編輯時還原 versions**

Find（取消按鈕的 onClick）:

```js
                onClick={() => {
                    setIsEditMode(false);
                    setLocalBlocks(
                      (tool.blog?.blocks || []).map((b) =>
                        b.id ? b : { ...b, id: crypto.randomUUID() },
                      ),
                    );
                  }}
```

Replace with:

```js
                onClick={() => {
                    setIsEditMode(false);
                    setLocalBlocks(
                      (tool.blog?.blocks || []).map((b) =>
                        b.id ? b : { ...b, id: crypto.randomUUID() },
                      ),
                    );
                    setLocalVersions(
                      Array.isArray(tool.versions) ? tool.versions : [],
                    );
                  }}
```

- [ ] **Step 6: DetailTabs 動態插入版本 tab + 渲染 VersionHistory**

In `DetailTabs`, find:

```js
// 依 type 決定 tabs
const tabs = getTabsForType(type);
```

Replace with:

```js
// 依 type 決定 tabs；有版本紀錄才追加「🕒 版本」tab
const tabs = [...getTabsForType(type)];
if (tool.versions?.length) tabs.push({ key: "versions", label: "🕒 版本" });
```

Then find the tab content block:

```js
      {activeKey === "detail" && <DetailTab tool={tool} blocks={blocks} />}
    </div>
  );
}
```

Replace with:

```js
      {activeKey === "detail" && <DetailTab tool={tool} blocks={blocks} />}
      {activeKey === "versions" && (
        <VersionHistory versions={tool.versions || []} />
      )}
    </div>
  );
}
```

- [ ] **Step 7: 快速安裝 tab（download/doc）下載連結與版號改讀最新版**

In `QuickInstallTab`, find:

```js
// download / doc 共用
const url = tool.url || td.fileUrl || tool.versions?.at(-1)?.fileUrl || "";
```

Replace with（最新版檔最優先）:

```js
// download / doc 共用 — 最新版檔最優先，再 fallback 舊欄位
const url = tool.versions?.at(-1)?.fileUrl || tool.url || td.fileUrl || "";
```

Then find（download/doc 版號標籤）:

```js
      {td.version && (
        <p className="text-sm text-[var(--color-text-mid)]">
          <strong>版本：</strong>
          {td.version}
        </p>
      )}
    </div>
  );
}
```

Replace with:

```js
      {latestVersionLabel(tool) && (
        <p className="text-sm text-[var(--color-text-mid)]">
          <strong>版本：</strong>
          {latestVersionLabel(tool)}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 8: 快速安裝 tab（skill）下載連結與版號改讀最新版**

In `QuickInstallTab`, find（skill 分支）:

```js
  if (type === "skill") {
    const zip = td.skillZipUrl || tool.url || "";
    const installPath = td.installPath || "~/.claude/skills/";
```

Replace with:

```js
  if (type === "skill") {
    const zip = tool.versions?.at(-1)?.fileUrl || td.skillZipUrl || tool.url || "";
    const installPath = td.installPath || "~/.claude/skills/";
```

Then find（skill 版號標籤）:

```js
{
  td.version && (
    <p className="text-sm text-[var(--color-text-mid)] mt-3">
      <strong>版本：</strong>
      {td.version}
    </p>
  );
}
```

Replace with:

```js
{
  latestVersionLabel(tool) && (
    <p className="text-sm text-[var(--color-text-mid)] mt-3">
      <strong>版本：</strong>
      {latestVersionLabel(tool)}
    </p>
  );
}
```

- [ ] **Step 9: sidebar 下載鈕（download）改讀最新版**

In the main component sidebar, find:

```js
const url =
  tool.type === "download"
    ? tool.url || tool.typeData?.fileUrl || tool.versions?.at(-1)?.fileUrl || ""
    : tool.url;
```

Replace with（最新版檔最優先）:

```js
const url =
  tool.type === "download"
    ? tool.versions?.at(-1)?.fileUrl || tool.url || tool.typeData?.fileUrl || ""
    : tool.url;
```

- [ ] **Step 10: 編輯模式嵌入 VersionEditor**

In the edit-mode `<main>` block, find the closing of the add-block buttons div followed by the fragment close:

```jsx
                  {Object.entries(BLOCK_DEFS).map(([key, def]) => (
                    <button
                      key={key}
                      onClick={() => addBlock(key)}
                      className={`text-xs font-bold border rounded-full px-3 py-1.5 hover:opacity-80 transition-all ${def.badge}`}
                    >
                      {def.label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : (
```

Replace with（在 block 區塊後加版本編輯區）:

```jsx
                  {Object.entries(BLOCK_DEFS).map(([key, def]) => (
                    <button
                      key={key}
                      onClick={() => addBlock(key)}
                      className={`text-xs font-bold border rounded-full px-3 py-1.5 hover:opacity-80 transition-all ${def.badge}`}
                    >
                      {def.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-10 pt-8 border-t-2 border-[var(--color-clay-purple)]/20">
                <VersionEditor
                  versions={localVersions}
                  type={localExtras.type}
                  onChange={setLocalVersions}
                  todayYMD={todayYMD}
                />
              </div>
            </>
          ) : (
```

- [ ] **Step 11: build + lint**

Run: `npm run build`
Expected: build 成功（無 error）。
Run: `npm run lint`
Expected: 無 error。

- [ ] **Step 12: 目視 preview（手動）**

Run: `npm run dev`，以 admin / 作者身分開一個 download 型工具詳情頁：

- 進編輯模式 → 看到「🕒 版本歷史」編輯區 → 新增一版（版號 + 日期 + 說明 + 上傳檔）→ 儲存。
- 重整 → 出現「🕒 版本」tab，內容新→舊、可下載；sidebar 下載鈕指向最新版檔。
- 開一個沒有版本的 webapp 工具 → 不應出現「🕒 版本」tab；編輯模式仍可看到版本編輯區（0 筆）。
- 既有 block 編輯 / 儲存 / 取消正常（無迴歸）。

- [ ] **Step 13: Commit**

```bash
git add app/tool/[id]/page.jsx
git commit -m "feat(versions): 詳情頁整合版本歷史（編輯區/版本 tab/下載讀最新版）

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

## Task 6: admin wizard 整合（嵌 VersionEditor、拔 legacy 版本欄、寫 versions）

**Files:**

- Modify: `src/components/ReviewToolWizard.jsx`

依賴：Task 1、Task 3。

- [ ] **Step 1: 加 import**

Find（檔案頂部）:

```js
import { typeBadge, getCTA } from "@/lib/taxonomy";
```

> 註：實際 import 行可能不同，找到 wizard 既有的 import 區塊，於其後加入下行即可。

Add（在既有 import 區塊末尾）:

```js
import VersionEditor from "@/components/VersionEditor";
```

- [ ] **Step 2: form state 加 versions + todayYMD**

Find:

```js
    // typeData 動態欄位
    typeData: { ...(tool.typeData || {}) },
    status: tool.status || "pending",
  });
```

Replace with:

```js
    // typeData 動態欄位
    typeData: { ...(tool.typeData || {}) },
    versions: Array.isArray(tool.versions) ? tool.versions : [],
    status: tool.status || "pending",
  });

  const todayYMD = new Date().toISOString().slice(0, 10);
```

- [ ] **Step 3: handleSaveOnly payload 寫入 versions**

Find:

```js
        desc: form.desc,
        typeData: form.typeData,
        blog: { ...(tool.blog || {}), summary: form.blogSummary },
        updatedAt: serverTimestamp(),
```

Replace with:

```js
        desc: form.desc,
        typeData: form.typeData,
        versions: form.versions,
        blog: { ...(tool.blog || {}), summary: form.blogSummary },
        updatedAt: serverTimestamp(),
```

- [ ] **Step 4: AI 預填不再寫 version/fileUrl/skillZipUrl（避免重新汙染 typeData）**

Find（handleEnrich 的 setForm）:

```js
        typeData: { ...prev.typeData, ...(r.typeData || {}) },
      }));
```

Replace with（過濾掉已移轉到 versions[] 的欄位）:

```js
        typeData: (() => {
          const incoming = { ...(r.typeData || {}) };
          delete incoming.version;
          delete incoming.fileUrl;
          delete incoming.skillZipUrl;
          return { ...prev.typeData, ...incoming };
        })(),
      }));
```

- [ ] **Step 5: 在 typeData 區塊後嵌入 VersionEditor**

Find:

```jsx
{
  /* typeData — 依 type 不同 */
}
<div className="bg-[var(--color-card-bg)]/50 border border-dashed border-[var(--color-clay-purple)]/30 rounded-2xl p-4">
  <h4 className="font-extrabold text-sm text-[var(--color-text-dark)] mb-3">
    🔧 類型專屬欄位 (typeData) — 依目前類型 [{TYPES[form.type]?.label}]
  </h4>
  <TypeDataEditor type={form.type} td={form.typeData} updateTd={updateTd} />
</div>;
```

Replace with（後面接一塊版本編輯區）:

```jsx
{
  /* typeData — 依 type 不同 */
}
<div className="bg-[var(--color-card-bg)]/50 border border-dashed border-[var(--color-clay-purple)]/30 rounded-2xl p-4">
  <h4 className="font-extrabold text-sm text-[var(--color-text-dark)] mb-3">
    🔧 類型專屬欄位 (typeData) — 依目前類型 [{TYPES[form.type]?.label}]
  </h4>
  <TypeDataEditor type={form.type} td={form.typeData} updateTd={updateTd} />
</div>;

{
  /* 版本歷史（單一真相 versions[]，與詳情頁同一編輯器） */
}
<div className="bg-[var(--color-card-bg)]/50 border border-dashed border-[var(--color-clay-purple)]/30 rounded-2xl p-4">
  <VersionEditor
    versions={form.versions}
    type={form.type}
    onChange={(next) => update({ versions: next })}
    todayYMD={todayYMD}
  />
</div>;
```

- [ ] **Step 6: 拔掉 download 的 fileUrl + version 欄（保留 platform / fileName）**

In `TypeDataEditor`, find the download branch's `fileUrl` 與 `version` FormField:

```jsx
        <FormField label="fileUrl（檔案實際下載連結）">
          <div className="flex gap-2">
            <input
              value={td.fileUrl || ""}
              onChange={(e) => updateTd({ fileUrl: e.target.value })}
              className="flex-1 bg-gray-50 dark:bg-gray-700 p-2 rounded-lg border border-gray-200 dark:border-gray-600 text-sm font-mono"
            />
            <UploadButton
              pathPrefix="downloads"
              onUploaded={(url) => updateTd({ fileUrl: url })}
            />
          </div>
        </FormField>
        <FormField label="platform">
```

Replace with（移除 fileUrl 欄，保留 platform 欄起頭）:

```jsx
        <FormField label="platform">
```

Then find（download 的 version 欄）:

```jsx
        <FormField label="version">
          <input
            value={td.version || ""}
            onChange={(e) => updateTd({ version: e.target.value })}
            placeholder="v1.2.0"
            className="w-full bg-gray-50 dark:bg-gray-700 p-2 rounded-lg border border-gray-200 dark:border-gray-600 text-sm"
          />
        </FormField>
        <FormField label="fileName">
```

Replace with（移除 version 欄，保留 fileName 欄起頭）:

```jsx
        <FormField label="fileName">
```

- [ ] **Step 7: 拔掉 doc 的 fileUrl + version 欄（保留 fileType / fileName）**

In the doc branch, find:

```jsx
        <FormField label="fileUrl">
          <div className="flex gap-2">
            <input
              value={td.fileUrl || ""}
              onChange={(e) => updateTd({ fileUrl: e.target.value })}
              className="flex-1 bg-gray-50 dark:bg-gray-700 p-2 rounded-lg border border-gray-200 dark:border-gray-600 text-sm font-mono"
            />
            <UploadButton
              pathPrefix="docs"
              onUploaded={(url) => updateTd({ fileUrl: url })}
            />
          </div>
        </FormField>
        <FormField label="fileType">
```

Replace with:

```jsx
        <FormField label="fileType">
```

Then find（doc 的 version 欄）:

```jsx
        <FormField label="version">
          <input
            value={td.version || ""}
            onChange={(e) => updateTd({ version: e.target.value })}
            placeholder="v2026.05"
            className="w-full bg-gray-50 dark:bg-gray-700 p-2 rounded-lg border border-gray-200 dark:border-gray-600 text-sm"
          />
        </FormField>
        <FormField label="fileName">
```

Replace with:

```jsx
        <FormField label="fileName">
```

- [ ] **Step 8: 拔掉 skill 的 skillZipUrl + version 欄（保留 installPath）**

In the skill branch, find:

```jsx
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
```

Replace with（兩欄都移除，保留 installPath 起頭）:

```jsx
        <FormField label="installPath">
```

- [ ] **Step 9: 檢查 UploadButton import 是否仍有用到**

Run: `npx eslint src/components/ReviewToolWizard.jsx`
若報 `UploadButton` 已 unused（download/doc/skill 的 UploadButton 都拔了），把該 import 移除；
mcp/api 分支若仍用 UploadButton 則保留。確認 lint 乾淨。

- [ ] **Step 10: build + lint**

Run: `npm run build` → Expected: 成功。
Run: `npm run lint` → Expected: 無 error。

- [ ] **Step 11: 目視 preview（手動）**

`npm run dev`，admin 後台對一個 pending download 工具開 wizard：

- 看到「🕒 版本歷史」編輯區，且 typeData 區塊**已無** fileUrl / version 欄（platform / fileName 仍在）。
- 新增 v1.0 + 上傳檔 + 說明 → 存檔 → Firestore 該工具 `versions` 有一筆、`typeData` 無 version/fileUrl 新值。
- mcp / api 工具的 config 欄位正常；webapp 工具版本編輯區無上傳欄。

- [ ] **Step 12: Commit**

```bash
git add src/components/ReviewToolWizard.jsx
git commit -m "feat(versions): wizard 嵌 VersionEditor、拔 legacy 版本欄、寫 versions

download/doc/skill 的 version/fileUrl/skillZipUrl 由 versions[] 取代；
保留 platform/fileType/fileName/installPath；AI 預填不再寫這些欄。

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

## Task 7: Migration `scripts/migrate-tool-versions.mjs`

**Files:**

- Create: `scripts/migrate-tool-versions.mjs`

依賴：無（純資料；但 `--apply` 必須等 Task 1–6 的 code 先 merge + deploy，見 §部署順序）。

- [ ] **Step 1: 寫 migration（仿 `migrate-types.mjs` 樣板）**

Create `scripts/migrate-tool-versions.mjs`:

```js
/**
 * migrate-tool-versions.mjs
 *
 * 一次性遷移：把現有 typeData.version + 既有下載檔塞成 versions[0]，
 * 讓「工具版本歷史」（Phase 2.5）有起始資料。idempotent、可重跑。
 * 對照 docs/superpowers/specs/2026-06-05-simhope-hub-phase2.5-tool-versions-design.md
 *
 * === 使用方式 ===
 *   node scripts/migrate-tool-versions.mjs            # dry-run，印 diff，不寫
 *   node scripts/migrate-tool-versions.mjs --apply    # 實際寫入（先備份）
 *
 * === 規則 ===
 *  - 已有 versions（≥1 筆）→ skip（idempotent）
 *  - 有 legacy 版本訊號（typeData.version 或 typeData.fileUrl/skillZipUrl/
 *    download 的 tool.url）→ seed 單筆 versions[0]
 *  - 純 webapp / 無訊號 → 留 versions: []，不捏造
 *  - 不刪 typeData.version（留 legacy fallback）
 *
 * === 部署順序鐵律（AGENTS.md）===
 *  讀 versions[] 的新 code 先 merge + production deploy 綠燈 → 才跑 --apply → 連 live 驗證。
 */

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serviceAccount = JSON.parse(
  readFileSync(join(__dirname, "..", "serviceAccountKey.json"), "utf8"),
);

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const DRY_RUN = !process.argv.includes("--apply");
// 備份 collection 用執行當天日期（避免硬編，跑時帶入）
const BACKUP_DATE = new Date().toISOString().slice(0, 10);
const BACKUP_COLLECTION = `tools-backup-${BACKUP_DATE}`;

// Firestore Timestamp / Date / string / {_seconds} → "YYYY-MM-DD"，無法判定回 ""
function toYMD(ts) {
  if (!ts) return "";
  let d = null;
  if (typeof ts.toDate === "function") d = ts.toDate();
  else if (ts instanceof Date) d = ts;
  else if (typeof ts === "string") d = new Date(ts);
  else if (typeof ts._seconds === "number") d = new Date(ts._seconds * 1000);
  if (!d || isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

// 回傳要寫入的 versions 陣列；不需動就回 null
function computeVersions(tool) {
  const vs = tool.versions;
  if (Array.isArray(vs) && vs.length) return null; // 已有 → skip
  const td = tool.typeData || {};
  const file =
    td.fileUrl ||
    td.skillZipUrl ||
    (tool.type === "download" ? tool.url : undefined);
  const hasSignal = Boolean(td.version || file);
  if (!hasSignal) return null; // 無訊號 → 留 []
  const row = {
    version: td.version || "v1.0",
    date: toYMD(tool.createdAt || tool.updatedAt),
    notes: "",
  };
  if (file) row.fileUrl = file;
  return [row];
}

async function main() {
  console.log(`\n=== migrate-tool-versions.mjs ===`);
  console.log(
    `模式：${DRY_RUN ? "DRY-RUN（不會寫 Firestore）" : "APPLY（會實際寫入）"}`,
  );
  console.log(`備份 collection：${BACKUP_COLLECTION}\n`);

  const snapshot = await db.collection("tools").get();
  const tools = snapshot.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => a.id.localeCompare(b.id));

  const plans = [];
  for (const tool of tools) {
    const versions = computeVersions(tool);
    plans.push({ tool, versions });
    if (versions) {
      console.log(
        `  ✏️  ${tool.id.padEnd(16)} ${tool.title || "(無 title)"}\n` +
          `      → versions[0] = ${JSON.stringify(versions[0])}`,
      );
    } else {
      const reason =
        Array.isArray(tool.versions) && tool.versions.length
          ? "已有 versions"
          : "無版本訊號";
      console.log(
        `  ⏭️  ${tool.id.padEnd(16)} ${tool.title || ""}  (skip: ${reason})`,
      );
    }
  }

  const toWrite = plans.filter((p) => p.versions);
  console.log(`\n── 總結 ──`);
  console.log(
    `  共 ${tools.length} 筆，將 seed ${toWrite.length} 筆 versions[0]`,
  );

  if (DRY_RUN) {
    console.log(`\n>>> dry-run，沒寫入。確認後加 --apply：`);
    console.log(`    node scripts/migrate-tool-versions.mjs --apply\n`);
    return;
  }

  if (toWrite.length === 0) {
    console.log(`\n✅ 無需寫入（全部 skip）。\n`);
    return;
  }

  console.log(`\n── 備份 + 寫入 ──\n`);
  const batch = db.batch();
  const backupRef = db.collection(BACKUP_COLLECTION);
  const toolsRef = db.collection("tools");

  for (const { tool, versions } of toWrite) {
    const { id, ...originalData } = tool;
    batch.set(backupRef.doc(id), {
      ...originalData,
      _backupAt: new Date().toISOString(),
      _migrationVersion: "2026-06-05-tool-versions",
      _operation: "seed-versions",
    });
    batch.update(toolsRef.doc(id), { versions });
    console.log(`  ✅ ${id}  備份 + 寫 versions[0]`);
  }

  console.log(`\n  正在 commit batch...`);
  await batch.commit();
  console.log(`\n✅ 完成。備份：${BACKUP_COLLECTION}/{toolId}`);
  console.log(
    `   rollback：把 backup 的 versions 寫回（或刪掉 seed 的 versions）\n`,
  );
}

main().catch((err) => {
  console.error("\n❌ 執行失敗：", err.message);
  console.error(err.stack);
  process.exit(1);
});
```

- [ ] **Step 2: 跑 dry-run（需本地有 `serviceAccountKey.json`）**

Run: `node scripts/migrate-tool-versions.mjs`
Expected: 印出每筆 ✏️/⏭️ 與總結；**不寫入**。檢查：

- download / doc / skill 有 `typeData.version` 或檔的工具 → 顯示要 seed versions[0]，且 `fileUrl` 正確。
- 已有 versions 或純 webapp 無訊號 → skip。

> ⚠️ 若本地無 `serviceAccountKey.json`，此步驟由 Jason 在有金鑰的環境跑；subagent 僅確保腳本語法正確（`node --check scripts/migrate-tool-versions.mjs`）。

- [ ] **Step 3: 語法檢查（無金鑰環境的最低保證）**

Run: `node --check scripts/migrate-tool-versions.mjs`
Expected: 無輸出（語法 OK）。

- [ ] **Step 4: Commit**

```bash
git add scripts/migrate-tool-versions.mjs
git commit -m "feat(versions): migrate-tool-versions 把 legacy version/檔 seed 成 versions[0]

idempotent + 自動備份 + dry-run 預設。--apply 須等 code merge+deploy 後才跑。

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

## Task 8: 全量驗證 + PR

**Files:** 無（驗證 + 整合）

- [ ] **Step 1: 跑全部斷言 + build + lint**

```bash
node scripts/__verify-versions.mjs   # ✅ versions verify passed
node scripts/__verify-taxonomy.mjs   # ✅ taxonomy verify passed
npm run build                        # 成功
npm run lint                         # 無 error
```

- [ ] **Step 2: 對驗收標準逐項手動確認（spec §10）**

`npm run dev`，逐項打勾：

- VersionEditor 在「詳情頁編輯模式」與「admin wizard」皆可增 / 刪 / 上下移；download/doc/skill 列有上傳欄、webapp/mcp/api 無。
- wizard 已無 download/doc/skill 的 version/fileUrl/skillZipUrl 欄；platform/fileType/fileName/installPath/config 正常。
- 詳情頁與 wizard 存檔後 `versions` 正確寫入；既有 block 編輯 / 取消無迴歸。
- 「🕒 版本」tab 僅有版本時出現，新→舊、markdown 正確、有檔可下載舊版。
- 三處下載來源（快速安裝 tab、sidebar、卡片 getCTA）讀最新版；空 versions 時 fallback 舊欄位仍可下載；卡片與詳情頁一致。
- 「最後更新」顯示最新版日期。
- RWD（手機 / 平板 / 桌機）正常。

- [ ] **Step 3: 截圖給 Jason（UI 改動先 preview 確認再 merge）**

依慣例：推 branch 觸發 Vercel preview，或本地截圖。把版本 tab、編輯區、wizard 三張圖給 Jason 拍板後才 merge。

- [ ] **Step 4: 開 PR**

```bash
git push -u origin feature-hub-phase2.5
gh pr create --base main --head feature-hub-phase2.5 \
  --title "feat(hub): Phase 2.5 工具版本歷史" \
  --body "見 docs/superpowers/specs/2026-06-05-simhope-hub-phase2.5-tool-versions-design.md。

單一真相 versions[]；共用 VersionEditor（詳情頁＋wizard）；VersionHistory tab；
三處下載來源讀最新版；idempotent migration。firestore.rules 不需改、不用 Console 發布。

⚠️ 部署順序：merge → production deploy 綠燈 → \`node scripts/migrate-tool-versions.mjs --apply\` → 連 live 驗證（資源數不掉、下載可用、版本 tab 正確）。

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

- [ ] **Step 5: 部署後（Jason 手動，順序鐵律）**

1. merge PR → Vercel production deploy **Ready 綠燈目視確認**。
2. `node scripts/migrate-tool-versions.mjs`（dry-run 複驗）。
3. `node scripts/migrate-tool-versions.mjs --apply`（自動備份 tools-backup-當日）。
4. **連 live 站驗證**：首頁可用資源數不掉、download 型工具下載鈕可下載、版本 tab 顯示正確。

---

## Self-Review（plan vs spec）

**Spec coverage：**

- §2 資料模型 → Task 1（helper 定義形狀）、Task 3（編輯寫入）。
- §3 單一真相（快速安裝 / sidebar / getCTA 三處）→ Task 2（getCTA）、Task 5 Step 7–9。
- §4 共用 VersionEditor（detail + wizard）→ Task 3、Task 5 Step 10、Task 6 Step 5。
- §4.3 wizard 拔 legacy 欄 → Task 6 Step 6–8。
- §5 版本 tab + VersionHistory + 僅有版本才顯示 → Task 4、Task 5 Step 6。
- §6 migration → Task 7。
- §7 firestore.rules 不需改 → 計畫無此 task（正確，無需動）。
- §9 風險面（getCTA 一致、wizard 拔欄迴歸、block 管線、tab 插入、date 推導、排序約定）→ 分散於 Task 2/5/6/7 的驗證步驟。
- §10 驗收 → Task 8 Step 2 逐項。

**Placeholder scan：** 無 TBD/TODO；所有 code step 皆含完整碼或精確 old→new。

**Type consistency：** `versions` 列形狀 `{ version, date, notes, fileUrl? }` 在 helper / 編輯器 / migration 一致；`latestVersionLabel`/`blankVersionRow`/`latestVersion` 命名於各 task 一致；`localVersions`（detail）與 `form.versions`（wizard）皆寫入 `versions` 欄。
