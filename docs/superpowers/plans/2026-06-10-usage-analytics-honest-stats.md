# B-1 使用數據追蹤 + 首頁誠實數字 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 接上第一方 Firestore 使用追蹤（只存匯總計數、無個人行為），把首頁假數字（30+/10h）換成真數字，並給 admin 一個使用概況。

**Architecture:** 純邏輯（事件→欄位映射、去重、increment 組裝、metrics 正規化）抽到 `src/lib/{trackEvents,metrics}.mjs`（client/server 共用、node:test 可測）。client `track.js` fire-and-forget POST `/api/track`；route 用 Admin SDK + rateLimit + `buildIncrements` 寫 `analytics/totals`（累計）+ `analytics_daily/{YYYYMMDD}`（每日 + byTool）。firestore.rules client deny 寫、totals 公開讀、daily 僅 admin 讀。首頁 `getMetrics()` 讀 totals。admin 新 usage 分頁彙整 daily.byTool 排名。

**Tech Stack:** Next.js 16 (App Router) / React 19 / firebase-admin (Firestore Admin SDK) / firebase client SDK / Tailwind 4 / node:test / @firebase/rules-unit-testing (emulator)。

**慣例：** Conventional Commits，每個 commit 結尾必加 `Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>`。

---

### Task 1: `trackEvents.mjs` — 事件純邏輯（TDD）

**Files:**

- Create: `src/lib/trackEvents.mjs`
- Test: `src/lib/trackEvents.test.mjs`

- [ ] **Step 1: 寫失敗測試**

Create `src/lib/trackEvents.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { eventField, shouldTrack, buildIncrements } from "./trackEvents.mjs";

test("eventField：已知事件回 camelCase 欄位", () => {
  assert.equal(eventField("tool_open"), "toolOpen");
  assert.equal(eventField("tool_view"), "toolView");
  assert.equal(eventField("search"), "search");
  assert.equal(eventField("request_submit"), "requestSubmit");
});

test("eventField：未知 / 空事件回 null", () => {
  assert.equal(eventField("evil"), null);
  assert.equal(eventField(""), null);
  assert.equal(eventField(undefined), null);
});

function fakeSeen() {
  const s = new Set();
  return { has: (k) => s.has(k), add: (k) => s.add(k) };
}

test("shouldTrack：未知事件不送", () => {
  assert.equal(shouldTrack("evil", "evil:1", fakeSeen()), false);
});

test("shouldTrack：不去重事件（key=null）每次都送", () => {
  const seen = fakeSeen();
  assert.equal(shouldTrack("search", null, seen), true);
  assert.equal(shouldTrack("search", null, seen), true);
});

test("shouldTrack：同 key 第二次不送、不同 key 仍送", () => {
  const seen = fakeSeen();
  assert.equal(shouldTrack("tool_open", "tool_open:t1", seen), true);
  assert.equal(shouldTrack("tool_open", "tool_open:t1", seen), false);
  assert.equal(shouldTrack("tool_open", "tool_open:t2", seen), true);
});

test("buildIncrements：tool_open + toolId → 含 byToolKey", () => {
  assert.deepEqual(buildIncrements("tool_open", "t1"), {
    field: "toolOpen",
    byToolKey: "t1",
  });
});

test("buildIncrements：tool_view 不記 byTool", () => {
  assert.deepEqual(buildIncrements("tool_view", "t1"), {
    field: "toolView",
    byToolKey: null,
  });
});

test("buildIncrements：search 無 toolId", () => {
  assert.deepEqual(buildIncrements("search"), {
    field: "search",
    byToolKey: null,
  });
});

test("buildIncrements：未知事件回 null", () => {
  assert.equal(buildIncrements("evil", "t1"), null);
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npm run test:unit`
Expected: FAIL — `Cannot find module './trackEvents.mjs'`

- [ ] **Step 3: 寫實作**

Create `src/lib/trackEvents.mjs`:

```js
// src/lib/trackEvents.mjs
// 使用追蹤的純邏輯（runtime-agnostic、無 firebase/browser 依賴）。
// client (track.js) 與 server (api/track) 共用；node:test 可直接測。

/** 事件名（client 送的 snake_case）→ analytics doc 計數欄位（camelCase）。 */
export const TRACK_EVENTS = {
  tool_open: "toolOpen",
  tool_view: "toolView",
  search: "search",
  request_submit: "requestSubmit",
};

/**
 * @param {string} event
 * @returns {string|null} 對應計數欄位；未知事件回 null（= 不合法）。
 */
export function eventField(event) {
  return TRACK_EVENTS[event] || null;
}

/**
 * 決定這次事件要不要送（client 端同 session 去重）。
 * @param {string} event
 * @param {string|null} dedupKey  null = 不去重（如 search）
 * @param {{has:(k:string)=>boolean, add:(k:string)=>void}} seen
 * @returns {boolean}
 */
export function shouldTrack(event, dedupKey, seen) {
  if (!eventField(event)) return false; // 未知事件不送
  if (!dedupKey) return true; // 不去重事件
  if (seen.has(dedupKey)) return false;
  seen.add(dedupKey);
  return true;
}

/**
 * 組裝要 increment 的欄位（server 端用）。
 * @param {string} event
 * @param {string} [toolId]
 * @returns {{field:string, byToolKey:string|null}|null}  null = 不合法事件
 */
export function buildIncrements(event, toolId) {
  const field = eventField(event);
  if (!field) return null;
  // byTool 只記 tool_open（核心採用信號），且需有 toolId
  const byToolKey =
    event === "tool_open" && toolId ? String(toolId).slice(0, 200) : null;
  return { field, byToolKey };
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npm run test:unit`
Expected: PASS（既有 31 + 新 9 = 40 tests pass）

- [ ] **Step 5: Commit**

```bash
git add src/lib/trackEvents.mjs src/lib/trackEvents.test.mjs
git commit -m "feat(analytics): trackEvents 純邏輯 — 事件映射/去重/increment 組裝

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

### Task 2: `metrics.mjs` — totals 正規化（TDD）

**Files:**

- Create: `src/lib/metrics.mjs`
- Test: `src/lib/metrics.test.mjs`

- [ ] **Step 1: 寫失敗測試**

Create `src/lib/metrics.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeMetrics } from "./metrics.mjs";

test("normalizeMetrics：完整資料原樣帶出", () => {
  assert.deepEqual(
    normalizeMetrics({ toolOpen: 5, toolView: 9, search: 2, requestSubmit: 1 }),
    { toolOpen: 5, toolView: 9, search: 2, requestSubmit: 1 },
  );
});

test("normalizeMetrics：缺欄 / 空 / undefined 補 0", () => {
  assert.deepEqual(normalizeMetrics({ toolOpen: 3 }), {
    toolOpen: 3,
    toolView: 0,
    search: 0,
    requestSubmit: 0,
  });
  assert.deepEqual(normalizeMetrics({}), {
    toolOpen: 0,
    toolView: 0,
    search: 0,
    requestSubmit: 0,
  });
  assert.deepEqual(normalizeMetrics(), {
    toolOpen: 0,
    toolView: 0,
    search: 0,
    requestSubmit: 0,
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npm run test:unit`
Expected: FAIL — `Cannot find module './metrics.mjs'`

- [ ] **Step 3: 寫實作**

Create `src/lib/metrics.mjs`:

```js
// src/lib/metrics.mjs
// analytics/totals 原始資料 → 固定四欄正規化（缺欄補 0）。純邏輯、可測。

/**
 * @param {object} [data]  analytics/totals doc 資料
 * @returns {{toolOpen:number, toolView:number, search:number, requestSubmit:number}}
 */
export function normalizeMetrics(data = {}) {
  return {
    toolOpen: data.toolOpen || 0,
    toolView: data.toolView || 0,
    search: data.search || 0,
    requestSubmit: data.requestSubmit || 0,
  };
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npm run test:unit`
Expected: PASS（43 tests pass）

- [ ] **Step 5: Commit**

```bash
git add src/lib/metrics.mjs src/lib/metrics.test.mjs
git commit -m "feat(analytics): metrics.normalizeMetrics — totals 缺欄補 0

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

### Task 3: `track.js` — client fire-and-forget 包裝

**Files:**

- Create: `src/lib/track.js`

無單元測試（核心邏輯已在 `trackEvents.mjs` 測過；本檔是 browser glue：`fetch` + `sessionStorage` + SSR guard）。

- [ ] **Step 1: 寫實作**

Create `src/lib/track.js`:

```js
// src/lib/track.js
// client 端使用追蹤：fire-and-forget POST /api/track。
// 不 await、吞錯、絕不擋 UI；同 session 去重（sessionStorage）。
import { shouldTrack } from "@/lib/trackEvents.mjs";

// sessionStorage-backed 去重 Set。任何存取失敗（無痕/停用）皆退化為「不去重」。
function sessionSeen() {
  return {
    has: (k) => {
      try {
        return sessionStorage.getItem("trk:" + k) === "1";
      } catch {
        return false;
      }
    },
    add: (k) => {
      try {
        sessionStorage.setItem("trk:" + k, "1");
      } catch {
        /* 忽略 */
      }
    },
  };
}

/**
 * 送一筆使用事件。
 * @param {"tool_open"|"tool_view"|"search"|"request_submit"} event
 * @param {{toolId?: string}} [payload]
 */
export function track(event, payload = {}) {
  if (typeof window === "undefined") return; // SSR 保險
  // 只對 tool_open / tool_view 去重（同一工具重整 / 來回不重複計）。
  // search 與 request_submit 每次都是真事件 → 不去重（同 session 兩筆需求都要算）。
  const dedup = event === "tool_open" || event === "tool_view";
  const dedupKey = dedup ? `${event}:${payload.toolId || ""}` : null;
  if (!shouldTrack(event, dedupKey, sessionSeen())) return;
  try {
    fetch("/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, toolId: payload.toolId }),
      keepalive: true, // 點外連即離開頁面時仍送得出去
    }).catch(() => {});
  } catch {
    /* fire-and-forget */
  }
}
```

- [ ] **Step 2: 確認 build 不破**

Run: `npm run build`
Expected: 成功（route/import 解析正常；本檔尚未被引用也應 build 過）

- [ ] **Step 3: Commit**

```bash
git add src/lib/track.js
git commit -m "feat(analytics): client track() — fire-and-forget + session 去重

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

### Task 4: `POST /api/track` — 寫入路徑

**Files:**

- Create: `app/api/track/route.js`

參照既有 `app/api/request/route.js`（Admin SDK + rateLimit + clientIp 模式）。

- [ ] **Step 1: 寫實作**

Create `app/api/track/route.js`:

```js
import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdmin } from "@/lib/firebaseAdmin";
import { rateLimit, clientIp } from "@/lib/rateLimit.mjs";
import { buildIncrements } from "@/lib/trackEvents.mjs";

/**
 * POST /api/track — 第一方使用追蹤（匿名匯總計數，無個人行為記錄）。
 * body: { event, toolId? }
 * 寫 analytics/totals（累計，首頁 O(1) 讀）+ analytics_daily/{YYYYMMDD}（每日 + byTool）。
 * 只 Admin SDK 寫（firestore.rules client 一律 deny）；per-IP 60/min 限流防灌水。
 */
export async function POST(req) {
  try {
    const ip = clientIp(req);
    if (!rateLimit(`track:${ip}`, { limit: 60, windowMs: 60000 }).ok) {
      return NextResponse.json({ ok: false }, { status: 429 });
    }

    const body = await req.json().catch(() => ({}));
    const inc = buildIncrements(body.event, body.toolId);
    if (!inc) return NextResponse.json({ ok: false }, { status: 400 });

    const { adminDb } = getAdmin();
    const now = new Date();
    const iso = now.toISOString().slice(0, 10); // "2026-06-10"
    const dayId = iso.replace(/-/g, ""); // "20260610"
    // TTL：~400 天後自動清（Jason 在 Console 建 analytics_daily/expireAt policy 後生效）
    const expireAt = new Date(now.getTime() + 400 * 24 * 60 * 60 * 1000);

    const totalsRef = adminDb.collection("analytics").doc("totals");
    const dailyRef = adminDb.collection("analytics_daily").doc(dayId);

    const totalsUpdate = {
      [inc.field]: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
    };
    const dailyUpdate = {
      date: iso,
      expireAt,
      [inc.field]: FieldValue.increment(1),
    };
    // 巢狀 map + merge：byTool.{toolId} 累加（用巢狀物件而非 "byTool.x" dotted key，
    // 因 set({merge:true}) 會把含點的 key 當字面欄位名而非巢狀路徑）。
    if (inc.byToolKey) {
      dailyUpdate.byTool = { [inc.byToolKey]: FieldValue.increment(1) };
    }

    const batch = adminDb.batch();
    batch.set(totalsRef, totalsUpdate, { merge: true });
    batch.set(dailyRef, dailyUpdate, { merge: true });
    await batch.commit();

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("/api/track 失敗：", e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
```

- [ ] **Step 2: 確認 build 通過**

Run: `npm run build`
Expected: 成功，路由清單出現 `/api/track`

- [ ] **Step 3: Commit**

```bash
git add app/api/track/route.js
git commit -m "feat(analytics): POST /api/track — Admin SDK 寫 totals+daily、60/min 限流

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

### Task 5: firestore.rules analytics 區塊 + emulator 測試（TDD）

**Files:**

- Modify: `firestore.rules`（在 `webauthnChallenges` deny 區塊後、`}` `}` 前加入）
- Modify: `firestore.rules.test.mjs`（seed 加 analytics fixtures；檔末加 5 條測試）

- [ ] **Step 1: 在 rules 測試 seed 加 analytics fixtures**

在 `firestore.rules.test.mjs` 的 `seed()` 內、`painCards` 兩筆 setDoc 之後（約 line 65 後）加入：

```js
await setDoc(doc(db, "analytics", "totals"), {
  toolOpen: 5,
  toolView: 9,
});
await setDoc(doc(db, "analytics_daily", "20260610"), {
  date: "2026-06-10",
  toolOpen: 2,
});
```

- [ ] **Step 2: 在 rules 測試檔末（最後統計輸出 `console.log` 之前）加 5 條測試**

找到檔末跑測試的區塊（一系列 `await it(...)` 呼叫），在最後一個 `await it(...)` 之後加：

```js
await it("anon 可讀 analytics/totals（首頁要顯示）", async () => {
  await assertSucceeds(getDoc(doc(anon, "analytics", "totals")));
});

await it("anon 不可寫 analytics/totals", async () => {
  await assertFails(
    setDoc(doc(anon, "analytics", "totals"), { toolOpen: 999 }),
  );
});

await it("dev（一般登入）不可寫 analytics/totals", async () => {
  await assertFails(
    updateDoc(doc(dev1, "analytics", "totals"), { toolOpen: 999 }),
  );
});

await it("anon 不可讀 analytics_daily（僅 admin）", async () => {
  await assertFails(getDoc(doc(anon, "analytics_daily", "20260610")));
});

await it("admin 可讀 analytics_daily、但仍不可寫", async () => {
  await assertSucceeds(getDoc(doc(admin, "analytics_daily", "20260610")));
  await assertFails(
    setDoc(doc(admin, "analytics_daily", "20260610"), { toolOpen: 1 }),
  );
});
```

- [ ] **Step 3: 跑 rules 測試確認新測試失敗**

Run: `npm run test:rules`
Expected: 既有 42 條仍 PASS；新 5 條中至少「anon 不可讀 daily」「anon/dev 不可寫」FAIL（因 rules 尚未加 analytics 區塊 → 預設 deny 讓「不可寫/不可讀」其實會通過，但「anon 可讀 totals」「admin 可讀 daily」會 FAIL，因尚無 allow read）。重點：**「anon 可讀 totals」與「admin 可讀 daily」兩條 FAIL**。

- [ ] **Step 4: 加 rules 區塊**

在 `firestore.rules` 的 `match /webauthnChallenges/{id} { allow read, write: if false; }` 之後、最外層兩個 `}` 之前，加入：

```
    // 使用數據：累計數公開可讀（首頁顯示）；每日明細僅 admin 讀；
    // 一律禁止 client 寫（只 Admin SDK 經 /api/track 寫，防灌水）。
    match /analytics/{docId} {
      allow read: if true;
      allow write: if false;
    }
    match /analytics_daily/{day} {
      allow read: if isAdmin();
      allow write: if false;
    }
```

- [ ] **Step 5: 跑 rules 測試確認全通過**

Run: `npm run test:rules`
Expected: 全部 PASS（42 + 5 = 47 條）

- [ ] **Step 6: Commit**

```bash
git add firestore.rules firestore.rules.test.mjs
git commit -m "feat(analytics): firestore.rules — totals 公開讀/daily admin 讀/client deny 寫

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

### Task 6: `getMetrics()` — db.js 讀 totals

**Files:**

- Modify: `src/lib/db.js`（import metrics.mjs；檔末加 `getMetrics`）

- [ ] **Step 1: 加 import**

在 `src/lib/db.js` 頂部，`import { db } from "./firebase";` 之後加：

```js
import { normalizeMetrics } from "./metrics.mjs";
```

- [ ] **Step 2: 檔末加 getMetrics**

在 `src/lib/db.js` 最末（`getApprovedPainCards` 之後）加：

```js
/**
 * 讀使用累計數（首頁 MetricsBand 用）。
 * doc 不存在 / 讀取失敗 → 全 0（冷啟動安全）。
 * @returns {Promise<{toolOpen:number, toolView:number, search:number, requestSubmit:number}>}
 */
export async function getMetrics() {
  try {
    const snap = await getDoc(doc(db, "analytics", "totals"));
    return normalizeMetrics(snap.exists() ? snap.data() : {});
  } catch {
    return normalizeMetrics({});
  }
}
```

（`getDoc`、`doc` 已在 db.js 既有 import 內，毋需再加。）

- [ ] **Step 3: 確認 build/lint 通過**

Run: `npm run build`
Expected: 成功

- [ ] **Step 4: Commit**

```bash
git add src/lib/db.js
git commit -m "feat(analytics): db.getMetrics — 讀 analytics/totals（缺則全 0）

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

### Task 7: 首頁 MetricsBand 三 slot 改真數字

**Files:**

- Modify: `app/page.jsx`（import getMetrics；Promise.all 加第三項；MetricsBand stats 改）

- [ ] **Step 1: 改 import**

`app/page.jsx` line 4：

```js
import { getCatalog, getApprovedPainCards, getMetrics } from "@/lib/db";
```

- [ ] **Step 2: 加 metrics state + 併入 Promise.all**

在 `const [loading, setLoading] = useState(true);`（line 62）後加：

```js
const [metrics, setMetrics] = useState({
  toolOpen: 0,
  toolView: 0,
  search: 0,
  requestSubmit: 0,
});
```

把 line 65-73 的 useEffect 改為（加第三個 `getMetrics()`）：

```js
useEffect(() => {
  Promise.all([getCatalog(), getApprovedPainCards(), getMetrics()])
    .then(([toolsData, painsData, metricsData]) => {
      setTools(toolsData);
      setPainCards(painsData);
      setMetrics(metricsData);
    })
    .catch((err) => console.error("Failed to load:", err))
    .finally(() => setLoading(false));
}, []);
```

- [ ] **Step 3: 改 MetricsBand 三 slot**

把 line 159-165 的 `<MetricsBand .../>` 改為：

```jsx
<MetricsBand
  stats={[
    { value: loading ? "…" : activeCount, label: "可用資源" },
    {
      value: loading ? "…" : metrics.toolOpen.toLocaleString(),
      label: "累計工具開啟",
    },
    { value: loading ? "…" : painCards.length, label: "痛點解法" },
  ]}
/>
```

- [ ] **Step 4: 確認 build 通過**

Run: `npm run build`
Expected: 成功

- [ ] **Step 5: Commit**

```bash
git add app/page.jsx
git commit -m "feat(analytics): 首頁三數字全真 — 可用資源/累計工具開啟/痛點解法

拔掉寫死的 30+/10h；累計工具開啟讀 getMetrics、痛點解法用既有 painCards。

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

### Task 8: 埋點 `tool_open`（ToolCard）+ `tool_view`（詳情頁）

**Files:**

- Modify: `src/components/ToolCard.jsx`
- Modify: `app/tool/[id]/page.jsx`

- [ ] **Step 1: ToolCard 加 import + 在 external CTA 埋 tool_open**

`src/components/ToolCard.jsx` line 2 後加：

```js
import { track } from "@/lib/track";
```

把 `handleCtaClick`（line 79-84）改為：

```js
// CTA 點擊處理：external（真實開啟/下載）才記 tool_open；disabled 阻止導航。
const handleCtaClick = (e) => {
  if (cta.disabled) {
    e.preventDefault();
    return;
  }
  if (cta.external) track("tool_open", { toolId: id });
  // 不要 stopPropagation — 卡片用 <Link>、CTA 用 <a>，已分開避免 nested links
};
```

（內部 `<Link>` 分支也用 `handleCtaClick`，但因 `cta.external` 為 false → 不送，符合「純導航不計」。）

- [ ] **Step 2: 詳情頁加 import + tool_view on load**

`app/tool/[id]/page.jsx`：在既有 import 區加（與其他 `@/lib` import 並列）：

```js
import { track } from "@/lib/track";
```

在 `fetchTool` 的 `setTool(data);`（line 849）後緊接一行：

```js
track("tool_view", { toolId: data.id || id });
```

（`track` 同 session 去重 → 重整或 fetchTool 重跑不會重複計。`data.id` 若無則退回路由 `id`。）

- [ ] **Step 3: 確認 build/lint 通過**

Run: `npm run build`
Expected: 成功

Run: `npm run lint`
Expected: 2 warnings 0 errors（基準不變）

- [ ] **Step 4: Commit**

```bash
git add src/components/ToolCard.jsx "app/tool/[id]/page.jsx"
git commit -m "feat(analytics): 埋 tool_open（ToolCard 外連 CTA）+ tool_view（詳情頁載入）

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

### Task 9: 埋點 `search`（hub）+ `request_submit`（RequestCard + LoginModal）

**Files:**

- Modify: `app/hub/page.jsx`
- Modify: `src/components/RequestCard.jsx`
- Modify: `src/components/LoginModal.jsx`

- [ ] **Step 1: hub 加 import + 重用 debouncedQuery 送 search**

`app/hub/page.jsx` line 9 後（與其他 import 並列）加：

```js
import { track } from "@/lib/track";
```

在既有 debounce effect（line 28-31）之後加一個新 effect：

```js
useEffect(() => {
  if (debouncedQuery) track("search");
}, [debouncedQuery]);
```

（重用既有 300ms `debouncedQuery`，不另加 debounce；只在非空查詢送；不帶 query text。）

- [ ] **Step 2: RequestCard 送出成功埋 request_submit**

`src/components/RequestCard.jsx` line 4 後加：

```js
import { track } from "@/lib/track";
```

把 `submit` 內的 `setDone(true);`（line 61）改為兩行：

```js
track("request_submit");
setDone(true);
```

（`request_submit` 不去重 → 同 session 送兩筆需求都會算；server 端只 increment `requestSubmit` 計數、不寫 byTool。）

- [ ] **Step 3: LoginModal access 申請成功埋 request_submit**

`src/components/LoginModal.jsx`：在既有 import 區加：

```js
import { track } from "@/lib/track";
```

把 access 流程的 `setApplied(true);`（line 168）改為兩行：

```js
track("request_submit");
setApplied(true);
```

- [ ] **Step 4: 確認 build/lint 通過**

Run: `npm run build`
Expected: 成功

Run: `npm run lint`
Expected: 2 warnings 0 errors

- [ ] **Step 5: Commit**

```bash
git add app/hub/page.jsx src/components/RequestCard.jsx src/components/LoginModal.jsx
git commit -m "feat(analytics): 埋 search（hub）+ request_submit（提需求/開發者申請）

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

### Task 10: admin 使用概況分頁

**Files:**

- Create: `src/components/UsageDashboard.jsx`
- Modify: `app/admin/page.jsx`（側欄加 usage 按鈕 + 條件 render）

- [ ] **Step 1: 建 UsageDashboard 元件**

Create `src/components/UsageDashboard.jsx`:

```jsx
"use client";

import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { doc, getDoc, collection, getDocs } from "firebase/firestore";
import { normalizeMetrics } from "@/lib/metrics.mjs";
import { getAllTools } from "@/lib/db";

// 近 N 天的 daily doc id（UTC YYYYMMDD）。
function recentDayIds(n) {
  const ids = [];
  const today = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(today.getTime() - i * 86400000);
    ids.push(d.toISOString().slice(0, 10).replace(/-/g, ""));
  }
  return ids;
}

export default function UsageDashboard() {
  const [totals, setTotals] = useState(null);
  const [ranking, setRanking] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        // 1) 累計四數
        const tSnap = await getDoc(doc(db, "analytics", "totals"));
        setTotals(normalizeMetrics(tSnap.exists() ? tSnap.data() : {}));

        // 2) 近 14 天 byTool 彙整 → 工具開啟排名
        const ids = recentDayIds(14);
        const daySnaps = await Promise.all(
          ids.map((id) => getDoc(doc(db, "analytics_daily", id))),
        );
        const byTool = {};
        for (const s of daySnaps) {
          if (!s.exists()) continue;
          const bt = s.data().byTool || {};
          for (const [tid, n] of Object.entries(bt)) {
            byTool[tid] = (byTool[tid] || 0) + (n || 0);
          }
        }
        // 3) join tools 取標題
        const tools = await getAllTools();
        const titleOf = Object.fromEntries(
          tools.map((t) => [t.id, t.title || t.id]),
        );
        const rows = Object.entries(byTool)
          .map(([tid, n]) => ({
            id: tid,
            title: titleOf[tid] || tid,
            opens: n,
          }))
          .sort((a, b) => b.opens - a.opens);
        setRanking(rows);
      } catch (e) {
        console.error("UsageDashboard 載入失敗：", e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <p className="text-[var(--color-text-mid)]">載入中…</p>;

  const cards = [
    { label: "累計工具開啟", value: totals?.toolOpen ?? 0 },
    { label: "詳情頁瀏覽", value: totals?.toolView ?? 0 },
    { label: "搜尋次數", value: totals?.search ?? 0 },
    { label: "需求/申請送出", value: totals?.requestSubmit ?? 0 },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cards.map((c) => (
          <div
            key={c.label}
            className="bg-[var(--color-card-bg)] border border-[var(--color-card-border)] rounded-2xl p-4 text-center"
          >
            <div className="text-2xl font-black text-[var(--color-text-dark)]">
              {c.value.toLocaleString()}
            </div>
            <div className="text-xs font-semibold text-[var(--color-text-mid)] mt-1">
              {c.label}
            </div>
          </div>
        ))}
      </div>

      <div>
        <h3 className="font-extrabold text-[var(--color-text-dark)] mb-2">
          工具開啟排名（近 14 天）
        </h3>
        {ranking.length === 0 ? (
          <p className="text-sm text-[var(--color-text-mid)]">
            近 14 天還沒有工具開啟紀錄。
          </p>
        ) : (
          <div className="flex flex-col gap-1">
            {ranking.map((r, i) => (
              <div
                key={r.id}
                className="flex items-center gap-3 bg-[var(--color-card-bg)] border border-[var(--color-card-border)] rounded-xl px-3 py-2"
              >
                <span className="text-xs font-bold text-[var(--color-text-mid)] w-6">
                  {i + 1}
                </span>
                <span className="flex-1 font-bold text-sm text-[var(--color-text-dark)] truncate">
                  {r.title}
                </span>
                <span className="text-sm font-black text-[var(--color-clay-purple)]">
                  {r.opens.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: admin 頁 import + 側欄按鈕 + 條件 render**

`app/admin/page.jsx`：在 import 區加：

```js
import UsageDashboard from "@/components/UsageDashboard";
```

在側欄「📥 申請 / 需求」按鈕（`onClick={() => setActiveTab("inbox")}` 那顆，約 line 198-201）之後，複製同款 button 結構新增一顆：

```jsx
<button
  onClick={() => setActiveTab("usage")}
  className={`w-full text-left px-4 py-3 rounded-xl font-bold transition-all ${activeTab === "usage" ? "bg-[var(--color-clay-purple)] text-white shadow-md" : "text-[var(--color-text-mid)] hover:bg-gray-100 dark:hover:bg-gray-700"}`}
>
  📊 使用概況
</button>
```

在 inbox 的條件 render 區塊（`{activeTab === "inbox" && (...)}`，約 line 522）之後加：

```jsx
{
  activeTab === "usage" && <UsageDashboard />;
}
```

- [ ] **Step 3: 確認 build/lint 通過**

Run: `npm run build`
Expected: 成功

Run: `npm run lint`
Expected: 2 warnings 0 errors

- [ ] **Step 4: Commit**

```bash
git add src/components/UsageDashboard.jsx app/admin/page.jsx
git commit -m "feat(analytics): admin 使用概況分頁 — 四數字卡 + 工具開啟排名（近14天）

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

### Task 11: 全套驗證

**Files:** 無（驗證 + 必要修正）

- [ ] **Step 1: 跑全部單元測試**

Run: `npm run test:unit`
Expected: PASS（43 tests：既有 31 + trackEvents 9 + metrics 3）

- [ ] **Step 2: 跑 rules 測試**

Run: `npm run test:rules`
Expected: PASS（47 條）

- [ ] **Step 3: build + lint**

Run: `npm run build`
Expected: 成功，路由含 `/api/track`

Run: `npm run lint`
Expected: 2 warnings（皆既有 tool/[id] `<img>`）0 errors

- [ ] **Step 4: grep 確認無散落 fetch("/api/track")（都走 track()）**

Run: `grep -rn "api/track" app src --include=*.jsx --include=*.js | grep -v "route.js"`
Expected: 無結果（client 端只透過 `src/lib/track.js` 呼叫）

- [ ] **Step 5: 最終 commit（若 step 1-4 有任何修正）**

```bash
git add -A
git commit -m "test(analytics): 全套驗證綠（unit 43 / rules 47 / build / lint 基準）

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

（若無修正則跳過本步。）

---

## 完成後（不在本計畫的自動步驟內）

1. **獨立 reviewer subagent** 審實作（對抗式）。
2. 開 PR、等 Jason merge。
3. **Jason 手動（merge + deploy 後）**：
   - 發布新 `firestore.rules` → **立即驗**首頁照常 14 資源 + 點工具後 `analytics/totals` 有寫入。
   - Console / GCloud 建 TTL policy（`analytics_daily` / `expireAt`，可與既有兩條一起；非阻塞）。
4. **部署後 MCP / 手動驗**：首頁三數字皆真、點工具 → `totals.toolOpen` +1、admin 使用概況顯示排名。
