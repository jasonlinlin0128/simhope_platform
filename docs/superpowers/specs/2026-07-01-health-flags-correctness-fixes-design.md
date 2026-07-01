# 🩺 健檢看板正確性修正設計

> 日期：2026-07-01 ・ 狀態：設計定稿，待寫 plan
> 承接 [2026-06-21-health-check-dashboard-design.md](2026-06-21-health-check-dashboard-design.md)（`feature-health-dashboard` 分支尚未 merge），修正三個上線前發現的偵測邏輯缺陷。

## 背景

多領域專家 workflow 體檢本分支時，在健檢看板正確性這個主題抓到三條「currently-true」的缺口，全部集中在 `src/lib/healthFlags.mjs`：

1. **mcp/embedded 工具的「殭屍」偵測會誤判**。
2. **殭屍偵測只看 `status==='live'`，漏掉 `beta`/`new`**。
3. **`usageThreshold` 的中位數沒有最小樣本數保護**。

三條都只動 `healthFlags.mjs` 內部邏輯，不動 tracking、不動 rules、不動資料結構——分支還沒 merge，是修正而非上線後 hotfix。

## 三個問題與修法

### 1. mcp/embedded 殭屍誤判

**根因比表面看起來細**：`opens` 對 mcp/embedded 永遠是 `0`——它們的 CTA 點擊從不設 `cta.external`（見 `src/lib/taxonomy.js#getCTA`），所以 `tool_open` 從不觸發。這是 B-1 分析階段刻意的「誠實保守」決策（避免灌水熱門排行），**這個決策本身維持不動，不重開**。

但因為 `opens` 對這兩型永遠是 `0`，殭屍判定 `isCold = views < ZOMBIE_VIEW_MAX && opens===0 && helpful===0` 對 mcp/embedded 實質上退化成「`views < 3 && helpful===0`」。而這兩型工具的 views 天生就會偏低（使用者到詳情頁裝一次、之後透過 Claude Desktop / 內嵌場域天天用但不會回來點擊），造成「真的有人在用的 mcp 工具」被誤標 🧟。

**修法**：對這兩型放寬「冷門」的 views 下限——**單一 view 就視為有人用**（webapp/download 等一般型維持原本 3）：

```js
const NO_OPENS_TYPES = new Set(["mcp", "embedded"]);
export const ZOMBIE_VIEW_MAX = 3;
export const ZOMBIE_VIEW_MAX_NO_OPENS = 1;

const viewFloor = NO_OPENS_TYPES.has(t?.type)
  ? ZOMBIE_VIEW_MAX_NO_OPENS
  : ZOMBIE_VIEW_MAX;
const isCold = views < viewFloor && opens === 0 && helpful === 0;
```

`staleHot` 不用改——它的 `isUsed = views >= threshold || opens >= 1` 讓低瀏覽的 mcp/embedded 工具落在「兩區都不進」（不當成用得很兇的熱門工具，也不當殭屍），這正是資料不可靠時該有的保守行為，不需要額外處理。

### 2. beta/new 沒有殭屍可見度

`staleHot` 已經用 `PUBLIC_STATUSES`（`live`/`beta`/`new`）當公開狀態集合，殭屍判定卻只檢查 `status === "live"`——一個發布成 `beta`/`new`（甚至已經被 announce-tool 公告過）但從沒轉正的工具，完全沒有殭屍可見度。修法是讓殭屍判定跟 `staleHot` 用同一個狀態集合：

```js
if (PUBLIC_STATUSES.has(status)) { // 原本：status === "live"
  ...
}
```

寬限天數（`ZOMBIE_GRACE_DAYS`）三個狀態統一適用，不特別區分——跟 `staleHot` 現有處理方式一致，不額外加複雜度。

**連動改動**：`HealthDashboard.jsx` 🧟 分區的說明文字目前寫「掛 live 但幾乎沒人用…」，需要改成不限定 live（例如「上架後幾乎沒人用…」）。

### 3. usageThreshold 沒有最小樣本數保護

`popularTools.mjs` 的 `rankPopularTools` 早就有 `minWithViews = 3`（樣本太薄就不给排名），`usageThreshold` 從沒抄這個保護。中位數在偶數筆時是「中間兩值平均」——樣本只有 2 筆時等於直接被兩個極端值拉走（等同平均數，對離群值毫無抵抗力）。修法：

```js
export const USAGE_THRESHOLD_MIN_SAMPLES = 3;

if (vals.length < USAGE_THRESHOLD_MIN_SAMPLES) return 1; // 樣本太薄，不信任中位數，退回地板
```

已核對現有 `usageThreshold` 測試全部使用 0 筆或 ≥3 筆有效樣本，這個改動不會動到既有測試的預期值。

## 非目標（YAGNI）

- 不新增/修改任何 tracking 事件（`tool_open` 等）——維持「誠實保守」決策不變。
- 不把 mcp/embedded 排除在殭屍偵測外——保留可見度，只是放寬判定。
- 不做型別別的殭屍寬限天數——維持統一常數。
- 不做 `usageThreshold` 的可調參數（opts）——樣本數門檻用常數，跟其他門檻常數風格一致。

## 測試（TDD，`healthFlags.test.mjs`）

- 殭屍：mcp 工具 `views:1, opens:0`、過寬限期 → 不再被標殭屍（修正前會誤標）。
- 殭屍：mcp 工具 `views:0`、過寬限期 → 仍標殭屍（真的零訊號）。
- 殭屍：webapp 工具 `views:1`、過寬限期 → 仍標殭屍（一般型門檻不變，回歸測試）。
- 殭屍：`beta`/`new` 工具冷門＋過寬限期 → 現在會被標（修正前只有 `live` 會）。
- `usageThreshold`：2 筆有效樣本 → 回地板 1，不是兩值平均。
- `usageThreshold`：3 筆以上 → 維持算真中位數（既有行為回歸測試）。

## 風險與範圍

- 純函式內部邏輯修正，零 `firestore.rules`、零新 collection、零 tracking 變更、零 migration。
- `HealthDashboard.jsx` 只動一行說明文字。
- 分支尚未 merge，這次修正直接併入同一個 PR，不是事後 hotfix。

## 交付清單（給 plan 用）

1. `src/lib/healthFlags.mjs`：`NO_OPENS_TYPES` + `ZOMBIE_VIEW_MAX_NO_OPENS`（mcp/embedded 冷門判定）、殭屍狀態集合改 `PUBLIC_STATUSES`、`USAGE_THRESHOLD_MIN_SAMPLES` 保護。
2. `src/lib/healthFlags.test.mjs`：上述 6 條新增/回歸測試。
3. `src/components/HealthDashboard.jsx`：🧟 分區說明文字更新（不再限定 live）。

零 rules／零 migration／零 SA／零付費／零新依賴 → merge 即部署。
