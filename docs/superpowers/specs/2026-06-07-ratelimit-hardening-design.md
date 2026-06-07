# Rate-limit hardening — design（2026-06-07）

> 來源：`docs/optimization-audit-2026-06-07.md` #2（P1 短期建議）。

## Context

PR #17（AI route 收斂，已 merge）已替全部 4 支 AI route（generate / enrich-tool /
assist-block / refine-request）+ `/api/request` 加上 IP 前置限流 →
**audit #3「generate/enrich 無限流、覆蓋不一致」已解、本案不再處理**。

`src/lib/rateLimit.js` 剩兩個真問題：

1. **Map 記憶體洩漏**（audit「孤兒 key 緩慢洩漏」）：`hits` Map 的 key 從不移除。
   timestamps 只在「該 key 再次被存取」時才 filter；只打一次的 IP 會留下永久
   殘條。每個歷史不重複 IP 都各留一筆 → 單一 serverless 實例內無上限成長
   （會隨實例回收自愈，故低危，屬 hygiene）。
2. **零測試且不可測**：`rateLimit.js` 是 ESM 語法但副檔名 `.js`，repo 無
   `"type":"module"` → `node --test "src/lib/**/*.test.mjs"` 無法 import
   （正是 PR #17 的 helper 都用 `.mjs` 的原因）。它是唯一無測試的安全相關 helper。

### Out of scope（YAGNI）

- Upstash/KV 持久限流：audit §6 明列「暫緩」，需先開 KV + env，需求到了再做。
- uid-keyed 限流：對內部工具，IP-keying 已足夠且能擋未授權前的濫用；改 uid 邊際效益低。

## Changes

1. **Move** `src/lib/rateLimit.js` → `src/lib/rateLimit.mjs`
   （與 httpError/apiError/apiAuth/gemini 四個 `.mjs` helper 一致 + 讓 node:test 可 import）。
   更新 5 個 import 來源（generate / enrich-tool / refine-request / assist-block / request）
   為 `@/lib/rateLimit.mjs`（Turbopack 解析 `@/lib/*.mjs` 已於 #17 build 驗證）。
2. **修漏水**：週期性 sweep。store = `{ hits: Map, lastSweep }`，每次呼叫若
   `now - lastSweep >= windowMs` 就掃一遍：把每個 key 過濾掉視窗外的 timestamps，
   空了就 `delete`、否則寫回 filtered。把 store 收斂到「視窗內仍活躍的 key」。
3. **新增** `src/lib/rateLimit.test.mjs`（node:test，零依賴）。

## API（對 caller 不變）

```
rateLimit(key, { limit, windowMs }, clock = Date.now, store = defaultStore) → { ok, remaining }
```

- caller 仍只呼叫 `rateLimit(key, { limit, windowMs })`；`clock` / `store` 是測試注入縫
  （皆有預設值）。`store` 注入沿用原檔既有的 `clock` 注入慣例（DI 優於 test-only export，
  且每個測試傳自己的 store 即天然隔離、毋需 reset hook）。
- `clientIp(req) → string`：取 `x-forwarded-for` 第一跳，否則 `"unknown"`。**不變**。

滑動視窗語意完全保留：`arr`（before push）`>= limit` → 回 `{ok:false, remaining:0}`
且**不** push（拒絕不消耗未來額度）；否則 push、回 `{ok:true, remaining: limit - arr.length}`。

## Tests（node:test，注入 clock + store）

- 未達上限 → `ok:true`、remaining 遞減
- 達上限 → `ok:false`、`remaining:0`
- 拒絕的請求不消耗未來額度（視窗滑動後又能通過）
- 視窗滑動 → 舊 timestamps 過期、額度回復
- **sweep 清掉只打一次的 stale key → store size 有界**（漏水修正本體）
- sweep 保留視窗內仍活躍的 key
- `clientIp`：取第一跳 / 無 header 回 `"unknown"`

## Verification

`npm run test:unit`（現有 18 + 新）綠；`npm run build` 綠。對 caller behavior-preserving；
無 firestore.rules 變更、無 migration、無外部 infra。
