# Batch B — 匿名 track 完整性（C2 + C3）

> 來源：`docs/audit-2026-06-20-pr52-61.md`。Jason 決策：C2 走「**需登入才能按 👍**」（最防偽）。
> branch `feature-batch-b-track-integrity`（off main，與 Batch A/PR #62 無檔案重疊）。

## 目標

把「匿名輸入 → 可信下游 aggregate doc」這條鏈收緊：

- **C3**：`/api/track` 寫 per-tool key（開啟/瀏覽）前驗證 `toolId` 存在於目錄 → 擋掉任意字串長出孤兒 key、逼近 Firestore 單 doc 1 MB 上限。
- **C2**：`👍 有幫助`改成**登入才能按 + 後端 per-(uid,toolId) 去重** → 公開 badge/排名不再能被匿名直打 `/api/track` 灌水。

## 設計決策（locked）

1. **helpful 改走專用 authenticated endpoint**：新 `POST /api/tool-helpful`（驗 idToken→uid），**從 `/api/track` 移除 `tool_helpful`**（/api/track 只收匿名事件白名單 `ANON_TRACK_EVENTS` = tool_open/tool_view/search/request_submit）。
2. **去重存「伺服器專用」collection**（防登入者自行竄改自己 user doc 來重投）：`helpfulVotes/{toolId}__{uid}`，rules 一律 deny client（比照 passkeys）；只 Admin SDK 寫。已投過 → no-op（`{counted:false}`）。
   - 註：rules 對「未列出的 collection」本就 default-deny，故**即使 rules 未發布，client 也已無法讀寫 helpfulVotes**；新增明確 deny 規則只為一致性/文件化，**部署不需卡在 rules 發布**。
3. **toolId 驗證共用**：`serverCatalog.getServerToolIdSet()`（取 `getServerCatalog` 的 id 集合，ISR 快取）。**fail-open**：集合為空（取目錄失敗/空）→ 不過濾，維持現狀不誤擋。
4. **計數 doc 不變**：仍寫 `analytics/toolHelpful[toolId]`（+ totals/daily 比照原 `/api/track` tool_helpful 寫法），badge（`helpfulBadge` ≥3）與 #61 儀表板 helpful 欄照常讀，**既有計數保留**。
5. **HelpfulButton UX**：未登入 → 按鈕 disabled + 「登入後可回饋有幫助」小字（公開詳情頁仍可看 count）；登入 → 點擊帶 `user.getIdToken()` Bearer 打新 endpoint、樂觀 ++、localStorage 記 UI 已標記（伺服器去重為權威，重複點/換裝置只會 `counted:false`，不重複計）。

## 變更清單

| 檔                                 | 變更                                                                                            | 測試              |
| ---------------------------------- | ----------------------------------------------------------------------------------------------- | ----------------- |
| `src/lib/serverCatalog.js`         | +`getServerToolIdSet()`                                                                         | （REST，無 unit） |
| `src/lib/trackEvents.mjs`          | `buildIncrements(event,toolId,knownToolIds?)` 過濾未知 id 的 per-tool key；+`ANON_TRACK_EVENTS` | +unit             |
| `app/api/track/route.js`           | 只收 `ANON_TRACK_EVENTS`；取 idSet 傳入 buildIncrements（fail-open）(C3)                        | —                 |
| `src/lib/helpfulVote.mjs`          | +`buildVoteDocId(toolId,uid)`（純、防壞輸入）                                                   | +unit             |
| `app/api/tool-helpful/route.js`    | 新：IP 限流→verifyIdToken→驗 toolId→去重→increment (C2)                                         | —                 |
| `firestore.rules`                  | +`match /helpfulVotes/{id} { allow read,write: if false }`                                      | +rules            |
| `src/components/HelpfulButton.jsx` | login-gate + 改打新 endpoint                                                                    | —                 |
| `src/lib/track.js`                 | 去掉 tool_helpful 去重分支/jsdoc（已不經 track）                                                | —                 |

## 驗收

- test:unit 全綠 + 新增 trackEvents/helpfulVote 測；test:rules 加 helpfulVotes deny；lint 0 err；build ✓。
- 部署後：登出看詳情頁 👍 disabled+提示；登入點 👍→count++、重整仍標記、再點不重複計；直打 `/api/track {event:tool_helpful}` 回 400；直打 `/api/track {event:tool_view,toolId:亂碼}` 不長 per-tool key。
- **Jason 一次性**：Console 發布 firestore.rules（多 helpfulVotes deny；非必要，default-deny 已保護）。無 migration（既有 toolHelpful 計數續用）。
