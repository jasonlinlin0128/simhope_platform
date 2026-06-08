# getUserProfile 重複讀收斂 — 設計（audit #10）

> 日期：2026-06-08 ｜ 分支：`feature-db-read-consolidation`（從 main `010d188`）
> 來源：`docs/optimization-audit-2026-06-07.md` #10（perf / DB）

---

## 1. 背景 / 問題

`src/lib/db.js`：

- `getApprovedTools()`（L167-184）開頭 `if (auth.currentUser) { const profile = await getUserProfile(...); isAdmin = profile?.role === "admin"; }` — **讀一次 `users/{uid}`** 只為判 isAdmin。
- `getApprovedPainCards()`（L214-236）同樣的 block — **再讀一次同一 doc**。

`AuthContext`（`src/context/AuthContext.js`）**登入時已 `getUserProfile` 過一次**並持有 `isAdmin`。所以：

- **首頁**（`app/page.jsx` 同時叫 `getCatalog()`→getApprovedTools + `getApprovedPainCards()`）：登入者每次載入讀同一 `users/{uid}` **3 次**（AuthContext 1 + 這 2）。
- **hub**（`app/hub/page.jsx` 叫 `getCatalog()`）：**2 次**。

呼叫端盤點（grep `getApprovedTools|getApprovedPainCards|getCatalog|getAllTools`，排除 db.js）：**只有** `app/page.jsx` 與 `app/hub/page.jsx`（兩個公開門面頁）。`/admin` 用自己的 `getDocs(collection(db,"tools"))`、`/dashboard` 用自己的 `where("authorUid","==",uid)`、`getAllTools` 零外部呼叫端。admin/author 的「看 pending」需求各有專屬路徑。

## 2. 目標 / 非目標

**目標**：消除 `getApprovedTools`/`getApprovedPainCards` 內部多餘的 `getUserProfile` 讀取；isAdmin 改由呼叫端（已持有者）傳入。

**非目標**：

- 不改可見性「規則」（admin 看全部 / 其他看公開的契約不變）。
- 不動 rules / 無 migration。
- 不改 `/admin`、`/dashboard`、`/tool/[id]` 的資料路徑（它們不經這些函式）。

## 3. 方案：Option B（公開門面頁一律公開視圖）

唯一消費者是首頁 + hub 兩個**公開頁** → 它們本就該對所有人顯示**已發布的公開目錄**（admin 管 pending 在 `/admin`、author 在 `/dashboard`+`/tool/[id]`）。故：

- **db.js 三函式改吃 `isAdmin` 參數、預設 `false`**（fail-safe：沒傳＝公開視圖，絕不過度曝光），移除內部 `auth.currentUser`+`getUserProfile`。**保留** admin 分支（`getAllTools`）與契約（傳 `true` 仍回全部），未來可複用、語意不變。
- **首頁 + hub 不需改**：它們本來就 `getCatalog()` / `getApprovedPainCards()` 不帶參數 → 預設 `false` → 公開視圖。useEffect 原封不動、不需 useAuth、不需 gate、fetch 立即開跑。

### 3.1 `src/lib/db.js` 改動

- import：移除未再使用的 `auth`（改完僅這兩函式用過 `auth.currentUser`；`ensureUserDoc` 用 `user` 參數、不靠 `auth`）。`getUserProfile` 保留 export（AuthContext 仍用）。
- `getApprovedTools(isAdmin = false)`：刪開頭讀 profile 的 block，直接用參數 isAdmin 分支。
- `getApprovedPainCards(isAdmin = false)`：同。
- `getCatalog({ category, isAdmin } = {})`：把 isAdmin 透傳給 `getApprovedTools(isAdmin)`。

## 4. 行為影響

- **登入者首頁** 同一 `users/{uid}` 讀取 **3→1**（只剩 AuthContext 那次必要的）；**hub 2→1**。
- **公開 / 非 admin / 匿名 的可見性 byte 不變**（這些情境 isAdmin 本來就 false；最敏感的公開可見性零風險，呼應 2026-05-29 P0 教訓）。
- **唯一行為變化**：admin 在首頁/hub 從「client-nav 暖 auth 時 racy 看到 pending」→ **一律公開視圖**（更一致、更正確）。direct load / refresh 時 admin 本來也是看公開（`auth.currentUser` 多半未暖），故多數情況本就如此。
- 「目前收錄 N 個資源」等計數對所有人＝公開目錄數（不再被 admin 的 pending 灌水，更正確）。

## 5. 測試 / 驗證

- `npm run build` 綠。
- `npm run lint`：基準 **3 problems（0 error）** 不增；確認移除 `auth` import 後無 unused、無新問題。
- `grep -nE "getUserProfile|auth\.currentUser" src/lib/db.js` → `getApprovedTools`/`getApprovedPainCards` 內**不再**出現（僅 `getUserProfile` 的 export 定義保留）。
- **MCP playwright（公開、免登入）**：首頁 `/` 與 `/hub` 工具/痛點卡正常渲染（數量與線上一致）、無 console error、類別計數正常。
- 獨立 reviewer：核「讀取縮減」「isAdmin 預設 false fail-safe」「admin 分支契約保留」「首頁/hub 無需改且行為正確」「auth import 確實可移除（無其他用途）」。
- **🔲 Jason live 驗（auth-gated）**：以 admin 登入看首頁/hub 顯示公開目錄（不再混 pending）；以 admin 進 `/admin` 仍看得到全部 + pending（確認沒被波及）。

## 6. 交付 / 風險

- 分支 `feature-db-read-consolidation`（從 main）→ PR → 獨立 reviewer → CI/Vercel 綠 → 等 Jason merge。
- 風險低：單檔（db.js）、純讀取路徑、公開可見性不變；admin 首頁/hub 視圖小變化（→ 一致公開）。無 rules/migration、可乾淨 `git revert`。
- 不碰其他未 merge PR（本批已全 merge；main 乾淨）。

## 7. 完成定義（DoD）

- `getApprovedTools`/`getApprovedPainCards`/`getCatalog` 改吃 `isAdmin` 參數（預設 false）、內部不再 `getUserProfile`；`auth` import 移除。
- 首頁/hub 行為正確（公開視圖）、無需改動。
- build 綠、lint 不增、grep 確認、MCP 公開頁正常、reviewer READY。
