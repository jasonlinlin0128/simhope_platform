# SimHope Hub 優化體檢 — 優先級 Backlog（2026-06-07）

> 來源：多 agent 體檢 workflow（4 面向平行 audit → 每條對抗式驗證 → 綜合）。共 40 條原始發現、0 條被否決；前端面向因 audit agent 中途撞 session 上限只回 1 條，已用 `npm run lint` + 人工盤點補齊。綜合 agent 也撞上限，本報告由主控手動綜合。
>
> 嚴重度：P0=安全/資料外洩/production 故障風險｜P1=可感知的正確性/效能/權限弱點｜P2=可維護性/中等優化｜P3=細節/nice-to-have。
> 工時：S=半天內｜M=1–3 天｜L=要先寫 spec 再拆。
> **盤點性質，先不動手**——拿這份取捨要先動哪些，再進 spec/plan。

---

## 1. 總評

平台整體是健康的：分層清楚、近期 2.5–2.7 的版本歷史/文章排版/token 統一都有打底，安全防護（passkey deny-all、SSRF redirect:manual、提權漏洞修補、serviceAccountKey 確認沒外洩）大方向都對。

最該擔心的三件事：

1. **🔴 審核流程在資料層是「裝飾性」的**——`firestore.rules` 的 tools/painCards `update` 規則對作者完全不驗欄位，**任何 developer 可把自己 pending 的工具直接 `updateDoc({status:'live'})` 繞過 admin 審核上首頁**，也能竄改 `authorUid`。這是唯一的 P0。
2. **授權判定散落且脆弱**——3 支 AI route 用 REST 而非已存在的 Admin SDK，且把「是不是 admin」耦合到「client 讀得到自己的 user doc」這條 rule 上；rule 一收緊就無聲壞掉（正是 AGENTS.md 記載過的「資料×程式碼 runtime 不一致」那類坑）。
3. **client-side 抓資料 + 無錯誤態 + 無分頁**——首頁/hub/faq/dashboard 全在 client `useEffect` 抓 Firestore，失敗只 `console.error` 然後停在空畫面；沒有任何集合分頁，`requests`（唯一無上限成長）每次全量下載。

---

## 2. 🔴 立即處理（P0 / 安全 — 建議第一個 sprint 打包成一個「rules 硬化」PR）

> **狀態（2026-06-07，分支 `fix-firestore-rules-hardening`）**：✅ **S1 已修**、✅ **S2 已修**（emulator rules 測試 15 條全綠；資料盤點確認 17 個工具皆有 authorUid/status）。🔲 **S3 為 follow-up**（讀規則收緊屬另案，本次未做）。

| #   | 議題                                                                                                                                          | 位置                                           | 嚴重度 | 工時 |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ------ | ---- |
| S1  | **作者可自行把 pending 工具改 live 繞過審核**；painCards 同樣可自核准 `approval='approved'`                                                   | [firestore.rules:38-59](firestore.rules)       | P0     | M    |
| S2  | **authorUid 可被竄改**（工具過繼他人 / 自鎖編輯權 / DoS 自己 doc）                                                                            | [firestore.rules:44-46,56-58](firestore.rules) | P1     | S    |
| S3  | **tools `allow read: if true`** → pending（未審）工具內容在資料層對任何知道 doc id 的人可讀，gating 全在 client（驗證時順手揪出，未獨立計列） | [firestore.rules:38-39](firestore.rules)       | P2     | S    |

**修法**：tools/painCards 的 `update` 規則加欄位不變式——非 admin 時 `status`/`approval` 不可變（狀態提升只允許 `isAdmin()`）、`authorUid` 永不可改（僅 admin 可調）、`createdAt` 鎖死；作者仍可改自己 pending 工具的「內容」。最徹底是把「審核上架」收斂成 Admin SDK server endpoint（比照 `requests` 的 `create:false`）。
⚠️ **AGENTS.md 鐵律**：本專案 SA 缺 `firebaserules.releases.create`，rules 改完要靠 Firebase Console 手動貼上發布，且發布後一定連 live 站驗證。

---

## 3. 優先級 Backlog（完整清單，依 嚴重度 × 工時 排序）

### P1（先排）

| #   | 面向    | 議題                                                                                                                                   | 位置                                                                                                                                              | 工時 | 一句建議                                                                                                                                            |
| --- | ------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 後端/DB | 3 支 AI route 用 REST 驗 token + 靠 client-readable rule 判 role（與 Admin SDK 不一致、規則一收緊就破）**※後端與DB各報一條，同一議題** | [generate](app/api/generate/route.js:44)/[assist-block](app/api/ai/assist-block/route.js:29)/[enrich-tool](app/api/admin/enrich-tool/route.js:24) | M    | 抽 `src/lib/apiAuth.js` 的 `requireRole(req,[...])` 用 `adminAuth.verifyIdToken`+`adminDb` 讀 role，三支共用，移除 REST/`FIREBASE_WEB_API_KEY` 依賴 |
| 2   | 後端    | rateLimit.js 是 in-memory，Vercel 多實例下放大 N 倍、cold start 歸零、孤兒 key 緩慢洩漏                                                | [rateLimit.js:5-23](src/lib/rateLimit.js)                                                                                                         | M    | 真要硬限流接 Upstash/KV；最該優先的是 **`/api/refine-request`（唯一匿名直打 Gemini）**；短期至少標 best-effort + 加 Map sweep                       |

### P2（主力優化）

| #   | 面向 | 議題                                                                                                                     | 位置                                                                                                                                                            | 工時 | 一句建議                                                                                           |
| --- | ---- | ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | -------------------------------------------------------------------------------------------------- |
| 3   | 後端 | `/api/generate`、`/api/admin/enrich-tool` 燒 Gemini 卻無 rate limit（refine 匿名反而有，覆蓋不一致）                     | [generate](app/api/generate/route.js)/[enrich-tool](app/api/admin/enrich-tool/route.js)                                                                         | S    | 以 `uid` 為 key 加 rateLimit；隨 requireRole helper 一起包成 `withAuthAndLimit()`                  |
| 4   | 後端 | Gemini 呼叫四處複製、`maxOutputTokens` 只設一處、無 timeout/AbortController                                              | [generate:104](app/api/generate/route.js:104)/[enrich:128](app/api/admin/enrich-tool/route.js:128)/[refine:51](app/api/refine-request/route.js:51)              | M    | 抽 `src/lib/gemini.js callGemini({json,maxOutputTokens,signal})` 集中 model 名/timeout/錯誤格式    |
| 5   | 後端 | `/api/generate` 的 `JSON.parse` 無 try/catch，Gemini 回壞 JSON 整支噴 500（enrich/refine 都有包，唯它漏）                | [generate:122-125](app/api/generate/route.js:122)                                                                                                               | S    | parse 包 try/catch 回 502，對齊 enrich-tool                                                        |
| 6   | 後端 | webauthnChallenges 未消費者永久殘留（無 TTL）；login/options 又免登入無限流，可當免費寫入放大器 **※後端與DB各報一條**    | [passkeyServer.js:33-61](src/lib/passkeyServer.js:33)                                                                                                           | S    | 設 Firestore TTL policy（createdAt 需改 Timestamp）+ login/register options 加限流                 |
| 7   | 後端 | passkey route catch 一律回 `e.message`+500，非預期例外洩漏內部細節、且無 server log                                      | [passkey/\*/route.js](app/api/auth/passkey)                                                                                                                     | S    | 抽 `handleApiError(e)`：HttpError 回訊息、其餘 `console.error`+「伺服器錯誤」                      |
| 8   | 後端 | safeUrl 只比對字串，擋不了公開網域解析到內網（DNS rebinding）                                                            | [safeUrl.js:25-40](src/lib/safeUrl.js:25)                                                                                                                       | M    | 嚴格解需 dns.lookup 驗 IP+pin-IP；現況限 admin+限流，可先註解標為已知接受風險                      |
| 9   | DB   | 無分頁：所有集合 unbounded `getDocs`；`requests` 隨匿名提需求無上限成長、收件匣每次全量下載                              | [db.js](src/lib/db.js)/[RequestInbox.jsx:15](src/components/RequestInbox.jsx:15)                                                                                | M    | **requests 優先**：`orderBy(createdAt desc)+limit(50)`+`where(status==pending)`+歸檔/TTL           |
| 10  | DB   | 每次取工具/痛點卡都重抓 getUserProfile；首頁同一 user doc 讀 2 次、無快取                                                | [db.js:167,214](src/lib/db.js:167)                                                                                                                              | S    | isAdmin 由 AuthContext 傳入 db 函式（已持有 role），3→0 額外讀                                     |
| 11  | DB   | versions[]/blog.blocks 整陣列覆寫無樂觀鎖，並發編輯互相無聲覆蓋                                                          | [tool/[id]:887](app/tool/[id]/page.jsx:887)/[wizard:161](src/components/ReviewToolWizard.jsx:161)                                                               | M    | save 前 transaction 比對 updatedAt；先把 detail 的 `new Date()` 統一成 serverTimestamp             |
| 12  | UX   | 所有 modal 無 Esc/focus-trap/`role=dialog`（鍵盤+讀屏破碎）                                                              | [LoginModal:178](src/components/LoginModal.jsx:178)/[RequestCard:69](src/components/RequestCard.jsx:69)/[PasskeyPrompt:66](src/components/PasskeyPrompt.jsx:66) | M    | 抽共用 `<Modal>`：role/aria-modal/aria-labelledby+Esc+移焦還焦+Tab 循環（wizard 非 overlay，排除） |
| 13  | UX   | dashboard/詳情頁/admin 用原生 `alert()`/`confirm()`，與公開頁 inline 紅綠卡兩套語彙                                      | 全庫 27 處散 9 檔                                                                                                                                               | M    | 抽 toast hook + ConfirmDialog；confirm 是同步 boolean，換非同步要改 handler 流程                   |
| 14  | UX   | dashboard 提交鈕無 `isSubmitting`，慢網路連點 → 每點一筆新 id 重複建檔                                                   | [dashboard:134-176](app/dashboard/page.jsx:134)                                                                                                                 | S    | 加 isSubmitting+disabled+「送出中…」，進 handler 先 `if(isSubmitting)return`                       |
| 15  | UX   | 詳情頁無麵包屑/返回；查無資料/無權限直接 `router.push("/")` 靜默彈走                                                     | [tool/[id]:823-835](app/tool/[id]/page.jsx:823)                                                                                                                 | S    | 改渲染「工具不存在/已下架」狀態頁含「回資源中心」CTA（連 /hub）                                    |
| 16  | UX   | 全站 🤖 浮鈕是假的，800ms 後固定回「建置中」（dark pattern 式失望）                                                      | [ChatbotWidget.jsx:27](src/components/ChatbotWidget.jsx:27)/[layout.js:44](app/layout.js:44)                                                                    | S    | 接 refine-request、或下架浮鈕、或改誠實導流到 /hub；別假裝思考                                     |
| 17  | UX   | PainCard Before/After 紅綠框硬編淺色，深色模式亮塊割裂                                                                   | [PainCard.jsx:76,86](src/components/PainCard.jsx:76)/[admin:358](app/admin/page.jsx:358)                                                                        | S    | 補 `dark:` 變體或抽共用 BEFORE/AFTER 常數（兩處一起補）                                            |
| 18  | UX   | LoginModal/PasskeyPrompt 點背景不關，與 RequestCard 不一致（且 RequestCard 的 stopPropagation 是死碼）                   | 三個 modal                                                                                                                                                      | S    | 共用 Modal backdrop 掛 onClose；PasskeyPrompt 點背景=稍後再說（別寫 localStorage）                 |
| 19  | UX   | admin 後台 `w-64` 側欄無 md: 斷點，手機 main 被壓到 ~50-60px                                                             | [admin:152-153](app/admin/page.jsx:152)                                                                                                                         | S    | 外層 `flex-col md:flex-row`、側欄手機改頂部 tab/drawer                                             |
| 20  | 前端 | 全域 layout 無條件 eager 載 BlobBackground（7 顆 blur(80px) + 每 frame GSAP set + 未節流 mousemove），中低階裝置捲動掉幀 | [layout.js:7,37](app/layout.js:7)/[BlobBackground.jsx:86](src/components/BlobBackground.jsx:86)                                                                 | S    | 先做 `prefers-reduced-motion` 守門 + 只在行銷頁(/、/hub)掛、後台不掛                               |
| 21  | 前端 | `set-state-in-effect` **lint error ×2**（cascading render；ThemeProvider 會主題 flash）                                  | [ThemeProvider.jsx:16](src/components/ThemeProvider.jsx:16)/[tool/[id]:852](app/tool/[id]/page.jsx:852)                                                         | S    | ThemeProvider 改 lazy initializer / inline script 防 FOUC；詳情頁 effect 重構                      |
| 22  | 前端 | 巨型元件：tool/[id] **1109 行**（block editor+tabs+version+AI 全擠一頁）、ReviewToolWizard 768 行                        | [tool/[id]/page.jsx](app/tool/[id]/page.jsx)                                                                                                                    | L    | 拆 BlockEditor/VersionPanel/AI 子元件，先寫拆分 spec                                               |

### P3（細節 / 有空再做）

| #   | 面向 | 議題                                                                                                        | 位置                                                                             | 工時 |
| --- | ---- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ---- |
| 23  | 後端 | Gemini key 放 URL query（易進 log），改 `x-goog-api-key` header                                             | 四支 route                                                                       | S    |
| 24  | 後端 | enrich-tool GitHub 正則未錨定 host（`evil.com/github.com/..` 會 match）                                     | [enrich-tool:66](app/api/admin/enrich-tool/route.js:66)                          | S    |
| 25  | 後端 | Admin SDK init 失敗不快取、`JSON.parse` 無 try/catch（裸 SyntaxError 難排查）                               | [firebaseAdmin.js:16-33](src/lib/firebaseAdmin.js:16)                            | S    |
| 26  | DB   | rules `isAdmin()` 用 `get()` 讀 role（每寫一次多一讀）；可考慮 custom claims                                | [firestore.rules:9-12](firestore.rules:9)                                        | S    |
| 27  | DB   | 缺 `firestore.indexes.json`（IaC 版控）——目前全單欄位查詢、無 composite 需求，預防性補                      | [firebase.json](firebase.json)                                                   | S    |
| 28  | DB   | `getCatalog` 的 category filter 分支是 dead code（無 caller 傳 category）                                   | [db.js:203-208](src/lib/db.js:203)                                               | S    |
| 29  | DB   | 詳情頁可見性殘留已廢 `approval==='approved'`（死碼，恆 false 但誤導）                                       | [tool/[id]:828-830](app/tool/[id]/page.jsx:828)                                  | S    |
| 30  | DB   | painCard `relatedToolId` 孤兒連結無校驗，點擊導向 404 彈首頁                                                | [PainCard.jsx:47](src/components/PainCard.jsx:47)/[page.jsx:92](app/page.jsx:92) | S    |
| 31  | DB   | `db.js:13` `orderBy` 是 dead import；順手清                                                                 | [db.js:13](src/lib/db.js:13)                                                     | S    |
| 32  | UX   | hub 搜尋無命中與分類空共用同句文案、空狀態無就地復原 CTA（✕ 已存在）                                        | [hub:49-59,107](app/hub/page.jsx:49)                                             | S    |
| 33  | UX   | dashboard 類別 radio 卡邊框硬編 `border-gray-200` 無 dark:                                                  | [dashboard:290-292](app/dashboard/page.jsx:290)                                  | S    |
| 34  | UX   | 詳情頁圖片原生 `<img>`+`onError` 直接隱藏（壞圖無聲消失、alt 缺）**=2 個 no-img-element lint**              | [tool/[id]:114,287](app/tool/[id]/page.jsx:114)                                  | S    |
| 35  | UX   | AIPanel 硬編 hex 紫（#FAEDFF/#7E22CE…）破壞 dark mode 與品牌色                                              | [AIPanel.jsx:32-56](src/components/AIPanel.jsx:32)                               | S    |
| 36  | UX   | 各頁 loading/empty 樣式不一；client fetch 失敗無錯誤態（停在空站，無重試）                                  | [page.jsx](app/page.jsx)/[hub](app/hub/page.jsx)/[faq](app/faq/page.jsx)…        | M    |
| 37  | UX   | category×type 雙軸對使用者/表單易混淆（dashboard 已隱藏 type，主要痛在 admin+hub badge）                    | [dashboard:23](app/dashboard/page.jsx:23)/[hub:52](app/hub/page.jsx:52)          | L    |
| 38  | 前端 | dashboard `useEffect` 缺 `fetchMyTools` 依賴（exhaustive-deps warn）                                        | [dashboard:83](app/dashboard/page.jsx:83)                                        | S    |
| 39  | 後端 | serviceAccountKey.json — **已確認 gitignore、從未進 git 歷史（非外洩）**；建議移出 repo 目錄+輪換金鑰更保險 | [.gitignore:46-47](.gitignore)                                                   | S    |

---

## 4. ⚡ Quick Wins（S 工時、影響中以上，可一個 PR 打包）

- **S2 authorUid 鎖死**（P1，一行不變式）＋ S3 收緊 read — 跟 P0 一起進 rules PR
- **#14 dashboard isSubmitting** — 直接防重複建檔
- **#5 generate JSON.parse try/catch** — 防 500
- **#15 詳情頁 notFound 狀態頁** — 別再靜默彈首頁
- **#18 / #12 modal backdrop+Esc** — a11y 與一致性
- **#20 BlobBackground reduced-motion** — 效能止血
- **#17 / #35 / #33 PainCard/AIPanel/radio dark token** — 收 2.7 沒收完的硬編色
- **#16 ChatbotWidget 誠實化** — 拔假承諾
- **#10 profile 重複讀** — isAdmin 傳入
- **#28/#29/#31 死碼清理** — getCatalog 分支、approval OR、orderBy import

---

## 5. 跨面向主題（重複出現的根因）

1. **「create 有約束、update 無約束」的 rules 同源缺陷** — S1 self-publish 與 S2 authorUid 竄改同根，一次修。
2. **授權判定散落 + 耦合 client 規則** — 3 支 AI route 重複 REST 樣板、把 role 判定壓在「users read 對所有登入者開放」上 → 抽 Admin SDK `requireRole()` 一次收斂。
3. **client-side data fetching 反覆出現** — 首頁/hub/faq/dashboard 全 client `useEffect` 抓 Firestore：無 server component、無 error/retry 態、無分頁、profile 重複讀。是 #9/#10/#36 與多條前端發現的共同根。
4. **in-memory 狀態在 serverless 失效** — rateLimit（也讓「加限流」這類修補先天打折）。
5. **UI 一致性 / 設計 token 債** — alert/confirm vs inline、硬編色 vs token、modal a11y、loading 樣式各異。2.6/2.7 已開頭，#13/#17/#33/#35/#36/#12 是收尾。
6. **Gemini 呼叫四處複製** — 抽 `callGemini` helper 同時解 #3 限流、#4 timeout/maxOutputTokens、#5 parse、#23 key header。
7. **巨型元件** — tool/[id] 1109 行是多條發現的共同現場，拆分能順帶降低後續每條改動成本。

---

## 6. 建議下一步（取捨用）

**先做（高槓桿、低風險）**

1. **資安 sprint（1 PR）**：firestore.rules 欄位守門 → 解 S1(P0)+S2(P1)+S3。記得 Console 手動發布 + live 驗證。
2. **AI route 收斂（1 PR）**：抽 `requireRole()` Admin SDK helper + `callGemini()` helper → 一次解 #1(P1)+#3+#4+#5+#23，順手移除 `FIREBASE_WEB_API_KEY` REST 依賴。
3. **Polish + a11y Quick-Win PR**：第 4 節那包 S 工時項。
4. **requests 分頁 + 歸檔/TTL（#9）**：唯一無上限成長的集合，先處理。

**暫緩（YAGNI，需求/規模到了再做）**

- #37 category×type 雙軸重構（L，可感知度低，dashboard 已隱藏 type）
- #2 Upstash 持久限流（先 in-memory + 標 best-effort；只有 refine-request 真的需要時再上）
- #26 role 改 custom claims（要配套 token refresh，現況 get() 成本可接受）
- #11 versions append-only 子集合改造（先 transaction 樂觀鎖即可）
- #27 firestore.indexes.json（目前無 composite 需求）
- #22 巨型元件拆分（要先寫 spec；非急件但建議排進中期）

---

_40 條原始發現的完整逐條（含 problem/evidence/驗證 note）見 workflow 輸出；本檔為綜合後的可執行版。_
