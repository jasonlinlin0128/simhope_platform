# B-2a 開發者申請狀態可見 — 設計

> 日期：2026-06-10 ｜ branch：`feature-dev-status-visible`
> 來源：平台體檢「B 區」B-2（需求回饋迴路）拆出的第一半。B-2b（feature 需求迴路 + uid 捕捉 + rules）另開 spec。

## 1. 問題

使用者送出開發者申請後**看不到任何狀態**：

- `users/{uid}.devStatus`（pending/approved/rejected）其實**全程有維護**——申請時 `/api/request` 設 `pending`；admin 在 RequestInbox 核准→`approved`(+role:developer)、拒絕→`rejected`（`src/components/RequestInbox.jsx:88-116`）。
- 但**全 codebase 沒有任何地方把 devStatus 讀回來顯示給申請者**。AuthContext 的 `profile` 已載入整份 user doc（含 devStatus），只是沒人 render。
- **順帶 bug**：`/access` 的「📩 申請成為開發者」按鈕只看 `current === "viewer"`（`app/access/page.jsx:104`）。pending 申請者 role 仍是 viewer → **按鈕還在 → 可能重複送申請**，且毫無「已收到」回饋。

## 2. 目標 / 非目標

**目標**：在 `/access` 把使用者**已經有**的開發者申請狀態渲染出來，關掉「申請點下去沒反應」黑洞、順手擋重複送。

**非目標（YAGNI）**

- ❌ feature「提需求」迴路 / uid 捕捉 / 「我的需求」檢視 / rules 改 —— 全在 **B-2b**。
- ❌ 動 firestore.rules（devStatus 在 user 自己的 doc，登入者本就可讀；零 rules）。
- ❌ 即時更新（申請後 reload 反映 pending；LoginModal 自身有「✅ 已送出」即時確認）。
- ❌ Navbar / dashboard / 全站提示（決策＝**只 /access**）。

## 3. 已確認的產品決策（Jason）

- **狀態顯示處**：只 `/access`（申請的地方＝看狀態的地方）。
- **rejected 允許重新申請**（不鎖）。
- **文案**：
  - pending → `🕓 申請審核中，佳賢跟他的代理人評估後會通知你`
  - rejected → `✕ 申請未通過` + 小字 `如需重新申請請聯絡佳賢`
- **待 Jason spec-review 定奪**：rejected 既「允許重新申請」又給「聯絡佳賢」小字 → 本設計**兩者都放**（in-app「📩 重新申請」鈕 + 聯絡小字）。若只要人工路（聯絡佳賢、無鈕），review 時說一聲即可砍鈕。

## 4. 設計

### 4.1 純邏輯 `src/lib/devStatus.mjs`（可測）

```js
/**
 * 依角色 + devStatus 決定 /access 開發者卡要顯示哪種 CTA。
 * @param {"admin"|"developer"|"viewer"} role  （呼叫端已過濾未登入 → 不會是 null）
 * @param {string|undefined} devStatus  users/{uid}.devStatus
 * @returns {"apply"|"pending"|"rejected"|"none"}
 */
export function devCtaState(role, devStatus) {
  if (role === "developer" || role === "admin") return "none"; // 已有權限，角色卡已表達
  if (devStatus === "pending") return "pending";
  if (devStatus === "rejected") return "rejected";
  if (devStatus === "approved") return "none"; // 理論上 role 已 developer；防呆
  return "apply"; // viewer 無 devStatus：可申請
}
```

### 4.2 `src/components/DevStatusCTA.jsx`

- `"use client"`，吃 `useAuth()`：
  - `if (!user) return null;`（未登入：頁面別處已有「登入後即可申請」）
  - `role = isAdmin ? "admin" : isDeveloper ? "developer" : "viewer"`
  - `state = devCtaState(role, profile?.devStatus)`
- prop：`{ onApply: () => void }`（觸發開 LoginModal）
- render：
  - `apply` → `<button onClick={onApply}>📩 申請成為開發者</button>`（沿用原樣式）
  - `pending` → 狀態框：`🕓 申請審核中，佳賢跟他的代理人評估後會通知你`（無鈕）
  - `rejected` → 狀態框：`✕ 申請未通過` + 小字 `如需重新申請請聯絡佳賢` + `<button onClick={onApply}>📩 重新申請</button>`
  - `none` → `null`
- 樣式沿用既有 token（`var(--color-clay-purple)` 鈕、狀態框用 card-bg/border + 適當色；pending 偏中性、rejected 偏紅）。

### 4.3 `app/access/page.jsx`

把 `app/access/page.jsx:104-111` 的 inline 申請鈕：

```jsx
{r.key === "developer" && current === "viewer" && (
  <button onClick={() => setShowReq(true)} ...>📩 申請成為開發者</button>
)}
```

換成：

```jsx
{
  r.key === "developer" && <DevStatusCTA onApply={() => setShowReq(true)} />;
}
```

（CTA 內部自行依 role/devStatus 決定顯示什麼；developer/admin 看自己卡時回 none，不影響原本「你目前：開發者」角色卡標示。）

## 5. 資料流 / 邊界

- **來源**：`useAuth().profile.devStatus`（已載入、登入者可讀自己的 user doc）。
- **申請後即時性**：LoginModal 送出設 server 端 devStatus=pending，但 in-memory `profile` 仍舊值 → /access 要 **reload** 才見 pending。LoginModal 自有「✅ 已送出申請」即時確認，故 UX 不斷裂。**可接受**（不加 profile 自動 refresh，YAGNI）。
- **rejected 重新申請流**：點「📩 重新申請」→ 開 LoginModal → 既有 `/api/request type:access` 成功會把 devStatus 打回 `pending` + 新增一筆 request（server 端現行行為，無需改）→ reload 後 /access 顯示 pending。✅ 端到端可行、零後端改動。

## 6. 測試

- **unit（node:test）**：`src/lib/devStatus.test.mjs` 蓋 `devCtaState` 全組合：developer/admin→none；viewer×{undefined/pending/rejected/approved}→apply/pending/rejected/none。
- **build / lint**：基準不變（lint 2 warnings 0 errors）。
- **手動 / 我代驗**：Admin SDK 設 testdev `devStatus`=pending/rejected/清空 → playwright 登入 /access 截三態 + 驗重新申請鈕在 rejected 出現、pending 無鈕。

## 7. 影響檔案

**新增**：`src/lib/devStatus.mjs` + `.test.mjs`、`src/components/DevStatusCTA.jsx`
**修改**：`app/access/page.jsx`（apply 鈕 → `<DevStatusCTA>`）
**不動**：firestore.rules、/api/request、RequestInbox、AuthContext（全沿用）。

## 8. Rollout

無 rules、無 migration、無 Console 步驟。merge → deploy → 我代驗三態。
