# AI Route 收斂 — 設計 spec（2026-06-07）

> 來源：`docs/optimization-audit-2026-06-07.md` §6 建議下一步「2. AI route 收斂（1 PR）」。
> 一次解 backlog 5 條：**#1**（auth REST→Admin SDK 不一致）、**#3**（generate/enrich 無限流）、
> **#4**（Gemini 呼叫四處複製、無 timeout）、**#5**（generate JSON.parse 無 try/catch）、
> **#23**（Gemini key 放 URL query）。
>
> 分支：`feature-ai-route-consolidation`。**無 migration、不動 firestore.rules / storage.rules**（純後端 helper 抽取 + 路由改寫）。
>
> **本 spec 已併入對抗式 review（6 lens + refute-pass）的修正**：詳見各節「review 修正」標記與 §11。

---

## 1. 問題

4 支 API route 各自手刻 Gemini 呼叫與授權，重複且脆弱：

| Route                                | 授權方式                                                            | 限流      | Gemini parse                                   | 其它                           |
| ------------------------------------ | ------------------------------------------------------------------- | --------- | ---------------------------------------------- | ------------------------------ |
| `app/api/generate/route.js`          | REST（Identity Toolkit `accounts:lookup` + Firestore REST 讀 role） | **無**    | **`JSON.parse` 無 try/catch → 壞 JSON 噴 500** | role: dev/admin                |
| `app/api/admin/enrich-tool/route.js` | 同上                                                                | **無**    | 有 try/catch→502                               | role: admin                    |
| `app/api/ai/assist-block/route.js`   | 同上                                                                | IP 10/min | 純文字、無 parse                               | role: dev/admin；SSRF 來源抓取 |
| `app/api/refine-request/route.js`    | **匿名**（不驗）                                                    | IP 5/min  | `JSON.parse`（在 try 內→catch 成 500）         | 匿名直打 Gemini                |

共通缺陷：

1. **授權耦合 client-readable rule**（#1）：前 3 支用 `FIREBASE_WEB_API_KEY` 走 REST 驗 token，再用 client idToken 走 Firestore REST 讀 `users/{uid}.role`。這把「是不是 admin」壓在「`users` read 對所有登入者開放」這條 rule 上 —— rule 一收緊就**無聲壞掉**（正是 AGENTS.md 記載過的「資料×程式碼 runtime 不一致」類坑）。專案已有 Admin SDK（`src/lib/firebaseAdmin.js`），`/api/request` 已示範正解（`adminAuth.verifyIdToken` + `adminDb`）。
2. **Gemini 呼叫四處複製**（#4）：model 名 `gemini-2.5-flash` 硬編 4 次、`generationConfig` 各寫各的、**無 timeout/AbortController**、錯誤格式不一致。
3. **key 放 URL query**（#23）：`?key=${GEMINI_API_KEY}` 易進存取 log，應改 `x-goog-api-key` header。
4. **限流覆蓋不一致**（#3）：匿名的 refine 反而有限流，會燒 Gemini 額度的 generate/enrich 卻沒有。
5. **parse 脆弱**（#5）：generate 的 `JSON.parse` 漏了 try/catch。

---

## 2. 範圍

**In（strict ②）**：#1 / #3 / #4 / #5 / #23，跨上述 4 支 route。

**Out（已與 Jason 確認）**：

- #2 持久化限流（Upstash/KV）—— 維持 in-memory best-effort，YAGNI。
- #7 passkey `handleApiError`—— 不同 route 群、獨立項，本次不碰 passkey route。
- #24 enrich-tool GitHub 正則未錨定 host —— 雖在本次會編輯的檔案內，但屬獨立 P3，**刻意不順手改**（保持 PR 範圍乾淨）。
- 不刪 Vercel 環境變數：`FIREBASE_WEB_API_KEY` 改完後沒有任何 route code 參照（可日後從 Vercel env 退休），但本 PR **不動 env 設定**，只在程式層移除依賴。**唯 README 對它的「用途」註解會變 stale，需一併更新（見 §10）。**

> **解鎖紀錄（review 補）**：本 PR 落地後，`firestore.rules:38` 的 `users allow read: if isSignedIn()` 不再有任何 server 端依賴（role 讀取改走 `adminDb` 繞 rules）。收緊 users read（例如「只能讀自己 + admin」）因此變成乾淨的後續獨立項，建議與審計 S3 rules 收緊一起排。**本 PR 不動 rules**，只在此留下解鎖事實。

---

## 3. 架構

新增 4 個檔（3 個有單元測試），改寫 4 支 route。

### 3.1 模組系統決策（重要）

`package.json` **沒有 `"type": "module"`** → Node 預設把 `.js` 當 CommonJS。現有 `src/lib/*.js` 是「ESM 語法寫在 `.js`」。

> **review 修正（事實校準）**：原稿說「`node --test` 直接 import `.js` 會 SyntaxError」**不精確**。Node v22.22.2 對 typeless package 的 `.js`，若以 CJS 解析失敗但偵測到 ESM 語法，會**自動 reparse 成 ESM**（只丟 `MODULE_TYPELESS_PACKAGE_JSON` warning，非 error）。所以「`.js` 不可被 node import」並不成立——真正想避免的是「測試環境載入 firebase-admin 這個重依賴」與「依賴 reparse 這個較新行為」。

決策：**新 helper 一律 `.mjs`**（明確 ESM、無 reparse warning、與既有 `firestore.rules.test.mjs`「用 `.mjs` 讓 node 直跑」一致）。

- **不加 `"type": "module"`**：會把全庫 `.js` 變 ESM，牽動 config 檔，churn 大、違背 lockfile-churn 取向。`.mjs` 是最小侵入解。
- **Route（`route.js`）維持 `.js`**，由 Next 打包；import 新 helper 時**帶明確 `.mjs` 副檔名**。
  > **review 修正（bundler）**：Next 16 預設 bundler 是 **Turbopack**（`package.json` 的 build 是裸 `next build`）。Turbopack 的 `resolveExtensions` 預設清單（`.mdx/.tsx/.ts/.jsx/.js/.json`）**不含 `.mjs`**，但**明確帶副檔名**（`@/lib/gemini.mjs`）是直接命中該檔、不受 resolveExtensions 影響 → 可正常解析。`@/*`→`./src/*` 由 `jsconfig.json` 提供。退路：若 Turbopack 對 explicit-`.mjs`-alias 有非預期行為，`npm run build` 會即時暴露，再退回 `.js` + 自寫 runner。

### 3.2 模組清單

| 檔                      | Exports                                             | next/server?   | 測試                      |
| ----------------------- | --------------------------------------------------- | -------------- | ------------------------- |
| `src/lib/httpError.mjs` | `class HttpError`（純，無 import）                  | 否             | ✅ `httpError.test.mjs`   |
| `src/lib/apiError.mjs`  | `handleApiError(e, label)`（+ re-export HttpError） | **是（唯一）** | ➖（薄包裝；build+route） |
| `src/lib/apiAuth.mjs`   | `requireRole(req, roles, opts?)`                    | 否             | ✅ `apiAuth.test.mjs`     |
| `src/lib/gemini.mjs`    | `callGemini(opts)`                                  | 否             | ✅ `gemini.test.mjs`      |

**關鍵隔離**：`next/server`（`NextResponse`）**只在 `apiError.mjs` 出現**。`HttpError` 這個共用 class 抽到純 `httpError.mjs`，讓 `gemini.mjs` / `apiAuth.mjs`（及其測試）能 `import { HttpError }` 而**完全不把 next 拉進 import graph** → 三支單元測試純、快、無 Next runtime 解析風險。`resolveError`（將任意 throw 映成回應形狀）內聚在 `apiError.mjs`，邏輯 trivial，不單獨建測（由 route 行為與 build 覆蓋）。

> **review 修正（過度切分）**：原稿把 `resolveError` 放純模組並單獨測（等於斷言 `instanceof` 本身）。改為 `httpError.mjs` 只放 class、`resolveError` 併進 `apiError.mjs`——保留「next 隔離」這個真正的好處，砍掉 trivial 測試與多餘接縫。

---

## 4. 模組契約

### 4.1 `src/lib/httpError.mjs`（純，無外部 import）

```js
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}
```

### 4.2 `src/lib/apiError.mjs`（薄包裝，唯一 import next）

```js
import { NextResponse } from "next/server";
import { HttpError } from "./httpError.mjs";

export { HttpError };

// 把任何 throw 出來的東西映成「對外回應」。
// HttpError → 用它的 status/message（預期錯誤）。其它 → 500 通用訊息 + server log。
export function handleApiError(e, label) {
  if (e instanceof HttpError) {
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
  console.error(`[${label}]`, e); // 非預期才印（含 stack），方便 Vercel log 區分「真沒權限」vs「Firestore 掛了」
  return NextResponse.json({ error: "伺服器錯誤" }, { status: 500 });
}
```

Route 用法：`import { HttpError, handleApiError } from "@/lib/apiError.mjs";`（throw 與 catch 用的是同一個 class，`instanceof` 跨檔成立。）

### 4.3 `src/lib/apiAuth.mjs`

```js
import { HttpError } from "./httpError.mjs";

/**
 * 驗 Bearer idToken（Admin SDK）+ 讀 users/{uid}.role，role 不在 roles 內就擋。
 * @param {Request} req
 * @param {string[]} roles            允許的角色，如 ["developer","admin"]
 * @param {object}  [opts]
 * @param {string}  [opts.forbiddenMessage]  403 自訂訊息（保留各 route 既有用語）
 * @param {{adminAuth, adminDb}} [opts.admin]  注入點（測試用）；未注入時於 prod 動態載入 getAdmin
 * @returns {Promise<{uid:string, role:string|undefined}>}
 * @throws  {HttpError} 401 未授權 / 403 權限不足
 */
export async function requireRole(req, roles, opts = {}) {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) throw new HttpError(401, "未授權");

  // 注入優先；prod 走動態 import（見下方說明）。
  const { adminAuth, adminDb } =
    opts.admin ?? (await import("./firebaseAdmin.js")).getAdmin();

  let decoded;
  try {
    // 刻意不帶 checkRevoked：本地驗簽 + 快取公鑰即可，無每請求網路往返。
    // 開 checkRevoked 會走 getUser() 每請求多一次 Identity Toolkit 呼叫、重新引入
    // 本 refactor 想消除的 per-request 網路成本；本內部工具 token 1hr 自然過期、無強制即時登出需求。
    decoded = await adminAuth.verifyIdToken(token);
  } catch {
    throw new HttpError(401, "未授權");
  }
  const uid = decoded.uid;

  const snap = await adminDb.collection("users").doc(uid).get();
  const role = snap.exists ? snap.data().role : undefined; // Admin SDK：exists 是 property、data() 是 method
  if (!roles.includes(role)) {
    throw new HttpError(403, opts.forbiddenMessage || "權限不足");
  }
  return { uid, role };
}
```

**動態 import `firebaseAdmin.js` 的理由（review 修正後）**：

- 目的是讓 `node --test` 載 `apiAuth.mjs` 時**完全不載入 firebase-admin**（測試一律注入 `opts.admin`），保持測試輕快、且**不依賴** Node 對 typeless `.js` 的 ESM reparse 行為。
- **為何不把 `firebaseAdmin.js` 改名 `.mjs` 做靜態 import**：`firebaseAdmin.js` 目前被 passkey/request 等路由以**無副檔名** `@/lib/firebaseAdmin` import；Turbopack 預設不解析 `.mjs`，改名會逼著去動那些**範圍外**的 importer（passkey 路由）→ scope creep。故維持 `firebaseAdmin.js` 不動，用動態 import 隔離測試。
- `getAdmin()` 本身 lazy 單例，prod 行為不變。

### 4.4 `src/lib/gemini.mjs`

````js
import { HttpError } from "./httpError.mjs";

const GEMINI_MODEL = "gemini-2.5-flash";
const ENDPOINT = (model) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

/**
 * 單一 Gemini 呼叫點。集中 model 名、x-goog-api-key header、timeout、JSON 解析、錯誤格式。
 * @param {object} o
 * @param {string}  o.prompt                  整段 prompt（system+user 已拼好）
 * @param {boolean} [o.json=false]            true → responseMimeType json + 回 parse 過的物件；false → 回 trimmed 字串
 * @param {number}  [o.temperature=0.7]
 * @param {number}  [o.maxOutputTokens]       傳了才帶進 generationConfig
 * @param {number}  [o.timeoutMs=20000]
 * @param {string}  [o.model=GEMINI_MODEL]
 * @param {Function}[o.fetchImpl=fetch]       注入點（測試）
 * @param {string}  [o.apiKey=process.env.GEMINI_API_KEY]  注入點（測試）
 * @returns {Promise<object|string>}  json:true → object；否則 string
 * @throws  {HttpError} 500 未設 key / 502 上游失敗或壞 JSON / 504 timeout
 */
export async function callGemini({
  prompt,
  json = false,
  temperature = 0.7,
  maxOutputTokens,
  timeoutMs = 20000,
  model = GEMINI_MODEL,
  fetchImpl = fetch,
  apiKey = process.env.GEMINI_API_KEY,
} = {}) {
  if (!apiKey) throw new HttpError(500, "伺服器未設定 Gemini API Key");

  const generationConfig = { temperature };
  if (json) generationConfig.responseMimeType = "application/json";
  if (maxOutputTokens) generationConfig.maxOutputTokens = maxOutputTokens;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetchImpl(ENDPOINT(model), {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig,
      }),
      signal: controller.signal,
    });
  } catch (e) {
    if (e?.name === "AbortError")
      throw new HttpError(504, "AI 服務逾時，請稍後再試");
    throw e; // 其它網路錯 → 由 handleApiError 當非預期 500（並 log）
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const detail = (await res.text().catch(() => ""))
      .replace(/AIza[0-9A-Za-z_-]{35}/g, "AIza***") // 萬一上游訊息夾帶 key 片段，遮罩後再進 log
      .slice(0, 500);
    console.error(`[callGemini] Gemini ${res.status}: ${detail}`); // 上游細節進 server log
    throw new HttpError(502, `AI 服務暫時無法使用 (${res.status})`); // 對外 generic
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  if (!json) return text.trim();

  const raw = (text || "{}").replace(/```json\n?|\n?```/g, "").trim();
  try {
    return JSON.parse(raw);
  } catch {
    throw new HttpError(502, "AI 回傳格式無法解析，請重試");
  }
}
````

說明：

- **上游錯誤兩全**：`!res.ok` 時 `console.error` 上游 status+body（debug 用、key 遮罩），對外只回 generic 502（不洩漏）。
- **json 模式空回應**：`text || "{}"` → parse 成 `{}`，**保留 generate/enrich/refine 既有「空→{}」行為**。
- **text 模式**：回 trimmed 字串（可能空字串）；「空內容要 502」的判斷留給 caller（assist-block 保留自己的空檢查），讓 helper 單一職責。

---

## 5. Route 改寫（逐支）

每支都包成單一 `try { ... } catch (e) { return handleApiError(e, "<route>"); }`。所有早退（缺欄位、限流）改成 `throw new HttpError(...)`。

> **限流定位（review 修正）**：3 支 authed route 的限流改放在 **`requireRole` 之前**、用 **per-IP** 鍵。理由：限流要擋在「任何昂貴工作（verifyIdToken + Firestore users 讀）之前」，否則「合法 token 但角色不符」的 403 路徑會繞過限流、無上限打 Firestore。per-IP pre-auth 閘是最簡單且正確的位置，與匿名 refine 一致；對數十位可信內部開發者，per-IP 足夠（放棄 per-user 公平是可接受取捨）。各 route 都需 `import { rateLimit, clientIp } from "@/lib/rateLimit"`。

### 5.1 `app/api/generate/route.js`（dev/admin）

```js
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/apiAuth.mjs";
import { callGemini } from "@/lib/gemini.mjs";
import { HttpError, handleApiError } from "@/lib/apiError.mjs";
import { rateLimit, clientIp } from "@/lib/rateLimit";

const SYSTEM_PROMPT = `...原樣不動...`;

export async function POST(request) {
  try {
    const ip = clientIp(request);
    if (!rateLimit(`generate:${ip}`, { limit: 10, windowMs: 60000 }).ok)
      throw new HttpError(429, "操作過於頻繁，請稍後再試");

    await requireRole(request, ["developer", "admin"], {
      forbiddenMessage: "需要開發者權限才能使用 AI 生成功能",
    });

    const { prompt } = await request.json();
    if (!prompt) throw new HttpError(400, "缺少 prompt");

    const result = await callGemini({
      prompt: SYSTEM_PROMPT + "\n使用者描述：" + prompt,
      json: true,
      temperature: 0.7,
    });
    return NextResponse.json(result);
  } catch (e) {
    return handleApiError(e, "/api/generate");
  }
}
```

### 5.2 `app/api/admin/enrich-tool/route.js`（admin）

- IP 前置閘 `rateLimit(\`enrich:${ip}\`, { limit: 20, windowMs: 60000 })`（admin-only 放寬 20）→ 再 `requireRole(request, ["admin"], { forbiddenMessage: "需要管理員權限" })`。
- **GitHub README 抓取、`TYPE_DATA_HINT`、`systemPrompt`/`userContent`、`result._readmeFound` 全原樣保留**（#24 正則不改）。
- **必做：`_readmeFound` 在 callGemini 回傳後於 route 內補回**（callGemini 不知道 readme；別直接 `return helper結果`）：

```js
const result = await callGemini({
  prompt: systemPrompt + "\n\n" + userContent,
  json: true,
  temperature: 0.6,
});
result._readmeFound = !!readme; // 維持前端 ReviewToolWizard「已讀取 README / 依名稱生成」分支
return NextResponse.json(result);
```

### 5.3 `app/api/ai/assist-block/route.js`（dev/admin）

- 限流維持**原本位置與鍵**：`rateLimit(\`assist-block:${ip}\`, { limit: 10, windowMs: 60000 })` 放在最前、`requireRole` 之前（等於這支的限流行為**不變**）。
- `requireRole(request, ["developer", "admin"], { forbiddenMessage: "需要開發者或管理員權限" })`。
- 參數解析、空請求 400（改 `throw HttpError(400, ...)`）、**SSRF 來源抓取（GitHub 白名單 + `isSafeHttpUrl` + `redirect:manual`）全原樣保留**。
- Gemini：`const text = await callGemini({ prompt: \`${VOICE}\n${ctx}\n\n${task}\`, json: false, temperature: 0.7, maxOutputTokens: 1500 })`。
- 保留 `if (!text) throw new HttpError(502, "AI 沒有產生內容，請重試")`。

### 5.4 `app/api/refine-request/route.js`（匿名）

- **保留匿名**（不加 `requireRole`）。`rateLimit(\`refine:${ip}\`, { limit: 5, windowMs: 60000 })`（不變）。
- `text` 取值/截斷/空檢查（改 `throw HttpError(400, "請先輸入需求內容")`）。
- Gemini：`const parsed = await callGemini({ prompt: SYSTEM_PROMPT + "\n使用者描述：" + text, json: true, temperature: 0.5, timeoutMs: 10000 })`。
  > **review 修正**：匿名端用較短 `timeoutMs: 10000`，縮短單一匿名請求可佔住 serverless 連線的時間（深度防禦）。
- 回傳整形 `{ optimized, suggestions }` 不變。整支包進 `try/catch → handleApiError(e, "/api/refine-request")`。

---

## 6. 行為變更總表（皆為刻意）

| #   | 變更                                                                                     | 影響                                                                                | 對應 finding |
| --- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------ |
| 1   | token 驗證 REST `accounts:lookup` → Admin SDK `verifyIdToken`（不帶 checkRevoked）       | 更強（驗簽章+到期，本地驗簽無網路往返）；不再依賴 `FIREBASE_WEB_API_KEY`            | #1           |
| 2   | role 讀取 Firestore REST（client token）→ `adminDb`（繞 rules）                          | rule 收緊不再無聲壞掉                                                               | #1           |
| 3   | generate 新增 `generate:${ip}` 10/min IP 前置限流                                        | 防腳本洗 Gemini 額度（擋在 auth 前）                                                | #3           |
| 4   | enrich-tool 新增 `enrich:${ip}` 20/min IP 前置限流                                       | 同上（admin 放寬）                                                                  | #3           |
| 5   | 所有 Gemini 呼叫加 timeout（一般 20s、匿名 refine 10s）→ 504                             | 防乾等                                                                              | #4           |
| 6   | Gemini key URL query → `x-goog-api-key` header                                           | 不進 URL log                                                                        | #23          |
| 7   | generate JSON.parse 無 try/catch → callGemini 安全 parse 回 502                          | 壞 JSON 不再噴 500                                                                  | #5           |
| 8   | **refine** 壞 JSON：原 500「AI 輔助失敗」→ 502「AI 回傳格式無法解析」                    | 與 generate 一致化（前端僅顯示字串、不依賴 status，相容）                           | #5（順帶）   |
| 9   | generate/enrich 上游 Gemini 錯誤訊息**不再對外**，改 server log（key 遮罩）+ generic 502 | 降低資訊洩漏、訊息一致                                                              | #4（順帶）   |
| 10  | 移除「無法驗證使用者權限」403 路徑                                                       | Admin SDK 下讀 role 不會因權限失敗；真失敗→非預期 500（正確、有 server log 可定位） | #1           |

> assist-block 限流**不變**（維持 IP 10/min、位置不變），故不列入變更。
>
> 對 client（前端）合約：**成功回應形狀完全不變**（generate/enrich/refine 回原本 JSON、assist 回 `{text}`）。只有錯誤訊息與 status 在邊角情境（壞 JSON、timeout、限流）有差異——前端目前都是「顯示 error 字串」（如 `RequestCard.jsx` 只 `throw new Error(data.error)`），不比對 status/字串 → 相容。

---

## 7. 測試策略（`node --test`，零依賴）

新增 script：

```json
"test:unit": "node --test \"src/lib/**/*.test.mjs\""
```

> **review 修正（BLOCKER→MAJOR，必修）**：原稿 `node --test src/lib`（裸目錄參數）在 **Node v22.22.2 會失敗**——node 把 `src/lib` 當「要執行的模組」而非「要掃描的目錄」→ `Error: Cannot find module ...src\lib`（MODULE_NOT_FOUND）、0 測試、exit 1。且最直覺的「退回裸 `node --test`」會遞迴掃到 root 的 `firestore.rules.test.mjs`（需 emulator+Java）→ CI 紅。**正解是明確 glob**（已實測 2/2 綠且天然排除 root rules 測試）：`node --test "src/lib/**/*.test.mjs"`（整段 glob 用引號包住交給 **node** 自行展開，不依賴 shell；Windows 上 PowerShell/cmd 不會展開 glob）。**plan 第一步先建一支 sanity 測試跑一次確認綠燈，再往下寫；不要把指令可用當已知。**

`firebase-admin` 不會被單元測試載入（apiAuth 動態 import + 測試注入 `opts.admin`）；`next/server` 不在三支被測模組的 import graph。

### 7.1 `src/lib/httpError.test.mjs`

- `HttpError` 帶 `status`/`message`、`instanceof Error`、`name==='HttpError'`。

### 7.2 `src/lib/gemini.test.mjs`（注入 `fetchImpl` + `apiKey`）

用一個 `makeFetch({ ok, status, text, json })` 工廠統一產假 Response，避免各案例拼半套：

```js
const makeFetch =
  ({ ok = true, status = 200, text = "", json = {} }) =>
  async (_url, _init) => ({
    ok,
    status,
    text: async () => text,
    json: async () => json,
  });
```

案例：

- 請求接線：假 fetch 攔截 `init`，斷言 `headers["x-goog-api-key"]===apiKey`、URL 含 model、`body.contents[0].parts[0].text===prompt`、`init.signal instanceof AbortSignal`（確認 signal 真的有接上）。
- `json:true` 解析 ```json 包裹輸出 → 物件（`json` 給含 fence 的 candidates）。
- `json:true` 空 text → `{}`。
- `json:true` 壞 JSON → throw `HttpError` 502。
- `json:false` → 回 trimmed 字串。
- 非 ok（`{ ok:false, status:503, text:async()=>'...' }`）→ throw `HttpError` 502（訊息含 status）。
- `generationConfig`：`json:true` 有 `responseMimeType`；給 `maxOutputTokens` 有帶、沒給不帶（用攔截到的 `init.body` 反序列化斷言）。
- 無 `apiKey` → throw `HttpError` 500。
- **timeout 名稱分支**：注入「同步 throw 一個 `name:'AbortError'`」的 fetchImpl → throw `HttpError` 504（驗 catch 的名稱比對）。
- **timeout 真實接線（review 補）**：注入「永不 resolve、但監聽 `init.signal` 的 `abort` 事件後 reject 一個 `AbortError`」的 fetchImpl + `timeoutMs: 5` → 斷言最終 throw 504。這條真的走 `setTimeout→abort→signal→reject`，能抓到「忘了把 `controller.signal` 放進 init / timer 沒接上」這類迴歸。

### 7.3 `src/lib/apiAuth.test.mjs`（注入假 `admin`）

假 admin 精確形狀（**`exists` 是 boolean property、不是 Web SDK 的 `.exists()` method；`data()` 是 method**）：

```js
const fakeAdmin = ({
  uid = "u1",
  role,
  exists = true,
  verifyThrows = false,
} = {}) => ({
  adminAuth: {
    verifyIdToken: async () => {
      if (verifyThrows) throw new Error("bad token");
      return { uid };
    },
  },
  adminDb: {
    collection: () => ({
      doc: () => ({
        get: async () => ({
          exists,
          data: () => (exists ? { role } : undefined),
        }),
      }),
    }),
  },
});
```

案例：

- 無 Authorization header → 401。
- header 非 `Bearer ` 開頭 → 401。
- `verifyIdToken` reject（`verifyThrows:true`）→ 401。
- role 不在 roles → 403（且訊息=傳入的 `forbiddenMessage`）。
- user doc 不存在（`exists:false`，`data()` 回 `undefined`）→ 403。
- role 命中 → 回 `{uid, role}`。

> route handler 本身不寫單元測試（需 Next runtime）；以 `npm run build`（route 編譯）+ §8 grep 負向驗證 + Jason live 自驗 覆蓋。

---

## 8. 驗證計畫

1. `npm run test:unit` 全綠（3 支單元測試）。
2. `npm run build` 綠（4 route 編譯、Turbopack 解析 explicit-`.mjs`-alias 正確）。
3. `npm run lint` 對 touched 檔無新增錯誤。
4. **負向回歸 grep（review 補）**：確認 4 支 route 改寫後**不再殘留**舊 REST 授權樣板——
   - `grep -rn "accounts:lookup\|identitytoolkit" app/` → 應為 0。
   - `grep -rn "firestore.googleapis.com" app/ src/` → 唯一允許殘留是 `app/tool/[id]/layout.jsx`（讀 tools metadata、不在範圍），**不得有讀 `users/{uid}` 者**。
   - `grep -rn "FIREBASE_WEB_API_KEY" app/ src/` → 應為 0（README 除外）。
5. （無 emulator 需求；不動 rules → 不需 `test:rules`、不需 Console 發布。）
6. Jason live 自驗（需登入，我做不了）：
   - developer 在 dashboard 用 AI 生成文案（generate）→ 正常。
   - admin 審核 wizard 用 enrich（enrich-tool）→ 正常；**抓得到/抓不到 README 兩種 case 的提示文案都要對**（驗 `_readmeFound`）。
   - text block AI 潤飾/生成（assist-block，含 GitHub README、SSRF 擋）→ 正常。
   - 匿名提需求 AI 優化（refine-request）→ 正常。
   - 連點觸發 429、刻意壞 token 觸發 401、viewer 帳號觸發 403。

---

## 9. 風險與緩解

| 風險                                                  | 緩解                                                                                                      |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `node --test` 指令形式錯誤（裸目錄 / 裸無參數）       | **必用 glob** `"src/lib/**/*.test.mjs"`；plan 第一步先 sanity 跑一次；PR 描述提醒勿「順手簡化」           |
| Turbopack 解析 `@/lib/*.mjs`（帶副檔名）失敗          | 明確副檔名直接命中、不依賴 resolveExtensions；`npm run build` 即時驗證；退路改回 `.js`+自寫 runner        |
| `next/server` 在 node 測試環境難 import               | 設計上 `next/server` 只在 `apiError.mjs`，三支單元測試完全不 import next                                  |
| 測試載入 firebase-admin / 依賴 typeless `.js` reparse | apiAuth 動態 import firebaseAdmin + 測試注入 `opts.admin` → 測試從不載 firebase-admin、不依賴 reparse     |
| Admin SDK `verifyIdToken` 成本                        | 不帶 checkRevoked → 本地驗簽 + 快取公鑰、無每請求網路；`getAdmin()` lazy 單例；passkey/request 已用同模式 |
| 行為變更打到既有前端                                  | 成功回應形狀不變；錯誤僅邊角情境差異，前端統一顯示 error 字串 → 相容                                      |

---

## 10. 交付物

- 新檔：`src/lib/{httpError,apiError,apiAuth,gemini}.mjs` + 3 支 `*.test.mjs`（httpError/apiAuth/gemini）。
- 改檔：
  - 4 支 `route.js`（generate / admin/enrich-tool / ai/assist-block / refine-request）。
  - `package.json`（加 `test:unit`）。
  - **`README.md`**（review 補）：把 `FIREBASE_WEB_API_KEY` 註解改標「已不再被 server code 使用，待從 Vercel env 退休」、`FIREBASE_PROJECT_ID` 註解改為「僅 client metadata 用（`app/tool/[id]/layout.jsx`）；AI route 改 Admin SDK 後不再 REST 讀 role」。
- 不動：`firestore.rules`、`storage.rules`、Vercel env 設定、`rateLimit.js`、`firebaseAdmin.js`、`safeUrl.js`、passkey 路由。
- PR：`feature-ai-route-consolidation` → `main`（含本 spec + plan + 實作）。

---

## 11. 對抗式 review 結論摘要

6 lens（behavior-preservation / security / module-build / testability / scope-simplicity / completeness）+ refute-by-default verify，共 23 findings、0 refuted。

- **1 MAJOR（必修，已併入）**：`node --test` 指令形式錯誤 → 改 glob（§7）。
- **1 設計反轉（已與 Jason 確認，已併入）**：限流由「uid 後置」改「IP 前置閘」，解掉「合法 token 角色不符繞過限流打 Firestore」的放大面（§5、§6）。
- **其餘 MINOR/NIT（已併入）**：refine 壞 JSON 行為入表（§6#8）、enrich `_readmeFound` 顯式補回（§5.2）、firebaseAdmin import 理由校準 + Turbopack/`reparse` 事實校準（§3.1/§4.3/§9）、verifyIdToken 不帶 checkRevoked 註記（§4.3/§6#1）、測試假物件精確形狀 + 真實 timeout 測試（§7.2/§7.3）、grep 負向驗證（§8）、README 更新（§10）、key 遮罩 + refine 短 timeout（§4.4/§5.4）、error 模組收斂成 class-only + 內聚 resolveError（§3.2）、users read 解鎖 follow-up（§2）。
- **設計被肯定的部分**：requireRole 收斂授權（直解 #1 rule-coupling 無聲壞掉）、callGemini 集中 + 注入點、`.mjs` 決策（避免全庫 `type:module`）、next 隔離。
