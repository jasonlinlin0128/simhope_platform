# 🔒 analytics 逐工具明細讀取收斂設計

> 日期：2026-07-18 ・ 狀態：設計定稿，待寫 plan
> 來源：對 `feature-health-dashboard`（已部分 merge）跑的一輪安全性/CI 聚焦 review，
> 找到的 3 條發現之一（另 2 條：CI 無自動化關卡、`/admin` 只有 client-side 權限檢查，
> 兩條 Jason 決定先不處理，見 review 對話紀錄，不在本次範圍）。

## 背景

`firestore.rules` 目前對 `analytics/{docId}` 用一條萬用規則：`allow read: if true`。這個集合下有三份文件：

- `analytics/totals` — 全站累計數（`toolOpen`/`toolView`/`search`/`requestSubmit`），**沒有逐工具拆分**。
- `analytics/toolViews` — `{ toolId: viewCount }`，逐工具全期瀏覽數。
- `analytics/toolHelpful` — `{ toolId: helpfulCount }`，逐工具「👍 有幫助」數。

`app/api/track/route.js`、`app/api/tool-helpful/route.js` 驗證 `toolId` 時，是拿 `src/lib/serverCatalog.js::getServerCatalog()` 篩出的公開工具 id 集合來比對——這個集合只含 `status in [live,beta,new,dev,terminated]`，**排除 `pending`**（尚未審核、作者/admin 才看得到）的工具。

問題是：`toolViews`/`toolHelpful` 這兩份文件本身沒有依 `status` 過濾，寫入時只要有人瀏覽/按讚就會累積該 `toolId` 的計數——**包含 `pending` 工具**。而 rules 讓任何人（含匿名）能直接用 client SDK 把這兩份文件整份讀出來：不需要登入、不需要猜 UI，只要照 Firebase 專案設定（本來就是 public 的 client config）呼叫一次 `getDoc(doc(db,'analytics','toolViews'))`，就能拿到「有哪些工具存在＋各自熱門度」的完整清單，包含理論上 `pending` 狀態、尚未對外公開的那些——等於在正式審核/上架之前就洩漏了它們的存在與熱度。

`firestore.rules.test.mjs` 目前只測了 `analytics/totals`（聚合，本來就該公開，無妨），沒有測試涵蓋 `toolViews`/`toolHelpful` 這兩份逐工具文件，所以這個洞沒有被既有測試攔到。

### 目前有誰在讀這兩份文件

| 讀取者                                                                | 執行環境                                                                                                      | 現況讀法                                                                                                                                                                                                                 | 洩漏與否                                                                                                                                                            |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `HealthDashboard.jsx`                                                 | 瀏覽器（`"use client"`），只掛在 `/admin`（`app/admin/page.jsx` 已做 `if (!user \|\| !isAdmin) return null`） | `getDoc(doc(db,'analytics','toolViews'))` / `toolHelpful`                                                                                                                                                                | 目前靠 Firestore「list query 全有全無」的語意間接擋住非 admin；但這是兩份**單一文件**的 `getDoc`（不是 list query），理論上任何人都能自己呼叫，不受頁面 gating 保護 |
| `UsageDashboard.jsx`                                                  | 同上，同一個 admin 分頁                                                                                       | 同上（`totals`/`toolViews`/`toolHelpful` 都讀）                                                                                                                                                                          | 同上                                                                                                                                                                |
| `HelpfulButton.jsx`                                                   | 瀏覽器，掛在 `/tool/[id]` 詳情頁，**任何訪客都會看到**（設計上就是公開數字，只有投票要登入）                  | `getDoc(doc(db,'analytics','toolHelpful'))` 後取 `s.data()[toolId]`                                                                                                                                                      | **這是目前唯一真正合法、且非 admin 也需要的讀取**——但它整份讀回瀏覽器，devtools 能看到其他工具（含 pending 尚未審核的）的計數，即使畫面只顯示一個數字               |
| `serverCatalog.js` 的 `getServerToolViews()`/`getServerToolHelpful()` | Server Component（RSC），匿名 Firestore REST（`fetch` 無 auth header，走跟 client SDK 一樣的 rules）          | 整份抓回伺服器，但只把值接到已經用 `status IN [live,beta,new,dev,terminated]` 篩過的 `getServerCatalog()` 工具清單上（`attachHelpfulCounts`/`rankPopularTools` 只 `map` 給定的 tools 陣列，不會把整份 map 序列化進頁面） | **不洩漏**——原始 map 只在伺服器記憶體出現，從未進到瀏覽器                                                                                                           |
| `getServerMetrics()`（`analytics/totals`）                            | 同上                                                                                                          | 匿名 REST                                                                                                                                                                                                                | 不涉及逐工具資料，無洩漏疑慮                                                                                                                                        |

結論：真正需要修的是「規則允許任何人整份讀 `toolViews`/`toolHelpful`」這件事本身，加上「把目前唯一合法的公開讀取（`HelpfulButton` 的單一數字）改成不會連帶洩漏整份 map 的形式」。`serverCatalog.js` 的兩支函式雖然本身不洩漏，但一旦收緊 rules，它們的匿名 REST 讀取也會被擋 403，必須改用 Admin SDK 才能維持首頁/`/hub` 現有功能。

## 設計

### 1. Rules：拆成三條明確路徑

```
// Old
match /analytics/{docId} {
  allow read: if true;
  allow write: if false;
}

// New
match /analytics/totals {
  allow read: if true;      // 聚合數，無逐工具拆分，維持公開
  allow write: if false;
}
match /analytics/toolViews {
  allow read: if isAdmin(); // 逐工具，收斂
  allow write: if false;
}
match /analytics/toolHelpful {
  allow read: if isAdmin(); // 逐工具，收斂
  allow write: if false;
}
```

`analytics_daily/{day}` 不動（已經是 `isAdmin()`）。

### 2. `serverCatalog.js`：兩支函式改用 Admin SDK

`getServerToolViews()`/`getServerToolHelpful()` 從匿名 `fetch(...):runQuery`/REST 改成用 `getAdmin().adminDb` 直接讀（伺服器對伺服器，繞過 rules，本來就是可信邊界內——這個 repo 既有的 Admin SDK 讀取函式都是同樣寫法）。回傳值形狀（`Record<string, number>`，`pickNumericFields` 過濾非數值欄位）完全不變，呼叫端（`app/page.jsx`、`app/hub/page.jsx`）不用改。

`getServerMetrics()`（讀 `totals`）不動——規則沒收緊，繼續用匿名 REST。

### 3. 新 API：`GET /api/tool-helpful/[toolId]`

沿用這個 repo 既有 API route 的寫法（`enforceRateLimit` + `HttpError`/`handleApiError`）：

```
GET /api/tool-helpful/:toolId
→ enforceRateLimit(req, "tool-helpful-count", { limit: 60, windowMs: 60000 })
→ getAdmin().adminDb.collection("analytics").doc("toolHelpful").get()
→ return { count: snap.data()?.[toolId] ?? 0 }
```

不存在的 `toolId`（打錯字、亂猜、甚至猜中一個 pending 工具的 id）一律自然回 `0`——不用額外驗證存在性，因為「查無此工具」跟「存在但目前 0 個讚」本來就該回傳同一種結果，不主動幫攻擊者分辨兩種情況。

殘餘風險：這支 API 讓人可以一個一個 toolId 去試探「這個 id 有沒有計數」，但一次只能問一個 id（有限流），比起現況「一次讀整份 map 拿到所有 id」是數量級的降級，且工具 id 本身不是遞增數字（用的是 Firestore doc id 或 slug），逐一猜測的成本很高。可接受。

### 4. `HelpfulButton.jsx`：改讀新 API

```js
// Old
const s = await getDoc(doc(db, "analytics", "toolHelpful"));
const v = s.exists() ? s.data()[toolId] : 0;

// New
const res = await fetch(`/api/tool-helpful/${encodeURIComponent(toolId)}`);
const data = await res.json().catch(() => ({}));
const v = typeof data.count === "number" ? data.count : 0;
```

`onClick`（投票）邏輯不變，仍打既有的 `POST /api/tool-helpful`。

### 5. `HealthDashboard.jsx` / `UsageDashboard.jsx`

不改程式碼。這兩支本來就只在真 admin 底下 mount，rules 從「靠 list-query 全有全無語意間接擋住非 admin 直接 `getDoc`」變成明確 `isAdmin()` 規則檢查——行為對合法 admin 使用者完全不變，只是把「湊巧安全」換成「明確安全」。

## 非目標（YAGNI）

- 不拆成 public/all 兩份 doc（`toolViewsPublic`/`toolViewsAll`）。討論過這個方案：需要 writer 在寫入當下查 `tool.status` 決定寫哪份、需要 migration 備份現有資料、admin 讀取路徑要換 collection——複雜度遠高於「把兩支伺服器函式從 REST 換成 Admin SDK + 加一支 scoped API」，且沒有帶來額外的安全收益（伺服器端信任邊界內讀取本來就不會外洩）。
- 不改 `/api/track`、`/api/tool-helpful`（POST 版）的寫入邏輯——這次只動讀取路徑，寫入行為完全不變。
- 不幫新 API 加 `toolId` 存在性驗證——見上方「殘餘風險」段落，刻意不做。
- 不動 `analytics_daily`（本來就 `isAdmin()`，跟這次的洞無關）。
- CI 自動化關卡、`/admin` server-side middleware 兩條 review 發現的其他缺口——Jason 已決定本次不處理，維持現狀。

## 測試

**`firestore.rules.test.mjs`**（emulator）：

- `analytics/totals`：anon/非 admin/admin 都能讀 → 維持公開（回歸鎖，避免以後有人手滑把三條規則揉回一條）。
- `analytics/toolViews`：anon DENY、已登入非 admin DENY、admin ALLOW。
- `analytics/toolHelpful`：同上三條。
- write 一律 DENY（沿用既有，client 永遠不能寫）。

**新 API**（`node --test`，mock `getAdmin()`）：

- 已知 toolId 有計數 → 回該計數。
- 未知/亂打的 toolId → 回 `0`（不是 404/500）。
- 超過限流 → 429。

**手動驗證（deploy 後）**：

- 登入非 admin 帳號開 devtools，嘗試 `getDoc(doc(db,'analytics','toolViews'))` → 應該被 rules 拒絕。
- 訪客瀏覽任一工具詳情頁，`/tool/[id]` 的「👍 N」數字仍正確顯示。
- 首頁/`/hub` 熱門排行、helpful badge 數字不變（用既有工具的已知計數核對）。

## 風險與範圍

- `firestore.rules` 變更：跟專案慣例一致，**Jason 手動在 Console 發布**（Admin SDK SA 沒有 `firebaserules.releases.create` 權限）。
- **發布順序**：這次是純讀取權限收斂，不牽涉資料結構/migration，不受 AGENTS.md 那條「migration 要等 code 先上線」規則管——但建議還是 code merge/deploy 後再發布 rules，這樣如果 rules 發布有問題，至少新的 Admin SDK 讀取路徑已經在跑，不會有「rules 先鎖、code 還沒切過去」的空窗期讓 `HelpfulButton`/首頁排行暫時讀不到資料。
- 零 migration、零新 collection、零付費依賴、零 schema 變更——純粹是「換一種方式讀同一份資料」+「收緊一條規則」。

## 交付清單（給 plan 用）

1. `firestore.rules`：拆 `analytics/{docId}` 為 `totals`/`toolViews`/`toolHelpful` 三條明確規則。
2. `firestore.rules.test.mjs`：補 6-7 條測試（見上）。
3. `src/lib/serverCatalog.js`：`getServerToolViews()`/`getServerToolHelpful()` 改用 Admin SDK。
4. `app/api/tool-helpful/[toolId]/route.js`（新檔）：GET，限流 + 回單一 toolId 的 count。
5. `src/components/HelpfulButton.jsx`：讀取來源從 `getDoc` 改成 `fetch('/api/tool-helpful/:toolId')`。
6. 手動驗證清單（見上）跑一次，確認三個公開面（詳情頁 badge、首頁排行、`/hub` 排行）數字不變。

不動：`analytics_daily`、`/api/track`、`/api/tool-helpful`（POST）、`HealthDashboard.jsx`、`UsageDashboard.jsx`、`rankPopularTools`/`attachHelpfulCounts`/`pickNumericFields`。
