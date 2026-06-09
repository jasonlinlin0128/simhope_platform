# webauthnChallenges TTL + options 限流 — 設計（audit #6）

> 日期：2026-06-08 ｜ 分支：`feature-challenge-ttl-ratelimit`（從 main `e568a1a`）
> 來源：`docs/optimization-audit-2026-06-07.md` #6（資安）

---

## 1. 背景 / 問題

`src/lib/passkeyServer.js`：

- `storeChallenge`（L35）建 `webauthnChallenges/{id}` doc `{ challenge, uid, type, createdAt: Date.now() }` — **createdAt 是數字、無 TTL 欄位**。
- `consumeChallenge`（L48）取用即刪（單次）+ 5min 過期檢查。

**問題**：使用者開始 login/register（產生 challenge）但中途放棄 → challenge **永久殘留**（孤兒）。實測正式站已累積 **6 筆孤兒**（login 4 / register 2，年齡 5–8 天，全已過期）。一週 6 筆，不清會持續成長。

`login/options` route **無 auth**（usernameless login）、**無限流** → 免費寫入放大器（每打一次就建一筆 challenge doc）。`register/options` 有 `requireUser`（auth-gated，風險較低）但同樣無限流。

## 2. 目標 / 非目標

**目標**：

- 孤兒 challenge 由 Firestore TTL 自動清（新建的 + 既有 6 筆）。
- options endpoints 加 IP 限流，擋免費寫入放大。

**非目標**：

- 不改 `consumeChallenge` 邏輯（其 5min 檢查用 createdAt 數字，保留）。
- 不動 firestore.rules（webauthnChallenges 已 `deny-all`、server-only）。
- 不引外部限流 store（沿用既有記憶體 `rateLimit.mjs`，best-effort）。

## 3. 架構

### 3.1 `src/lib/passkeyServer.js` — TTL 欄位

- import admin `Timestamp`（`import { Timestamp } from "firebase-admin/firestore"`）。
- `storeChallenge` 計 `const now = Date.now();`，寫入加 `expireAt: Timestamp.fromMillis(now + CHALLENGE_TTL_MS)`（now+5min），`createdAt: now` 保留。
- 消費即刪（現有）＋ TTL 清孤兒（建了沒消費的，過 expireAt 後 Firestore 自動刪）。

### 3.2 options routes — IP 限流（鏡像 refine-request）

- `app/api/auth/passkey/login/options/route.js`：try 開頭加
  `const ip = clientIp(request); if (!rateLimit(\`pk-login:${ip}\`, { limit: 10, windowMs: 60000 }).ok) throw new HttpError(429, "操作過於頻繁，請稍後再試");`（加 import`rateLimit, clientIp`from`@/lib/rateLimit.mjs`、`HttpError`from`@/lib/httpError.mjs`）。現有 catch 回 `{error:e.message},{status:e.status||500}` → 429。
- `app/api/auth/passkey/register/options/route.js`：同樣 `pk-register:${ip}`、limit 10/60s（放在 try 開頭、`requireUser` 前，先擋洪水）。
- 限流值 10/min/IP：login 合法重試（取消後重按）綽綽有餘，又擋得住洗版；可日後調。

### 3.3 `scripts/backfill-challenge-expireat.mjs`（新，清既有孤兒）

- Admin SDK，依 `cleanup-approval-field` 範式但**無備份**（challenge 是單次性、已過期、無價值的 server-only nonce → 備份純儀式；且 backfill 只「加 expireAt」非破壞性，真正刪除由 TTL 做）。
- 取 `webauthnChallenges` 全量 → 篩 **無 expireAt** 者 → 補 `expireAt = Timestamp.fromMillis(base + CHALLENGE_TTL_MS)`，`base = (typeof createdAt === "number" ? createdAt : Date.now())`（typeof guard 防異常 doc）。既有全已過期 → expireAt 落過去 → TTL 隨即清。
- dry-run 預設（印「待回填 N」）/ `--apply` 才寫 / idempotent（`!expireAt` 跳過）/ 分批 200。

### 3.4 Console TTL policy（Jason）

- Firebase Console → Firestore → TTL → 建政策：collection `webauthnChallenges`、欄位 `expireAt`（可跟 #28 的 `requests` 一起建）。

## 4. 執行順序

1. merge + deploy（storeChallenge 起，新 challenge 開始寫 expireAt；options 開始限流）。
2. `node scripts/backfill-challenge-expireat.mjs`（dry-run → 應印「6 筆」）→ `--apply`。
3. Jason Console 建 TTL policy（`webauthnChallenges`/`expireAt`）。
4. 1–3 天 Firestore 自動清孤兒。

> 順序 2/3 可互換（policy 對無 expireAt 的 doc 不動作）；採 2→3。

## 5. 測試 / 驗證

- `npm run build` 綠、`npm run lint` 基準 3（0 error）不增。
- `npm run test:unit`：既有 26 條 node:test（含 rateLimit 8 條）續綠。
- backfill **dry-run 本地實跑**（serviceAccountKey.json 在 repo 根，只讀）：應印「總 6 / 無 expireAt 6 / 待回填 6」，落點過去。
- 限流：route 級不易 node:test（需 mock Next request + 模組級 store）；靠「鏡像 refine-request 既有模式 + rateLimit 既有測試覆蓋核心 + reviewer 核接線」；Jason 部署後可手測（連打 login/options >10 次/分 → 429）。
- reviewer：核 expireAt 為真 Timestamp、createdAt 保留、consumeChallenge 不受影響、限流 key/import 正確、backfill typeof guard + idempotent + 無備份正當。
- 🔲 Jason 部署後：Console 建 policy + 跑 backfill + （可選）手測 429。

## 6. 交付 / 風險

- 分支 `feature-challenge-ttl-ratelimit`（從 main）→ PR → 獨立 reviewer → CI/Vercel 綠 → 等 Jason merge + 部署 + 跑 backfill + Console policy。
- 風險低：純後端、challenge 是無價值 ephemeral、限流 best-effort（過嚴只會擋到自己連打、可調）。無 rules、無 client 改動。
- 與 #28 同類 TTL 機制（Jason 已熟）；backfill 無備份已於 §3.3 正當化（reviewer 會核）。

## 7. 完成定義（DoD）

- `storeChallenge` 寫 `expireAt`（Timestamp）；2 個 options route 加 IP 限流；backfill script 就緒（dry-run/--apply/idempotent/無備份）。
- build 綠、lint 不增、test:unit 26 綠、backfill dry-run 數字合理（6 筆）。
- 獨立 reviewer READY。
- PR 描述含 §4 執行順序 + Console policy 步驟 + Jason 待辦。
