# 詳情頁 not-found 狀態頁 — 設計（audit #15 + #29）

> 日期：2026-06-08 ｜ 分支：`feature-tool-notfound`（從 main `cd3f43b`）
> 來源：`docs/optimization-audit-2026-06-07.md` #15（P2/Quick Win）+ 順手 #29（死碼）

---

## 1. 背景 / 問題

`app/tool/[id]/page.jsx` 的 `fetchTool`（L834-863）在兩種情況直接 `router.push("/")` 把使用者**靜默彈回首頁**：

- 工具不存在（`!docSnap.exists()`，L837-840）。
- 無檢視權限（`!isPublic && !isOwner && !isAdmin`，L846-849）。

使用者點到失效/孤兒連結（如 painCard `relatedToolId` 失聯、舊書籤、被下架工具）會莫名其妙跳回首頁，沒有任何說明。

附帶：可見性判定 L842-844 含死碼 `data.approval === "approved"`（#29，`approval` 欄位已於 2026-05-29 廢除，恆 `undefined`/false，誤導讀者）。

**現況細節**：早退 `return` 在 `try` 內 → 跳過函式尾的 `setLoading(false)`（L862）→ 實際是「卡在『載入中…』直到 `router.push` 導航離開」。

## 2. 目標 / 非目標

**目標**：查無工具 / 無權限時，渲染清楚的 not-found 狀態頁（說明 + 「回資源中心」CTA → `/hub`），取代靜默彈首頁。順手清死碼 #29。

**非目標**：

- 不改可見性判定**邏輯**（誰能看 pending 不變；只把「結果＝彈走」換成「結果＝狀態頁」）。
- 不動其他 tab / block editor / 版本面板 / AI。
- 不改 rules / 無 migration。

## 3. 架構（單檔 `app/tool/[id]/page.jsx`）

**3.1 `fetchTool` 重構**

- 移除兩處 `router.push("/")`，改為單純 `return`（讓 `tool` 維持 `null`）。
- `setLoading(false)` 從函式尾移進 `finally`（早退也要關 loading，否則卡在載入中）。
- 可見性判定刪死碼：`isPublic = ["live","beta","new","dev","terminated"].includes(data.status)`（移除 `|| data.approval === "approved"`，#29）。
- `useCallback` deps：`[id, router, user, isAdmin]` → `[id, user, isAdmin]`（不再用 router）。

**3.2 清未使用的 router**

- `router` 改完只在被刪的兩處用過 → 一併刪 `import { useRouter } from "next/navigation"`（L5）與 `const router = useRouter()`（L821），免 lint unused-var。
- （已確認 `router.` 全檔僅出現在 L838/L847 兩處。）

**3.3 render not-found 狀態頁**

- 新增 `import Link from "next/link"`（目前未 import）。
- `if (!tool) return null;`（L928）→ 改渲染狀態頁：
  ```jsx
  if (!tool)
    return (
      <div className="flex flex-col items-center justify-center text-center py-24 gap-4">
        <div className="text-6xl">🔍</div>
        <h1 className="text-2xl font-black text-[var(--color-text-dark)]">
          找不到這個工具
        </h1>
        <p className="text-[var(--color-text-mid)] max-w-sm">
          這個工具可能不存在、已下架，或你沒有檢視權限。
        </p>
        <Link
          href="/hub"
          className="mt-2 px-6 py-3 rounded-xl bg-gradient-to-br from-[var(--color-clay-purple)] to-[var(--color-clay-blue)] text-white font-extrabold text-sm shadow-md hover:-translate-y-0.5 transition-all"
        >
          ← 回資源中心
        </Link>
      </div>
    );
  ```

## 4. 關鍵決策：統一訊息（not-exist == no-permission）

兩種情況共用同一句「找不到這個工具」，**不分辨**。理由：

- **資安**：不洩漏「某 pending 工具存在」（對非作者/非 admin 而言「不存在」與「無權限」應無法區分；呼應 S3 精神）。
- **簡單**：單一狀態分支、單一文案。

`loading || authLoading` 仍優先顯示「載入中…」（L922-926 不動）；只有「載入完成且 `tool` 仍為 null」才落到 not-found 頁，語意精確（= 不存在 / 無權限 / fetch 例外）。

## 5. 測試 / 驗證

- `npm run build` 綠。
- `npm run lint`：基準 5 不增（清掉 `useRouter` 後，若它原本不在 5 個 problems 內則維持 5；本檔 #21 的 `set-state-in-effect` error 屬另案、不在本案範圍，維持）。
- **playwright E2E（公開、免登入）**：navigate `/tool/__nonexistent__` → 看到「找不到這個工具」+「回資源中心」連結；點 CTA → URL 變 `/hub`。（正常工具 `/tool/<live id>` 仍正常渲染，回歸驗證。）

## 6. 交付 / 風險

- 分支 `feature-tool-notfound`（從 main）→ PR → 獨立 reviewer → CI/Vercel 綠 → 等 Jason merge。
- 風險低：單檔、行為由「彈走」改「渲染狀態頁」，可見性邏輯不變；無 rules/migration、可乾淨 revert。
- 要顧：(a) `setLoading(false)` 確實移到 `finally`（否則 not-found 卡載入中）；(b) 移除 `useRouter` 後全檔無殘留 `router` 參照；(c) deps 更新避免 stale closure / lint。

## 7. 完成定義（DoD）

- fetchTool 不再 `router.push("/")`；查無/無權限 → 渲染 not-found 狀態頁含 /hub CTA。
- 死碼 #29（`approval === "approved"`）移除；未使用的 `useRouter` 清掉。
- build 綠、lint 不增、E2E（不存在 id → 狀態頁 + CTA→/hub；正常 id 回歸）綠。
- 獨立 reviewer READY。
