# 🩺 健檢看板正確性修正 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修正 `feature-health-dashboard` 分支（尚未 merge）健檢邏輯的三個正確性缺口：mcp/embedded 工具殭屍誤判、beta/new 缺殭屍可見度、`usageThreshold` 無最小樣本數保護。

**Architecture:** 全部改動集中在既有純函式 `src/lib/healthFlags.mjs`（每個修正各一組新增/回歸測試），加一行 `HealthDashboard.jsx` 文案更新。零 firebase/browser 依賴變更、零 tracking、零 rules、零 migration。

**Tech Stack:** Next.js 16 (App Router) / React 19 / `node --test`（純函式單元測試）。

**Spec:** `docs/superpowers/specs/2026-07-01-health-flags-correctness-fixes-design.md`

---

## File Structure

| 檔案                                       | 責任                                                                                                                                                                       |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/healthFlags.mjs`（改）            | 加 `NO_OPENS_TYPES` / `ZOMBIE_VIEW_MAX_NO_OPENS` / `USAGE_THRESHOLD_MIN_SAMPLES`；殭屍判定改用 per-type view 下限 + `PUBLIC_STATUSES`；`usageThreshold` 加最小樣本數保護。 |
| `src/lib/healthFlags.test.mjs`（改）       | 新增 7 條測試（mcp/beta/new/dev/樣本數保護），修正 2 條既有 `usageThreshold` fixture 使其符合新的最小樣本數門檻。                                                          |
| `src/components/HealthDashboard.jsx`（改） | 🧟 分區說明文字，不再限定 `live`。                                                                                                                                         |

## 實作時發現、需要跟 spec 對照的一點修正

Spec 寫「已核對現有 `usageThreshold` 測試全部使用 0 筆或 ≥3 筆有效樣本」——**寫 plan 時重新逐條驗算，發現這句話不準確**：`排除零瀏覽工具` 測試只有 2 筆有效樣本（`{a:0,b:20,c:40}` → 過濾零瀏覽後剩 `[20,40]`），`排除非公開工具` 測試只有 1 筆有效樣本（`{a:8,x:100,y:100}` → 只有 `a` 是 public，`[8]`）。兩條在新的 `USAGE_THRESHOLD_MIN_SAMPLES=3` 保護下都會從原本的期望值變成回退地板 `1`，會直接讓既有測試失敗。

修法：**不改變設計決策本身**（門檻仍是 3、地板仍是 1），只把這兩條測試的樣本數 padding 到 3 筆，且刻意選擇讓期望值維持不變（`30` 和 `8`），讓 diff 最小、原本要驗證的行為（排除零瀏覽／排除非公開）不變質。細節在 Task 3。

其餘所有 `buildHealthReport` 層級的測試都不受 `usageThreshold` 門檻改變值影響（因為它們的 `views` 遠高於任何可能的門檻值，或者根本不落在門檻敏感的判斷分支上）——已逐條驗算過，見 Task 3 說明。

---

## Task 1: mcp/embedded 殭屍門檻放寬

**Files:**

- Modify: `src/lib/healthFlags.mjs`
- Test: `src/lib/healthFlags.test.mjs`

- [ ] **Step 1: 寫失敗測試**

在 `src/lib/healthFlags.test.mjs` 裡，緊接在既有這條測試之後：

```js
test("zombie: views >= 上限(3) → 不中（fresh）", () => {
  const r = run(
    [T("z", { createdAt: daysAgoTs(200), updatedAt: daysAgoTs(5) })],
    { viewsMap: { z: 3 } },
  );
  assert.equal(r.zombies.length, 0);
});
```

插入這 3 條新測試：

```js
test("zombie: mcp 工具 views=1 → 不中（無 opens 訊號的類型放寬門檻）", () => {
  const r = run([T("m", { type: "mcp", createdAt: daysAgoTs(120) })], {
    viewsMap: { m: 1 },
  });
  assert.equal(r.zombies.length, 0);
});

test("zombie: mcp 工具 views=0 → 仍命中（真的零訊號）", () => {
  const r = run([T("m", { type: "mcp", createdAt: daysAgoTs(120) })], {});
  assert.equal(r.zombies.length, 1);
  assert.equal(r.zombies[0].id, "m");
});

test("zombie: webapp 工具 views=1 → 仍命中（一般型門檻不變，對照 mcp）", () => {
  const r = run([T("w", { type: "webapp", createdAt: daysAgoTs(120) })], {
    viewsMap: { w: 1 },
  });
  assert.equal(r.zombies.length, 1);
});
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `npm run test:unit`
Expected: 第一條新測試（`mcp 工具 views=1 → 不中`）FAIL，因為現有邏輯對 mcp 也用 `ZOMBIE_VIEW_MAX=3`，`views=1 < 3` 會被判定冷門而誤標殭屍。其餘兩條新測試預期本來就會 PASS（現有邏輯剛好給出一樣的結果），這是正常的——只有第一條是這個修正真正要改變行為的地方。

- [ ] **Step 3: 實作最小修正**

在 `src/lib/healthFlags.mjs`，修改常數區塊。

Old:

```js
export const STALE_DAYS = 180;
export const ZOMBIE_GRACE_DAYS = 90;
export const ZOMBIE_VIEW_MAX = 3;
export const PENDING_STUCK_DAYS = 14;

const DAY_MS = 86400000;
const PUBLIC_STATUSES = new Set(["live", "beta", "new"]);
```

New:

```js
export const STALE_DAYS = 180;
export const ZOMBIE_GRACE_DAYS = 90;
export const ZOMBIE_VIEW_MAX = 3;
export const ZOMBIE_VIEW_MAX_NO_OPENS = 1; // mcp/embedded 永遠沒有 opens 訊號，views 下限放寬到 1
export const PENDING_STUCK_DAYS = 14;

const DAY_MS = 86400000;
const PUBLIC_STATUSES = new Set(["live", "beta", "new"]);
const NO_OPENS_TYPES = new Set(["mcp", "embedded"]);
```

再修改殭屍判定區塊。

Old:

```js
if (status === "live") {
  const created = toMs(t?.createdAt);
  const isCold = views < ZOMBIE_VIEW_MAX && opens === 0 && helpful === 0;
  const pastGrace =
    created != null && now - created > ZOMBIE_GRACE_DAYS * DAY_MS;
  if (isCold && pastGrace) {
    zombies.push({ ...base, ageDays: Math.floor((now - created) / DAY_MS) });
  }
}
```

New:

```js
if (status === "live") {
  const created = toMs(t?.createdAt);
  const viewFloor = NO_OPENS_TYPES.has(t?.type)
    ? ZOMBIE_VIEW_MAX_NO_OPENS
    : ZOMBIE_VIEW_MAX;
  const isCold = views < viewFloor && opens === 0 && helpful === 0;
  const pastGrace =
    created != null && now - created > ZOMBIE_GRACE_DAYS * DAY_MS;
  if (isCold && pastGrace) {
    zombies.push({ ...base, ageDays: Math.floor((now - created) / DAY_MS) });
  }
}
```

- [ ] **Step 4: 執行測試確認全部通過**

Run: `npm run test:unit`
Expected: PASS（全部，包含新加的 3 條）

- [ ] **Step 5: Commit**

```bash
git add src/lib/healthFlags.mjs src/lib/healthFlags.test.mjs
git commit -m "$(cat <<'EOF'
fix(health): mcp/embedded 殭屍偵測放寬 views 下限

opens 對 mcp/embedded 永遠是 0（CTA 點擊不算 tool_open，維持既有誠實
保守決策不變），殭屍判定原本因此對這兩型退化成「views<3 就冷門」，
造成裝了但很少回訪詳情頁的 mcp 工具被誤標。放寬這兩型的 views 下限
到 1，其餘類型門檻不變。

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>
EOF
)"
```

---

## Task 2: beta/new 殭屍可見度

**Files:**

- Modify: `src/lib/healthFlags.mjs`
- Test: `src/lib/healthFlags.test.mjs`

- [ ] **Step 1: 寫失敗測試**

緊接在 Task 1 新增的 3 條測試之後，插入：

```js
test("zombie: beta 狀態冷門 + 過寬限期 → 命中（原本只有 live 會）", () => {
  const r = run([T("b", { status: "beta", createdAt: daysAgoTs(120) })], {
    viewsMap: { b: 1 },
  });
  assert.equal(r.zombies.length, 1);
  assert.equal(r.zombies[0].id, "b");
});

test("zombie: new 狀態冷門 + 過寬限期 → 命中", () => {
  const r = run([T("n", { status: "new", createdAt: daysAgoTs(120) })], {
    viewsMap: { n: 1 },
  });
  assert.equal(r.zombies.length, 1);
});

test("zombie: dev 狀態不受影響（非公開狀態，不參與殭屍判定）", () => {
  const r = run([T("d", { status: "dev", createdAt: daysAgoTs(120) })], {
    viewsMap: { d: 1 },
  });
  assert.equal(r.zombies.length, 0);
});
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `npm run test:unit`
Expected: 前兩條（`beta`/`new`）FAIL，因為現有邏輯的殭屍判定只檢查 `status === "live"`。第三條（`dev`）預期本來就 PASS。

- [ ] **Step 3: 實作最小修正**

在 `src/lib/healthFlags.mjs`，把殭屍判定的狀態條件從只認 `live` 改成跟 `staleHot` 一樣的 `PUBLIC_STATUSES`。

Old:

```js
if (status === "live") {
  const created = toMs(t?.createdAt);
  const viewFloor = NO_OPENS_TYPES.has(t?.type)
    ? ZOMBIE_VIEW_MAX_NO_OPENS
    : ZOMBIE_VIEW_MAX;
  const isCold = views < viewFloor && opens === 0 && helpful === 0;
  const pastGrace =
    created != null && now - created > ZOMBIE_GRACE_DAYS * DAY_MS;
  if (isCold && pastGrace) {
    zombies.push({ ...base, ageDays: Math.floor((now - created) / DAY_MS) });
  }
}
```

New:

```js
if (PUBLIC_STATUSES.has(status)) {
  const created = toMs(t?.createdAt);
  const viewFloor = NO_OPENS_TYPES.has(t?.type)
    ? ZOMBIE_VIEW_MAX_NO_OPENS
    : ZOMBIE_VIEW_MAX;
  const isCold = views < viewFloor && opens === 0 && helpful === 0;
  const pastGrace =
    created != null && now - created > ZOMBIE_GRACE_DAYS * DAY_MS;
  if (isCold && pastGrace) {
    zombies.push({ ...base, ageDays: Math.floor((now - created) / DAY_MS) });
  }
}
```

（`dev`/`terminated`/`pending` 都不在 `PUBLIC_STATUSES` 裡，維持不參與殭屍判定；`pending` 本來就在更早的 `if (status === "pending") { ...; continue; }` 分支被攔截，不會走到這裡。）

- [ ] **Step 4: 執行測試確認全部通過**

Run: `npm run test:unit`
Expected: PASS（全部，包含新加的 3 條）

- [ ] **Step 5: Commit**

```bash
git add src/lib/healthFlags.mjs src/lib/healthFlags.test.mjs
git commit -m "$(cat <<'EOF'
fix(health): 殭屍偵測涵蓋 beta/new，不再只認 live

staleHot 早就用 PUBLIC_STATUSES（live/beta/new）當公開狀態集合，殭屍
判定卻只認 live，導致發布成 beta/new（甚至已被 announce-tool 公告過）
但從沒轉正的工具完全沒有殭屍可見度。改成跟 staleHot 用同一個狀態集合。

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>
EOF
)"
```

---

## Task 3: usageThreshold 最小樣本數保護

**Files:**

- Modify: `src/lib/healthFlags.mjs`
- Test: `src/lib/healthFlags.test.mjs`

- [ ] **Step 1: 修正 2 條既有 fixture ＋ 寫 1 條新失敗測試**

先修正既有的 `排除零瀏覽工具` 測試，把樣本數從 2 筆有效樣本 padding 到 3 筆，期望值刻意維持 `30` 不變：

Old:

```js
test("usageThreshold: 排除零瀏覽工具（median 只看 views>0）", () => {
  assert.equal(
    usageThreshold([P("a"), P("b"), P("c")], { a: 0, b: 20, c: 40 }),
    30,
  );
});
```

New:

```js
test("usageThreshold: 排除零瀏覽工具（median 只看 views>0）", () => {
  assert.equal(
    usageThreshold([P("a"), P("b"), P("c"), P("d")], {
      a: 0,
      b: 20,
      c: 30,
      d: 40,
    }),
    30,
  );
});
```

再修正既有的 `排除非公開工具` 測試，同樣 padding 到 3 筆有效樣本，期望值刻意維持 `8` 不變：

Old:

```js
test("usageThreshold: 排除非公開工具", () => {
  assert.equal(
    usageThreshold([P("a"), P("x", "dev"), P("y", "pending")], {
      a: 8,
      x: 100,
      y: 100,
    }),
    8,
  );
});
```

New:

```js
test("usageThreshold: 排除非公開工具", () => {
  assert.equal(
    usageThreshold([P("a"), P("b"), P("c"), P("x", "dev"), P("y", "pending")], {
      a: 8,
      b: 8,
      c: 8,
      x: 100,
      y: 100,
    }),
    8,
  );
});
```

然後在 `usageThreshold: 全零瀏覽 → 地板 1` 測試之後，插入新測試驗證最小樣本數保護：

```js
test("usageThreshold: 有效樣本數 <3 → 不信任中位數，退回地板 1", () => {
  assert.equal(usageThreshold([P("a"), P("b")], { a: 10, b: 100 }), 1);
});
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `npm run test:unit`
Expected: 新加的「有效樣本數 <3」測試 FAIL（現有邏輯會算出 `(10+100)/2=55`，不是 `1`）。剛 padding 過的兩條 fixture 測試此時應該還是 PASS（因為還沒改函式邏輯，樣本數還沒被拿來擋）。

- [ ] **Step 3: 實作最小修正**

在 `src/lib/healthFlags.mjs`，先加常數：

Old:

```js
export const PENDING_STUCK_DAYS = 14;
```

New:

```js
export const PENDING_STUCK_DAYS = 14;
export const USAGE_THRESHOLD_MIN_SAMPLES = 3;
```

再修改 `usageThreshold` 函式本體：

Old:

```js
export function usageThreshold(tools, viewsMap) {
  if (!Array.isArray(tools)) return 1;
  const vals = tools
    .filter((t) => PUBLIC_STATUSES.has(t?.status))
    .map((t) => num(viewsMap, t?.id))
    .filter((v) => v > 0)
    .sort((a, b) => a - b);
  if (vals.length === 0) return 1;
  const mid = Math.floor(vals.length / 2);
  const median = vals.length % 2 ? vals[mid] : (vals[mid - 1] + vals[mid]) / 2;
  return Math.max(1, median);
}
```

New:

```js
export function usageThreshold(tools, viewsMap) {
  if (!Array.isArray(tools)) return 1;
  const vals = tools
    .filter((t) => PUBLIC_STATUSES.has(t?.status))
    .map((t) => num(viewsMap, t?.id))
    .filter((v) => v > 0)
    .sort((a, b) => a - b);
  if (vals.length < USAGE_THRESHOLD_MIN_SAMPLES) return 1; // 樣本太薄，不信任中位數，退回地板
  const mid = Math.floor(vals.length / 2);
  const median = vals.length % 2 ? vals[mid] : (vals[mid - 1] + vals[mid]) / 2;
  return Math.max(1, median);
}
```

- [ ] **Step 4: 執行測試確認全部通過**

Run: `npm run test:unit`
Expected: PASS（全部，包含 Task 1/2/3 新加與修正的測試）。

Task 3 這個修改只影響 `usageThreshold` 在有效樣本數 1～2 筆時的回傳值；已在寫 plan 時逐條核對過 `healthFlags.test.mjs` 裡其餘所有呼叫 `buildHealthReport` 的測試（`staleHot`/`zombie`/`stuckPending`/`orphanKeys`/整體），它們的 `views` 數值都遠高於任何可能門檻、或根本不落在門檻敏感的判斷分支（例如 `zombie` 的冷門判定用的是 `ZOMBIE_VIEW_MAX`/`ZOMBIE_VIEW_MAX_NO_OPENS` 常數，跟 `usageThreshold` 完全無關），所以這一步跑完應該不會有任何其他測試意外變紅；如果有，先讀懂是哪條、為什麼，再決定是該調 fixture 還是邏輯有誤，不要來就改測試的期望值。

- [ ] **Step 5: Commit**

```bash
git add src/lib/healthFlags.mjs src/lib/healthFlags.test.mjs
git commit -m "$(cat <<'EOF'
fix(health): usageThreshold 加最小樣本數保護

有效樣本（views>0 的公開工具）少於 3 筆時，偶數長度的中位數計算等於
直接平均兩個極端值，對離群值毫無抵抗力。比照 popularTools.mjs 的
minWithViews=3 保護，樣本太薄時退回地板 1。順手把 2 條既有測試的樣本
數 padding 到 3 筆（期望值不變），配合新門檻。

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>
EOF
)"
```

---

## Task 4: HealthDashboard.jsx 殭屍分區文案更新

**Files:**

- Modify: `src/components/HealthDashboard.jsx`

- [ ] **Step 1: 更新說明文字**

Old（約在 186-191 行附近的 `<FlagSection>`）：

```jsx
      <FlagSection
        icon="🧟"
        title="殭屍工具"
        count={counts.zombies}
        desc={`掛 live 但幾乎沒人用、上架已超過 ${ZOMBIE_GRACE_DAYS} 天 — 考慮推廣或下架。`}
      >
```

New:

```jsx
      <FlagSection
        icon="🧟"
        title="殭屍工具"
        count={counts.zombies}
        desc={`上架後幾乎沒人用、已超過 ${ZOMBIE_GRACE_DAYS} 天 — 考慮推廣或下架。`}
      >
```

這是純文案調整，沒有邏輯變化，不需要新增測試（trivial one-liner）。

- [ ] **Step 2: 確認沒有拼字/JSX 錯誤**

Run: `npm run lint`
Expected: 0 error（跟修改前基準一致，僅有既有的 2 個 `<img>` warning，跟這個檔案無關）。

- [ ] **Step 3: Commit**

```bash
git add src/components/HealthDashboard.jsx
git commit -m "$(cat <<'EOF'
fix(health): 殭屍工具說明文字不再限定 live

配合上一版把殭屍判定擴大到 PUBLIC_STATUSES（live/beta/new），文案原本
寫死「掛 live」已經不準確。

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>
EOF
)"
```

---

## Task 5: 全套驗證

**Files:** 無（純驗證，不改檔案）

- [ ] **Step 1: 跑完整單元測試**

Run: `npm run test:unit`
Expected: 全部 PASS，數量比修正前多 7 條（Task1 三條 + Task2 三條 + Task3 一條新加；另有 2 條既有測試 fixture 被調整但不算新增）。

- [ ] **Step 2: 跑 lint**

Run: `npm run lint`
Expected: 0 error（維持修正前基準：僅既有 2 個 `<img>` warning，與本次改動無關）。

- [ ] **Step 3: 跑 build**

Run: `npm run build`
Expected: 成功（`src/components/HealthDashboard.jsx` 有 JSX 改動，值得跑一次完整 build 確認沒有語法/型別問題；`src/lib/healthFlags.mjs` 純函式改動風險低，但同一次 build 順便驗證）。

- [ ] **Step 4: 檢視完整 diff**

Run: `git log --oneline -5` 確認 4 個 commit 都在；`git diff feature-health-dashboard~4..HEAD -- src/lib/healthFlags.mjs src/lib/healthFlags.test.mjs src/components/HealthDashboard.jsx`（或直接用 `git show` 逐一檢視 4 個 commit）確認改動範圍跟 spec/plan 一致，沒有意外改到不相關的行。

沒有下一步的 push/PR 動作——這 4 個 commit 直接疊加在 `feature-health-dashboard` 分支上，跟該分支原本要出的健檢看板功能一起走同一個 PR/merge 流程。
