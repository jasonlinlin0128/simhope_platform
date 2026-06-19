# 即時新工具發布公告（pending/dev → live/beta/new 推 Discord）

- 日期：2026-06-18
- 狀態：設計定案（brainstorm 核可 → 待 writing-plans → review agent → 實作）
- 主題：admin 把工具發布（轉成 live/beta/new）的當下，立刻發 Discord 公告。補 #55 每週批次摘要的「即時」版，閉合飛輪「內容 → 發現」邊。

## 背景與問題

- #55 每週一批次摘要近 7 天新增工具；缺「發布當下即時公告」。
- 發布動作 = admin 在 `/admin` 用 `<select>` 改 `status`，走 `handleUpdateToolStatus`（`app/admin/page.jsx:128`）做 **client 端 `updateDoc({status})`**——**無 server route**。
- `notify.js`（Discord webhook）是 **server-only**（讀 `DISCORD_WEBHOOK_URL`，禁 client import）→ 即時公告必須經 server route。

## 決策（brainstorm 定案）

| 維度 | 決定                                                                        | 理由                                                                                                                                      |
| ---- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 觸發 | **轉入 {live,beta,new}（從非這三者：pending/dev/terminated）**，每工具一次  | 「成為可用工具」才公告；涵蓋 pending→上線 + dev→live；不發 dev/terminated                                                                 |
| 去重 | tool doc 加 `announcedAt`（serverTimestamp），client + route 雙層檢查       | 連點/重複呼叫不重發；純加欄位、無 migration/backfill                                                                                      |
| 架構 | **client `updateDoc` 不變 + 成功後打 announce server route**（best-effort） | 公告非關鍵；不為一個 best-effort side-effect 重建核心 publish 路徑（YAGNI）。route 用 Admin SDK 寫 `announcedAt`（繞過 rules）+ 發 notify |
| 通道 | **沿用既有免費 Discord webhook**（`DISCORD_WEBHOOK_URL`）                   | #55 / 需求通知已在用、零新付費 API / 零新 env                                                                                             |

> **為何不把 status 更新搬進 route**：admin select 會在所有 status 間自由切換（含 live↔beta↔terminated 重新分類）；把全部 status 寫入改走 route＝每次切換多一次 token 鑄造 + Admin SDK verify + round-trip，且要處理所有 status 值/驗證/錯誤/optimistic UI＝大 regression 面，只為換取邊際「權威性」。route 的 `announcedAt`+`status∈{live,beta,new}` 檢查已足夠權威去重。

## 目標 / 非目標

**目標**

- 發布（非公開→{live,beta,new}）當下發一則 Discord 公告，每工具一次。
- 純函式 `shouldAnnounce` + `buildAnnounceMessage` + TDD。
- 零外部付費 API、零新 npm 依賴、零新 env、零 firestore.rules 變更、無 migration/backfill。

**非目標（之後 / YAGNI）**

- LINE 通道（Phase C 暫緩）、重試佇列、改 publish UI、把 status 更新搬進 route、回填既有工具 `announcedAt`、公告含縮圖/embed。

## 架構與資料流

```
admin 改 <select> status
  → handleUpdateToolStatus(id, newStatus)（app/admin/page.jsx，client）
      prev = 該 tool 目前 status；announcedAt = 該 tool.announcedAt（admin state 既有）
      await updateDoc(doc(tools,id), { status: newStatus })   // 既有、不變
      if shouldAnnounce(prev, newStatus, announcedAt):
        idToken = await auth.currentUser.getIdToken()
        fetch POST /api/admin/announce-tool  { id }  Authorization: Bearer <idToken>
          （fire-and-forget；失敗只 console，不擋主流程）

POST /api/admin/announce-tool（server）
  IP 限流 → requireRole(req,["admin"]) → body.id
  Admin SDK 讀 tools/{id}（不存在 → 404）
  權威去重：tool.announcedAt 已存在 OR tool.status ∉ {live,beta,new} → { announced:false }（200 no-op）
  否則：notify(buildAnnounceMessage({id, ...tool}))  // best-effort、吞錯
        adminDb tools/{id} set({ announcedAt: serverTimestamp() }, {merge:true})
        → { announced:true }
```

## 元件

1. **`src/lib/announcePublish.mjs`（新，純函式）**
   - `export const ANNOUNCE_STATUSES = ["live", "beta", "new"];`
   - `shouldAnnounce(prevStatus, newStatus, announcedAt)` → `!announcedAt && !ANNOUNCE_STATUSES.includes(prevStatus) && ANNOUNCE_STATUSES.includes(newStatus)`。
   - `buildAnnounceMessage(tool)` → `🎉 新工具上線：${title}${tagline ? ` — ${tagline}` : ""}\nhttps://simhope-platform.vercel.app/tool/${id}`；缺 `title`→`"(未命名工具)"`。
2. **`src/lib/announcePublish.test.mjs`（新，node:test）** — 見「測試」。
3. **`app/api/admin/announce-tool/route.js`（新）** — 鏡像 `/api/analyze-demand` 的 import/限流/auth/錯誤處理：
   - `clientIp` + `rateLimit("announce-tool:<ip>", {limit:30, windowMs:60000})`。
   - `requireRole(request, ["admin"], { forbiddenMessage: "需要管理員權限" })`。
   - body `{ id }`；`id` 缺/非字串 → `HttpError(400)`。
   - `getAdmin()` → `adminDb.collection("tools").doc(id).get()`；不存在 → `HttpError(404)`。
   - 去重：`data.announcedAt` 已存在 OR `!ANNOUNCE_STATUSES.includes(data.status)` → `{ announced:false }`。
   - 否則：`notify(buildAnnounceMessage({ id, ...data }))` → `set({ announcedAt: FieldValue.serverTimestamp() }, {merge:true})` → `{ announced:true }`。
   - `catch` → `handleApiError(e, "/api/admin/announce-tool")`。
4. **`app/admin/page.jsx`（改 `handleUpdateToolStatus`）** — update 前抓 `prev`/`announcedAt`（從既有 admin tools state），update 成功後依 `shouldAnnounce` 帶 Bearer 打 route（try/catch 吞錯、不 toast 失敗、不擋）。需 `auth`（`@/lib/firebase`）取 idToken（比照 DemandBoard）。

## 誠實 / 邊界

- 公告 **best-effort**：`notify` 失敗（webhook 沒設/掛掉）吞錯；route 仍寫 `announcedAt`（不重試、不 spam）。
- **既有 live 工具不會被誤發**：client 只在「非公開→公開」轉換時呼叫（既有 live 工具沒人從 pending 重新發布）；route 再以 `announcedAt`/status 二次把關。`announcedAt` 純加欄位 → 無需 backfill。
- route 權威去重 → 連點/重複呼叫不重發；非 admin → 401/403。

## 💰 成本 / 基礎設施

- **零新付費 API、零新 npm 依賴、零新 env**（`DISCORD_WEBHOOK_URL` 已配置）。
- `announcedAt` 由 Admin SDK 寫（繞過 rules）、client 不寫 → **無 firestore.rules 變更**、無 index / TTL / migration / backfill。
- → merge 即部署生效。

## 測試（TDD）

`src/lib/announcePublish.test.mjs`（node:test）：

- `shouldAnnounce`：
  - `("pending","live",undefined)` → true；`("dev","live",undefined)` → true；`("pending","beta",undefined)`/`("pending","new",undefined)` → true。
  - `("pending","dev",undefined)` → false（dev 非公告狀態）；`("pending","terminated",undefined)` → false。
  - `("live","beta",undefined)` → false（prev 已公開）；`("new","live",undefined)` → false。
  - `("pending","live", <任何 truthy>)` → false（已公告）。
- `buildAnnounceMessage`：含 title/tagline/連結；缺 tagline → 無 dash；缺 title → `"(未命名工具)"`；連結為 `/tool/${id}`。

route / admin hook：`npm run lint` + `npm run build` + 部署後人工驗。

## Rollout

1. merge → Vercel 部署（無前置 ops；`DISCORD_WEBHOOK_URL` 已設）。
2. 部署後 Jason 驗：
   - 把一個 pending 工具改成 live → Discord 收到「🎉 新工具上線：…」一次。
   - 同工具再 live→beta→live → **不重發**（`announcedAt` 已設）。
   - 改成 dev / terminated → 不發。
   - **剛好可用在 #47 的 7 張 pending 卡發布**（每張 pending→live 各發一次）。

## 風險 / 緩解

- **client update 成功但 announce fetch 失敗** → 該次公告遺失、`announcedAt` 未設 → 之後該工具若再被改成公開狀態會補發（罕見、良性）；#55 每週摘要為 backstop。
- **Discord webhook 未設 / 掛掉** → `notify` 回 false 吞錯；route 仍寫 `announcedAt`（不重試）。best-effort 內部通知可接受。
- **連點 / 重複呼叫** → route `announcedAt` 權威去重 → 不重發。
