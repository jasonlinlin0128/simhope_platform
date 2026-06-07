# AI Route 收斂 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 4 支 AI route 的授權與 Gemini 呼叫收斂成 4 個共用 `.mjs` helper，順手補齊限流／逾時／安全解析／key 移 header，行為對前端保持相容。

**Architecture:** 新增 `httpError.mjs`（錯誤類別）、`apiError.mjs`（`handleApiError`）、`apiAuth.mjs`（`requireRole`，Admin SDK 驗 token + 讀 role）、`gemini.mjs`（`callGemini`，單一 Gemini 呼叫點）。4 支 route 改寫成「IP 前置限流 → requireRole（refine 除外）→ callGemini → 回傳」，整支包一個 `try/catch → handleApiError`。helper 用 `.mjs` 以便 Node 內建 `node --test` 直接 import，零新依賴。

**Tech Stack:** Next.js 16（App Router、Turbopack）、React 19、firebase-admin v13、Node v22.22.2 內建 `node:test`。

**Spec:** `docs/superpowers/specs/2026-06-07-ai-route-consolidation-design.md`（含對抗式 review 修正）。

**重要慣例：**

- commit 用 Conventional Commits，結尾固定加：`Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>`
- 測試指令**務必用 glob**：`node --test "src/lib/**/*.test.mjs"`（整段 glob 用雙引號交給 **node** 自行展開，**不可**用 `node --test src/lib` 裸目錄，也**不可**用裸 `node --test`——前者在 Node 22 崩潰、後者會掃到需 emulator 的 root `firestore.rules.test.mjs`）。
- 本 PR **不碰 firestore.rules / storage.rules、無 migration、無需 Java/emulator、無需 Console 發布**。

---

## File Structure

| 檔                                         | 職責                                                                         |
| ------------------------------------------ | ---------------------------------------------------------------------------- |
| `src/lib/httpError.mjs`（新）              | `HttpError` 類別（帶 HTTP status）。純，無 import                            |
| `src/lib/httpError.test.mjs`（新）         | `HttpError` 契約測試                                                         |
| `src/lib/apiError.mjs`（新）               | `handleApiError(e,label)` + re-export `HttpError`。唯一 import `next/server` |
| `src/lib/gemini.mjs`（新）                 | `callGemini(opts)` 單一 Gemini 呼叫點                                        |
| `src/lib/gemini.test.mjs`（新）            | `callGemini` 行為測試（注入 fetchImpl/apiKey）                               |
| `src/lib/apiAuth.mjs`（新）                | `requireRole(req,roles,opts)` Admin SDK 授權                                 |
| `src/lib/apiAuth.test.mjs`（新）           | `requireRole` 行為測試（注入假 admin）                                       |
| `package.json`（改）                       | 加 `test:unit` script                                                        |
| `app/api/generate/route.js`（改）          | 改用 helper                                                                  |
| `app/api/refine-request/route.js`（改）    | 改用 helper（匿名、短 timeout）                                              |
| `app/api/admin/enrich-tool/route.js`（改） | 改用 helper（保留 README 抓取 + `_readmeFound`）                             |
| `app/api/ai/assist-block/route.js`（改）   | 改用 helper（保留 SSRF 來源抓取）                                            |
| `README.md`（改）                          | 更正 `FIREBASE_WEB_API_KEY` / `FIREBASE_PROJECT_ID` 已 stale 的註解          |

依賴順序：Task 1（httpError + 測試基建）→ Task 2（apiError，依賴 httpError）→ Task 3（gemini，依賴 httpError）→ Task 4（apiAuth，依賴 httpError）→ Task 5–8（route，依賴 apiError/apiAuth/gemini）→ Task 9（README）→ Task 10（整合驗證）。

---

## Task 1: 測試基建 + HttpError

**Files:**

- Modify: `package.json`（scripts 加 `test:unit`）
- Create: `src/lib/httpError.mjs`
- Test: `src/lib/httpError.test.mjs`

- [ ] **Step 1: 加 `test:unit` script**

把 `package.json` 的 `scripts` 區塊改成（在 `test:rules` 後加一行；注意 JSON 內雙引號要轉義）：

```json
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "test:rules": "firebase emulators:exec --only firestore --project demo-simhope-rules \"node firestore.rules.test.mjs\"",
    "test:unit": "node --test \"src/lib/**/*.test.mjs\""
  },
```

- [ ] **Step 2: 寫失敗測試**

`src/lib/httpError.test.mjs`：

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { HttpError } from "./httpError.mjs";

test("HttpError 帶 status/message、是 Error、name 正確", () => {
  const e = new HttpError(403, "權限不足");
  assert.equal(e.status, 403);
  assert.equal(e.message, "權限不足");
  assert.equal(e.name, "HttpError");
  assert.ok(e instanceof Error);
});
```

- [ ] **Step 3: 跑測試確認失敗（順便驗證 glob 指令本身可用）**

Run: `npm run test:unit`
Expected: FAIL —— `Cannot find module './httpError.mjs'`（或 `ERR_MODULE_NOT_FOUND`）。**重點：node 有正確「找到並嘗試跑」`httpError.test.mjs`（證明 glob 指令本身 OK），只是被測模組還不存在。**

- [ ] **Step 4: 實作 HttpError**

`src/lib/httpError.mjs`：

```js
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}
```

- [ ] **Step 5: 跑測試確認通過**

Run: `npm run test:unit`
Expected: PASS（1 test, 1 pass, 0 fail）。

- [ ] **Step 6: Commit**

```bash
git add package.json src/lib/httpError.mjs src/lib/httpError.test.mjs
git commit -m "$(cat <<'EOF'
test(lib): 加 node:test 基建 + HttpError 類別

新增零依賴單元測試 harness（test:unit 用 glob 避開需 emulator 的
rules 測試），與共用 HttpError 類別作為 4 支 AI route 收斂的基礎。

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>
EOF
)"
```

---

## Task 2: apiError（handleApiError）

**Files:**

- Create: `src/lib/apiError.mjs`

> 此檔 import `next/server`，刻意**不寫單元測試**（避免把 Next runtime 拉進測試 import graph）；由 Task 10 的 `npm run build` 與 route 行為覆蓋。邏輯 trivial（一個 `instanceof` 分支）。

- [ ] **Step 1: 建檔**

`src/lib/apiError.mjs`：

```js
import { NextResponse } from "next/server";
import { HttpError } from "./httpError.mjs";

export { HttpError };

/**
 * 把任何 throw 出來的東西映成「對外回應」。
 * HttpError → 用它的 status/message（預期錯誤）。其它 → 500 通用訊息 + server log。
 * @param {unknown} e
 * @param {string} label  route 名稱（給非預期錯誤的 server log 標註）
 */
export function handleApiError(e, label) {
  if (e instanceof HttpError) {
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
  console.error(`[${label}]`, e);
  return NextResponse.json({ error: "伺服器錯誤" }, { status: 500 });
}
```

- [ ] **Step 2: 確認單元測試不受影響**

Run: `npm run test:unit`
Expected: PASS（仍為 Task 1 的 1 test；`apiError.mjs` 無對應 `*.test.mjs`，不會被掃到）。

- [ ] **Step 3: Commit**

```bash
git add src/lib/apiError.mjs
git commit -m "$(cat <<'EOF'
feat(lib): 加 handleApiError 統一 API 錯誤回應

HttpError → 回它的 status/message；非預期錯誤 → console.error(label)
+ 通用 500。next/server 隔離在此檔，讓其餘 helper 測試不碰 Next runtime。

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>
EOF
)"
```

---

## Task 3: callGemini

**Files:**

- Create: `src/lib/gemini.mjs`
- Test: `src/lib/gemini.test.mjs`

- [ ] **Step 1: 寫失敗測試**

`src/lib/gemini.test.mjs`：

````js
import { test } from "node:test";
import assert from "node:assert/strict";
import { callGemini } from "./gemini.mjs";
import { HttpError } from "./httpError.mjs";

const KEY = "AIzaTESTKEY0000000000000000000000000000"; // 形狀用，僅需 truthy

// 攔截 init 並回傳可控 Response 形狀
function makeFetch({ ok = true, status = 200, text = "", json = {} } = {}) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init });
    return { ok, status, text: async () => text, json: async () => json };
  };
  fn.calls = calls;
  return fn;
}

// 包裝成 Gemini 回應形狀
function geminiJson(payloadText) {
  return { candidates: [{ content: { parts: [{ text: payloadText }] } }] };
}

test("送出 x-goog-api-key header、model 在 URL、prompt 在 body、signal 有接上", async () => {
  const fetchImpl = makeFetch({ json: geminiJson('{"a":1}') });
  await callGemini({ prompt: "hello", json: true, fetchImpl, apiKey: KEY });
  const { url, init } = fetchImpl.calls[0];
  assert.equal(init.headers["x-goog-api-key"], KEY);
  assert.ok(url.includes("gemini-2.5-flash"));
  const body = JSON.parse(init.body);
  assert.equal(body.contents[0].parts[0].text, "hello");
  assert.ok(init.signal instanceof AbortSignal);
});

test("json 模式解析 ```json 包裹輸出", async () => {
  const fetchImpl = makeFetch({ json: geminiJson('```json\n{"x":2}\n```') });
  const out = await callGemini({
    prompt: "p",
    json: true,
    fetchImpl,
    apiKey: KEY,
  });
  assert.deepEqual(out, { x: 2 });
});

test("json 模式：空 text → {}", async () => {
  const fetchImpl = makeFetch({ json: geminiJson("") });
  const out = await callGemini({
    prompt: "p",
    json: true,
    fetchImpl,
    apiKey: KEY,
  });
  assert.deepEqual(out, {});
});

test("json 模式：壞 JSON → HttpError 502", async () => {
  const fetchImpl = makeFetch({ json: geminiJson("not json {{{") });
  await assert.rejects(
    () => callGemini({ prompt: "p", json: true, fetchImpl, apiKey: KEY }),
    (e) => e instanceof HttpError && e.status === 502,
  );
});

test("text 模式回 trimmed 字串", async () => {
  const fetchImpl = makeFetch({ json: geminiJson("  hi there \n") });
  const out = await callGemini({
    prompt: "p",
    json: false,
    fetchImpl,
    apiKey: KEY,
  });
  assert.equal(out, "hi there");
});

test("非 ok 回應 → HttpError 502（訊息含 status）", async () => {
  const fetchImpl = makeFetch({
    ok: false,
    status: 503,
    text: "upstream boom",
  });
  await assert.rejects(
    () => callGemini({ prompt: "p", json: true, fetchImpl, apiKey: KEY }),
    (e) =>
      e instanceof HttpError && e.status === 502 && e.message.includes("503"),
  );
});

test("generationConfig：json 帶 responseMimeType；maxOutputTokens 給了才帶", async () => {
  const f1 = makeFetch({ json: geminiJson("{}") });
  await callGemini({ prompt: "p", json: true, fetchImpl: f1, apiKey: KEY });
  const c1 = JSON.parse(f1.calls[0].init.body).generationConfig;
  assert.equal(c1.responseMimeType, "application/json");
  assert.equal(c1.maxOutputTokens, undefined);

  const f2 = makeFetch({ json: geminiJson("text") });
  await callGemini({
    prompt: "p",
    json: false,
    maxOutputTokens: 500,
    fetchImpl: f2,
    apiKey: KEY,
  });
  const c2 = JSON.parse(f2.calls[0].init.body).generationConfig;
  assert.equal(c2.responseMimeType, undefined);
  assert.equal(c2.maxOutputTokens, 500);
});

test("缺 apiKey → HttpError 500", async () => {
  await assert.rejects(
    () => callGemini({ prompt: "p", fetchImpl: makeFetch(), apiKey: "" }),
    (e) => e instanceof HttpError && e.status === 500,
  );
});

test("fetch 同步丟 AbortError → HttpError 504", async () => {
  const fetchImpl = async () => {
    const err = new Error("aborted");
    err.name = "AbortError";
    throw err;
  };
  await assert.rejects(
    () => callGemini({ prompt: "p", fetchImpl, apiKey: KEY }),
    (e) => e instanceof HttpError && e.status === 504,
  );
});

test("真實 timeout：setTimeout abort signal → HttpError 504", async () => {
  // fetchImpl 永不主動 resolve，只在 signal abort 時 reject AbortError
  const fetchImpl = (url, init) =>
    new Promise((_resolve, reject) => {
      init.signal.addEventListener("abort", () => {
        const err = new Error("aborted");
        err.name = "AbortError";
        reject(err);
      });
    });
  await assert.rejects(
    () => callGemini({ prompt: "p", timeoutMs: 5, fetchImpl, apiKey: KEY }),
    (e) => e instanceof HttpError && e.status === 504,
  );
});
````

- [ ] **Step 2: 跑測試確認失敗**

Run: `npm run test:unit`
Expected: FAIL —— `Cannot find module './gemini.mjs'`（httpError 測試仍 pass）。

- [ ] **Step 3: 實作 callGemini**

`src/lib/gemini.mjs`：

````js
import { HttpError } from "./httpError.mjs";

const GEMINI_MODEL = "gemini-2.5-flash";
const ENDPOINT = (model) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

/**
 * 單一 Gemini 呼叫點。集中 model 名、x-goog-api-key header、timeout、JSON 解析、錯誤格式。
 * @param {object} o
 * @param {string}  o.prompt
 * @param {boolean} [o.json=false]   true → responseMimeType json + 回 parse 過物件；false → 回 trimmed 字串
 * @param {number}  [o.temperature=0.7]
 * @param {number}  [o.maxOutputTokens]
 * @param {number}  [o.timeoutMs=20000]
 * @param {string}  [o.model=GEMINI_MODEL]
 * @param {Function}[o.fetchImpl=fetch]
 * @param {string}  [o.apiKey=process.env.GEMINI_API_KEY]
 * @returns {Promise<object|string>}
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
    throw e;
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const detail = (await res.text().catch(() => ""))
      .replace(/AIza[0-9A-Za-z_-]{35}/g, "AIza***")
      .slice(0, 500);
    console.error(`[callGemini] Gemini ${res.status}: ${detail}`);
    throw new HttpError(502, `AI 服務暫時無法使用 (${res.status})`);
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

- [ ] **Step 4: 跑測試確認通過**

Run: `npm run test:unit`
Expected: PASS（httpError + gemini 全綠）。

- [ ] **Step 5: Commit**

```bash
git add src/lib/gemini.mjs src/lib/gemini.test.mjs
git commit -m "$(cat <<'EOF'
feat(lib): 加 callGemini 單一 Gemini 呼叫點

集中 model 名、x-goog-api-key header、AbortController timeout(504)、
json/text 模式、安全 fence-strip + JSON.parse(502)、上游錯誤 key 遮罩後
進 server log 對外 generic 502。注入 fetchImpl/apiKey 供單元測試。

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>
EOF
)"
```

---

## Task 4: requireRole

**Files:**

- Create: `src/lib/apiAuth.mjs`
- Test: `src/lib/apiAuth.test.mjs`

- [ ] **Step 1: 寫失敗測試**

`src/lib/apiAuth.test.mjs`：

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { requireRole } from "./apiAuth.mjs";
import { HttpError } from "./httpError.mjs";

// 最小 Request：只實作 headers.get
function req(authHeader) {
  return {
    headers: { get: (k) => (k === "authorization" ? authHeader : null) },
  };
}

// 假 Admin SDK：exists 是 boolean property、data() 是 method（Admin SDK 語意，非 Web SDK 的 .exists()）
function fakeAdmin({
  uid = "u1",
  role,
  exists = true,
  verifyThrows = false,
} = {}) {
  return {
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
  };
}

test("無 Authorization header → 401", async () => {
  await assert.rejects(
    () =>
      requireRole(req(null), ["admin"], {
        admin: fakeAdmin({ role: "admin" }),
      }),
    (e) => e instanceof HttpError && e.status === 401,
  );
});

test("header 非 Bearer 開頭 → 401", async () => {
  await assert.rejects(
    () =>
      requireRole(req("Token abc"), ["admin"], {
        admin: fakeAdmin({ role: "admin" }),
      }),
    (e) => e instanceof HttpError && e.status === 401,
  );
});

test("verifyIdToken reject → 401", async () => {
  await assert.rejects(
    () =>
      requireRole(req("Bearer x"), ["admin"], {
        admin: fakeAdmin({ verifyThrows: true }),
      }),
    (e) => e instanceof HttpError && e.status === 401,
  );
});

test("role 不在允許清單 → 403 + 自訂訊息", async () => {
  await assert.rejects(
    () =>
      requireRole(req("Bearer x"), ["admin"], {
        admin: fakeAdmin({ role: "developer" }),
        forbiddenMessage: "需要管理員權限",
      }),
    (e) =>
      e instanceof HttpError &&
      e.status === 403 &&
      e.message === "需要管理員權限",
  );
});

test("user doc 不存在 → 403", async () => {
  await assert.rejects(
    () =>
      requireRole(req("Bearer x"), ["admin"], {
        admin: fakeAdmin({ exists: false }),
      }),
    (e) => e instanceof HttpError && e.status === 403,
  );
});

test("role 命中 → 回 {uid, role}", async () => {
  const out = await requireRole(req("Bearer x"), ["developer", "admin"], {
    admin: fakeAdmin({ uid: "u9", role: "developer" }),
  });
  assert.deepEqual(out, { uid: "u9", role: "developer" });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npm run test:unit`
Expected: FAIL —— `Cannot find module './apiAuth.mjs'`（httpError + gemini 仍 pass）。

- [ ] **Step 3: 實作 requireRole**

`src/lib/apiAuth.mjs`：

```js
import { HttpError } from "./httpError.mjs";

/**
 * 驗 Bearer idToken（Admin SDK）+ 讀 users/{uid}.role，role 不在 roles 內就擋。
 * @param {Request} req
 * @param {string[]} roles            允許的角色，如 ["developer","admin"]
 * @param {object}  [opts]
 * @param {string}  [opts.forbiddenMessage]  403 自訂訊息
 * @param {{adminAuth, adminDb}} [opts.admin]  注入點（測試）；未注入時 prod 動態載入 getAdmin
 * @returns {Promise<{uid:string, role:string|undefined}>}
 * @throws  {HttpError} 401 / 403
 */
export async function requireRole(req, roles, opts = {}) {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) throw new HttpError(401, "未授權");

  // 動態 import：讓 node --test 載 apiAuth 時不連帶載入 firebase-admin（測試一律注入 opts.admin）。
  const { adminAuth, adminDb } =
    opts.admin ?? (await import("./firebaseAdmin.js")).getAdmin();

  let decoded;
  try {
    // 刻意不帶 checkRevoked：本地驗簽即可，開了會每請求多一次網路讀並放大 DoS 面。
    decoded = await adminAuth.verifyIdToken(token);
  } catch {
    throw new HttpError(401, "未授權");
  }
  const uid = decoded.uid;

  const snap = await adminDb.collection("users").doc(uid).get();
  const role = snap.exists ? snap.data().role : undefined; // Admin SDK：exists 是 property
  if (!roles.includes(role)) {
    throw new HttpError(403, opts.forbiddenMessage || "權限不足");
  }
  return { uid, role };
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npm run test:unit`
Expected: PASS（httpError + gemini + apiAuth 全綠）。

- [ ] **Step 5: Commit**

```bash
git add src/lib/apiAuth.mjs src/lib/apiAuth.test.mjs
git commit -m "$(cat <<'EOF'
feat(lib): 加 requireRole（Admin SDK 授權收斂）

verifyIdToken（不帶 checkRevoked）+ adminDb 讀 role，取代 3 支 route
重複的 REST 樣板，解掉「role 判定耦合 client-readable rule、rule 收緊
無聲壞掉」的脆弱面。動態 import firebaseAdmin + 注入 opts.admin 供測試。

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>
EOF
)"
```

---

## Task 5: 改寫 `/api/generate`

**Files:**

- Modify: `app/api/generate/route.js`（整檔替換）

- [ ] **Step 1: 整檔替換**

`app/api/generate/route.js` 全部內容換成：

```js
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/apiAuth.mjs";
import { callGemini } from "@/lib/gemini.mjs";
import { HttpError, handleApiError } from "@/lib/apiError.mjs";
import { rateLimit, clientIp } from "@/lib/rateLimit";

const SYSTEM_PROMPT = `你是一個非常厲害的行銷企劃與產品經理。你要幫內部的開發者撰寫「工具上架文案」。
使用者會用一句話描述他的小工具，請生出吸引人、白話文的文案，並固定輸出為純 JSON 格式。

JSON Schema:
{
  "icon": "單一Emoji",
  "title": "簡短名稱 (約6-12字)",
  "tagline": "吸引人的副標題 (約10-25字)",
  "desc": "功能與價值說明 (約50-80字，對非技術人員要友善白話)",
  "dept": "factory 或 admin 或 mgmt 或 quality 或 defense 或 other",
  "s1": "步驟1 (動詞開頭，最多8字)",
  "s2": "步驟2 (動詞開頭，最多8字)",
  "s3": "步驟3 (動詞開頭，最多8字)",
  "tags": ["關鍵字1", "關鍵字2"]
}`;

/**
 * POST /api/generate
 * 生成工具上架文案。IP 前置限流 → auth(developer/admin, Admin SDK) → Gemini JSON。
 */
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

- [ ] **Step 2: lint 該檔**

Run: `npx eslint app/api/generate/route.js`
Expected: 無 error（無未使用 import、無語法錯）。

- [ ] **Step 3: Commit**

```bash
git add app/api/generate/route.js
git commit -m "$(cat <<'EOF'
refactor(api): generate 改用 requireRole + callGemini

移除 REST(accounts:lookup + Firestore REST) 授權與手刻 Gemini 呼叫；
新增 per-IP 前置限流（原本無）、安全 JSON 解析（原本 JSON.parse 漏 try/catch
會噴 500）。成功回應形狀不變。

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>
EOF
)"
```

---

## Task 6: 改寫 `/api/refine-request`

**Files:**

- Modify: `app/api/refine-request/route.js`（整檔替換）

- [ ] **Step 1: 整檔替換**

`app/api/refine-request/route.js` 全部內容換成：

```js
import { NextResponse } from "next/server";
import { callGemini } from "@/lib/gemini.mjs";
import { HttpError, handleApiError } from "@/lib/apiError.mjs";
import { rateLimit, clientIp } from "@/lib/rateLimit";

const SYSTEM_PROMPT = `你是公司內部「需求收件」助理。使用者會用口語描述他工作上的痛點或想要的工具。
請做兩件事，並固定輸出純 JSON：
1. optimized：把他的描述改寫得更清楚具體（白話、保留原意、別誇大、別亂加他沒說的需求），約 40-120 字。
2. suggestions：列 1-3 個「他可能沒講清楚、補上會更好評估」的點（每點一句話、繁體中文）。若已很完整可給空陣列。

JSON Schema:
{ "optimized": "改寫後的需求描述", "suggestions": ["可補充的點1", "可補充的點2"] }`;

/**
 * POST /api/refine-request
 * 匿名提需求 AI 優化。per-IP 限流 → Gemini JSON（短 timeout）。
 */
export async function POST(request) {
  try {
    const ip = clientIp(request);
    if (!rateLimit(`refine:${ip}`, { limit: 5, windowMs: 60000 }).ok)
      throw new HttpError(429, "操作過於頻繁，請稍後再試");

    const body = await request.json().catch(() => ({}));
    const text = String(body.text || "")
      .slice(0, 1000)
      .trim();
    if (!text) throw new HttpError(400, "請先輸入需求內容");

    const parsed = await callGemini({
      prompt: SYSTEM_PROMPT + "\n使用者描述：" + text,
      json: true,
      temperature: 0.5,
      timeoutMs: 10000,
    });
    return NextResponse.json({
      optimized: String(parsed.optimized || ""),
      suggestions: Array.isArray(parsed.suggestions)
        ? parsed.suggestions.slice(0, 3)
        : [],
    });
  } catch (e) {
    return handleApiError(e, "/api/refine-request");
  }
}
```

- [ ] **Step 2: lint 該檔**

Run: `npx eslint app/api/refine-request/route.js`
Expected: 無 error。

- [ ] **Step 3: Commit**

```bash
git add app/api/refine-request/route.js
git commit -m "$(cat <<'EOF'
refactor(api): refine-request 改用 callGemini

匿名端維持 per-IP 5/min；改用 callGemini（短 timeout 10s 縮短匿名連線
佔用）。壞 JSON 由 500「AI輔助失敗」一致化為 502「AI回傳格式無法解析」
（前端僅顯示字串、不依賴 status，相容）。

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>
EOF
)"
```

---

## Task 7: 改寫 `/api/admin/enrich-tool`

**Files:**

- Modify: `app/api/admin/enrich-tool/route.js`（整檔替換）

> 保留 GitHub README 抓取與 `TYPE_DATA_HINT`/prompt 原樣；`#24` 的 GitHub 正則**不改**。**關鍵：`result._readmeFound = !!readme` 必須在 `callGemini` 回傳後補回**（callGemini 不知道 readme），否則前端 ReviewToolWizard 的「已讀取 README / 依名稱生成」分支恆走 false。

- [ ] **Step 1: 整檔替換**

`app/api/admin/enrich-tool/route.js` 全部內容換成：

```js
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/apiAuth.mjs";
import { callGemini } from "@/lib/gemini.mjs";
import { HttpError, handleApiError } from "@/lib/apiError.mjs";
import { rateLimit, clientIp } from "@/lib/rateLimit";

/**
 * POST /api/admin/enrich-tool
 * Admin-only。讀工具主連結（GitHub 抓 README）→ Gemini 生成建議內容。
 * IP 前置限流 → auth(admin, Admin SDK) → Gemini JSON。
 */
export async function POST(request) {
  try {
    const ip = clientIp(request);
    if (!rateLimit(`enrich:${ip}`, { limit: 20, windowMs: 60000 }).ok)
      throw new HttpError(429, "操作過於頻繁，請稍後再試");

    await requireRole(request, ["admin"], {
      forbiddenMessage: "需要管理員權限",
    });

    const {
      url = "",
      title = "",
      tagline = "",
      type = "webapp",
    } = await request.json();

    // ── 嘗試抓 GitHub README（抓不到也沒關係，靠 title/tagline 生成）──
    let readme = "";
    const gh = url.match(/github\.com\/([^/]+)\/([^/?#]+)/);
    if (gh) {
      const owner = gh[1];
      const repo = gh[2].replace(/\.git$/, "");
      try {
        const r = await fetch(
          `https://api.github.com/repos/${owner}/${repo}/readme`,
          {
            headers: {
              Accept: "application/vnd.github.raw+json",
              "User-Agent": "simhope-platform",
            },
          },
        );
        if (r.ok) readme = (await r.text()).slice(0, 6000); // 截斷避免 prompt 過長
      } catch {
        /* 私有 repo 或不存在 → 略過 */
      }
    }

    const TYPE_DATA_HINT = {
      webapp: "不需要 typeData，回 {}",
      download:
        "typeData: { fileUrl, platform (windows/mac/linux/crossplatform), version, fileName }，沒把握的留空字串",
      doc: "typeData: { fileUrl, fileType (pdf/docx/xlsx/zip), version, fileName }",
      mcp: "typeData: { mcpbUrl, npmPackage, repoUrl, configSnippet }（configSnippet 是給 Cursor/VSCode 貼的 mcp JSON 字串）",
      api: "typeData: { endpoint, docsUrl, sdkPackage }",
      embedded:
        "typeData: { location (部署在哪台電腦/設備), accessNote (怎麼使用), contact (負責窗口) }",
    };

    const systemPrompt = `你是 SimHope 內部 AI 工具平台的審核助理。根據以下工具資訊，產生「上架建議內容」。

固定輸出純 JSON（不要 markdown code fence），schema：
{
  "icon": "單一 emoji",
  "desc": "Pattern C 文案，必須是兩段：第一段以 **Before**： 開頭描述原本痛點，第二段以 **After**： 開頭描述用了工具後的改善。用 \\n 換行分段。白話、給非技術同仁看，可含具體時間/流程數據。約 60-120 字。",
  "scenarios": ["適用場景1", "適用場景2"],
  "tags": ["關鍵字1", "關鍵字2", "關鍵字3"],
  "typeData": { ... }
}

這個工具的類型是「${type}」，對應的 typeData 規則：${TYPE_DATA_HINT[type] || "回 {}"}。
typeData 只放你有把握的欄位，沒把握就不要編造（留空字串或省略）。`;

    const userContent = `工具名稱：${title}
一句話介紹：${tagline}
主連結：${url}
${readme ? `\nGitHub README（節錄）：\n${readme}` : "\n（沒有可讀的 README，請依名稱與介紹合理推測）"}`;

    const result = await callGemini({
      prompt: systemPrompt + "\n\n" + userContent,
      json: true,
      temperature: 0.6,
    });
    result._readmeFound = !!readme; // 讓前端知道有沒有抓到 README
    return NextResponse.json(result);
  } catch (e) {
    return handleApiError(e, "/api/admin/enrich-tool");
  }
}
```

- [ ] **Step 2: lint 該檔**

Run: `npx eslint app/api/admin/enrich-tool/route.js`
Expected: 無 error。

- [ ] **Step 3: Commit**

```bash
git add app/api/admin/enrich-tool/route.js
git commit -m "$(cat <<'EOF'
refactor(api): enrich-tool 改用 requireRole + callGemini

移除 REST 授權與手刻 Gemini 呼叫；新增 per-IP 前置限流（admin 放寬 20）。
保留 GitHub README 抓取與 _readmeFound（callGemini 回傳後補回）。#24
GitHub 正則不在本次範圍、原樣保留。

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>
EOF
)"
```

---

## Task 8: 改寫 `/api/ai/assist-block`

**Files:**

- Modify: `app/api/ai/assist-block/route.js`（整檔替換）

> 保留 SSRF 來源抓取（GitHub 白名單 + `isSafeHttpUrl` + `redirect:manual`）。限流維持**原本位置與鍵**（IP 10/min，放在最前），故這支限流行為**不變**。

- [ ] **Step 1: 整檔替換**

`app/api/ai/assist-block/route.js` 全部內容換成：

```js
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/apiAuth.mjs";
import { callGemini } from "@/lib/gemini.mjs";
import { HttpError, handleApiError } from "@/lib/apiError.mjs";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { isSafeHttpUrl } from "@/lib/safeUrl";

/**
 * POST /api/ai/assist-block
 * text block AI 撰寫助理。polish/generate，部落格口吻。
 * IP 前置限流 → auth(developer/admin, Admin SDK) → Gemini 純文字。
 */
export async function POST(request) {
  try {
    // ── rate limit（IP 前置閘，擋 Gemini 額度濫用）──
    const ip = clientIp(request);
    if (!rateLimit(`assist-block:${ip}`, { limit: 10, windowMs: 60000 }).ok)
      throw new HttpError(429, "操作過於頻繁，請稍後再試");

    await requireRole(request, ["developer", "admin"], {
      forbiddenMessage: "需要開發者或管理員權限",
    });

    // ── 參數 ──
    const body = await request.json().catch(() => ({}));
    const mode = body.mode === "generate" ? "generate" : "polish";
    const currentText = String(body.currentText || "").slice(0, 6000);
    const instruction = String(body.instruction || "").slice(0, 6000);
    const sourceUrl = String(body.sourceUrl || "").trim();
    const rawCtx = body.context || {};
    const context = {
      title: String(rawCtx.title || "").slice(0, 200),
      tagline: String(rawCtx.tagline || "").slice(0, 200),
      type: String(rawCtx.type || "").slice(0, 40),
    };

    // ── 空請求擋掉（省 Gemini 額度）──
    if (mode === "polish" && !currentText)
      throw new HttpError(400, "請先輸入要潤飾的內容");
    if (mode === "generate" && !instruction && !sourceUrl)
      throw new HttpError(400, "請先輸入指示或來源連結");

    // ── 來源抓取（generate + sourceUrl）：GitHub README 走白名單，其餘走 SSRF-guarded fetch ──
    let sourceText = "";
    if (mode === "generate" && sourceUrl) {
      // 錨定 host 為 github.com（擋 evil.com/github.com/... 之類誤判）
      const gh = sourceUrl.match(
        /^https?:\/\/(?:www\.)?github\.com\/([^/]+)\/([^/?#]+)/i,
      );
      if (gh) {
        try {
          const r = await fetch(
            `https://api.github.com/repos/${gh[1]}/${gh[2].replace(/\.git$/, "")}/readme`,
            {
              headers: {
                Accept: "application/vnd.github.raw+json",
                "User-Agent": "simhope-platform",
              },
            },
          );
          if (r.ok) sourceText = (await r.text()).slice(0, 6000);
        } catch {
          /* 抓不到就略過 */
        }
      } else if (isSafeHttpUrl(sourceUrl)) {
        try {
          // redirect: manual → 3xx 變 opaqueredirect（r.ok=false）→ 不跟隨轉址，
          // 擋掉「安全 host 30x 轉到內網」的 redirect-SSRF。
          const r = await fetch(sourceUrl, {
            headers: { "User-Agent": "simhope-platform" },
            redirect: "manual",
          });
          if (r.ok) sourceText = (await r.text()).slice(0, 6000);
        } catch {
          /* 抓不到就略過 */
        }
      }
      // 不安全 URL → 靜默不 fetch
    }

    // ── prompt ──
    const VOICE = `你是 SimHope 內部 AI 工具平台的內容撰寫助理。用親切、像在跟一般同仁解釋的「部落格口吻」寫——娓娓道來的內文，寫給非技術的一般讀者。避免：條列式技術 changelog 腔、整段粗體、堆砌 markdown 標記。適度用 ## 小標分段（2–4 段）讓人好讀；關鍵字才加粗；多用完整句子與生活化比喻。只輸出繁體中文 markdown 內文，前後不要加說明或 code fence。`;
    const ctx = `（工具背景：名稱「${context.title || ""}」、一句話介紹「${context.tagline || ""}」、類型「${context.type || ""}」）`;
    const task =
      mode === "polish"
        ? `請把下面這段內容潤飾成上述口吻，保留原意與事實，只改表達方式：\n\n${currentText}`
        : `請依下面指示撰寫內容${sourceText ? "（若附了來源內容，請據實摘要、不要編造）" : ""}：\n指示：${instruction}${sourceText ? `\n\n來源內容（節錄）：\n${sourceText}` : ""}`;

    // ── Gemini（純文字、限輸出長度）──
    const text = await callGemini({
      prompt: `${VOICE}\n${ctx}\n\n${task}`,
      json: false,
      temperature: 0.7,
      maxOutputTokens: 1500,
    });
    if (!text) throw new HttpError(502, "AI 沒有產生內容，請重試");
    return NextResponse.json({ text });
  } catch (e) {
    return handleApiError(e, "/api/ai/assist-block");
  }
}
```

- [ ] **Step 2: lint 該檔**

Run: `npx eslint app/api/ai/assist-block/route.js`
Expected: 無 error。

- [ ] **Step 3: Commit**

```bash
git add app/api/ai/assist-block/route.js
git commit -m "$(cat <<'EOF'
refactor(api): assist-block 改用 requireRole + callGemini

移除 REST 授權與手刻 Gemini 呼叫；保留 SSRF 來源抓取與 IP 前置限流
（位置/鍵不變，這支限流行為不變）。

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>
EOF
)"
```

---

## Task 9: 更新 README 過時環境變數註解

**Files:**

- Modify: `README.md`（§2 設定環境變數 的 env 範例註解）

- [ ] **Step 1: 改註解**

把 `README.md` 中這段（約 56–60 行）：

```env
# Firebase Identity Toolkit（伺服器端驗證 ID Token 用）
FIREBASE_WEB_API_KEY=your_firebase_web_api_key

# Firestore REST API（伺服器端讀取使用者 role 用）
FIREBASE_PROJECT_ID=your_firebase_project_id
```

改成：

```env
# （legacy）AI route 已改用 Admin SDK 驗 token，server code 不再使用；可日後從 env 退休
FIREBASE_WEB_API_KEY=your_firebase_web_api_key

# （legacy）AI route 改 Admin SDK 後不再 REST 讀 role；目前無 server code 使用
FIREBASE_PROJECT_ID=your_firebase_project_id
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "$(cat <<'EOF'
docs(readme): 標記 FIREBASE_WEB_API_KEY/FIREBASE_PROJECT_ID 為 legacy

AI route 改 Admin SDK 後這兩個 env 不再被 server code 使用，更正
.env.local 範例註解避免誤導（env 設定本身不動、保守保留）。

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>
EOF
)"
```

---

## Task 10: 整合驗證

**Files:** 無（純驗證；如發現問題回到對應 Task 修正後再驗）。

- [ ] **Step 1: 單元測試全綠**

Run: `npm run test:unit`
Expected: PASS —— httpError(1) + gemini(10) + apiAuth(6)，全綠、0 fail。

- [ ] **Step 2: build 綠（Turbopack 解析 explicit-.mjs alias 的權威驗證）**

Run: `npm run build`
Expected: 成功（Compiled successfully）。**若 `@/lib/*.mjs` 解析失敗**：先確認 import 帶了 `.mjs` 副檔名；仍失敗則依 spec §9 退路把 helper 改回 `.js` + 自寫 runner（並回報）。

- [ ] **Step 3: lint 無新增錯誤**

Run: `npm run lint`
Expected: 無新增 error（既有 warning 不在本次範圍）。

- [ ] **Step 4: 負向回歸 grep（確認舊 REST 樣板清乾淨）**

Run:

```bash
grep -rn "accounts:lookup\|identitytoolkit" app/ ; echo "---" ; grep -rn "FIREBASE_WEB_API_KEY" app/ src/ ; echo "---" ; grep -rn "firestore.googleapis.com" app/ src/
```

Expected:

- `accounts:lookup` / `identitytoolkit`：**0 筆**。
- `FIREBASE_WEB_API_KEY`：app/ 與 src/ **0 筆**（README 不在掃描範圍）。
- `firestore.googleapis.com`：唯一允許殘留是 `app/tool/[id]/layout.jsx`（讀 tools metadata），**不得有讀 `users/{uid}` 者**。

- [ ] **Step 5: 完成回報（不 commit）**

回報：unit 測試數、build 結果、grep 結果。接著交給 Jason live 自驗（見 spec §8.6：generate/enrich(README 兩 case)/assist(SSRF)/refine 正常；429/401/403 邊角）。

---

## Self-Review（plan 對 spec 的覆蓋檢查）

- **#1 auth 收斂**：Task 4（requireRole）+ Task 5/7/8（wire）+ Task 10 Step 4（grep 確認 REST 清乾淨）。✓
- **#3 限流覆蓋**：Task 5（generate IP 10）、Task 7（enrich IP 20）、Task 8（assist IP 10 不變）、Task 6（refine IP 5 不變）。✓
- **#4 Gemini 收斂 + timeout**：Task 3（callGemini，含 AbortController + 真實 timeout 測試）+ 4 支 wire。✓
- **#5 安全 parse**：Task 3（json 模式 try/catch → 502）+ generate/refine 改用。✓
- **#23 key header**：Task 3（`x-goog-api-key`）。✓
- **行為保真**：enrich `_readmeFound`（Task 7 明列）、assist SSRF（Task 8 保留）、refine 壞 JSON 500→502（spec §6#8，前端相容）。✓
- **review 修正**：glob 測試指令（Task 1 Step 1/3）、checkRevoked 註記（Task 4）、假物件精確形狀（Task 3/4 測試）、grep 負向（Task 10）、README（Task 9）、key 遮罩 + refine 短 timeout（Task 3/6）。✓
- **Placeholder scan**：各 step 均含完整程式碼/指令，無 TBD/TODO。✓
- **Type consistency**：`HttpError(status,message)`、`requireRole(req,roles,{forbiddenMessage,admin})` 回 `{uid,role}`、`callGemini({prompt,json,temperature,maxOutputTokens,timeoutMs,model,fetchImpl,apiKey})`、`handleApiError(e,label)` —— 跨 Task 一致。✓

```

```
