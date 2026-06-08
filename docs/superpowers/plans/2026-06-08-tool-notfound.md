# 詳情頁 not-found 狀態頁 — 實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 詳情頁查無工具/無權限改渲染 not-found 狀態頁（+ /hub CTA）取代靜默 `router.push("/")`，並清死碼 #29 與未使用 `useRouter`。

**Architecture:** 單檔 `app/tool/[id]/page.jsx`：fetchTool 移除 router.push 改早退、`setLoading(false)` 進 `finally`、刪 `approval==='approved'`；清 `useRouter`、加 `next/link`；`if(!tool) return null` 改渲染狀態頁。

**Tech Stack:** Next.js 16 + React 19 client component；`next/link`。

**設計來源：** [spec](../specs/2026-06-08-tool-notfound-design.md)。

**驗證慣例：** `npm run lint` 基準 5 problems 不增；commit Conventional + 結尾 `Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>`。

---

## Task 1: import 調整（清 useRouter、加 Link）

**Files:** Modify `app/tool/[id]/page.jsx`

- [ ] **Step 1: 把 useRouter import 換成 Link import（L5）**

old：

```jsx
import { useRouter } from "next/navigation";
```

new：

```jsx
import Link from "next/link";
```

> `useRouter` 改完無人用（僅 fetchTool 兩處，本案移除）；`next/link` 原本未 import，狀態頁 CTA 需要。

---

## Task 2: fetchTool 重構（移除 router.push + finally + 清死碼）

**Files:** Modify `app/tool/[id]/page.jsx`

- [ ] **Step 1: 刪 `const router = useRouter();`（L821）**

old：

```jsx
const router = useRouter();
```

new：（整行刪除）

- [ ] **Step 2: 整段取代 fetchTool（L834-863）**

old：

```jsx
const fetchTool = useCallback(async () => {
  try {
    const docSnap = await getDoc(doc(db, "tools", id));
    if (!docSnap.exists()) {
      router.push("/");
      return;
    }
    const data = docSnap.data();
    const isPublic =
      ["live", "beta", "new", "dev", "terminated"].includes(data.status) ||
      data.approval === "approved";
    const isOwner = user && data.authorUid === user.uid;
    if (!isPublic && !isOwner && !isAdmin) {
      router.push("/");
      return;
    }
    setTool(data);
    const blocks = (data.blog?.blocks || []).map((b) =>
      b.id ? b : { ...b, id: crypto.randomUUID() },
    );
    setLocalBlocks(blocks);
    setLocalExtras({ url: data.url || "", type: data.type || "webapp" });
    setLocalVersions(Array.isArray(data.versions) ? data.versions : []);
    // 預設 tab：依 type 決定（embedded→deploy；download/doc/mcp/skill→quick；其他→detail）
    setActiveTab(defaultTabForType(data.type || "webapp"));
  } catch (e) {
    console.error(e);
  }
  setLoading(false);
}, [id, router, user, isAdmin]);
```

new：

```jsx
const fetchTool = useCallback(async () => {
  try {
    const docSnap = await getDoc(doc(db, "tools", id));
    if (!docSnap.exists()) return; // tool 留 null → 渲染 not-found 狀態頁
    const data = docSnap.data();
    const isPublic = ["live", "beta", "new", "dev", "terminated"].includes(
      data.status,
    );
    const isOwner = user && data.authorUid === user.uid;
    if (!isPublic && !isOwner && !isAdmin) return; // 無權限 → not-found 狀態頁
    setTool(data);
    const blocks = (data.blog?.blocks || []).map((b) =>
      b.id ? b : { ...b, id: crypto.randomUUID() },
    );
    setLocalBlocks(blocks);
    setLocalExtras({ url: data.url || "", type: data.type || "webapp" });
    setLocalVersions(Array.isArray(data.versions) ? data.versions : []);
    // 預設 tab：依 type 決定（embedded→deploy；download/doc/mcp/skill→quick；其他→detail）
    setActiveTab(defaultTabForType(data.type || "webapp"));
  } catch (e) {
    console.error(e);
  } finally {
    setLoading(false);
  }
}, [id, user, isAdmin]);
```

> 變更：兩處 `router.push("/")` → 純 `return`；`setLoading(false)` 移進 `finally`（早退也關 loading）；刪 `|| data.approval === "approved"`（#29）；deps 去掉 `router`。

---

## Task 3: render not-found 狀態頁

**Files:** Modify `app/tool/[id]/page.jsx`

- [ ] **Step 1: `if (!tool) return null;`（L928）整段取代**

old：

```jsx
if (!tool) return null;
```

new：

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

- [ ] **Step 2: lint**

Run: `npm run lint`
Expected: 維持基準 5 problems（`router`/`useRouter` 不再出現、無 unused-var；`Link` 有被使用）。

- [ ] **Step 3: commit**

```bash
git add app/tool/[id]/page.jsx
git commit -m "feat(tool): 詳情頁 not-found 狀態頁取代靜默彈首頁 (audit #15+#29)

查無工具/無權限改渲染「找不到這個工具」狀態頁 + 回資源中心(/hub) CTA，
取代 router.push('/') 靜默彈走。setLoading 移進 finally（早退也關）；
順手清死碼 approval==='approved'(#29) 與未使用的 useRouter。統一訊息
不分辨不存在/無權限（不洩漏 pending 存在性）。

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

## Task 4: build + E2E 驗證（不 commit）

**Files:** 無（驗證）

- [ ] **Step 1: build**

Run: `npm run build` → 綠。

- [ ] **Step 2: 起 dev server**

背景 `npm run dev`，等 `Ready`（localhost:3000）。port 占用先 `taskkill //PID <pid> //F`（netstat :3000）。

- [ ] **Step 3: playwright E2E（公開、免登入）**

1. navigate `http://localhost:3000/tool/__nonexistent__`。
2. `browser_wait_for` 文字「找不到這個工具」出現（確認非「載入中…」卡住、非空白）。
3. evaluate 確認頁面有「回資源中心」連結且 `href="/hub"`。
4. 點「回資源中心」→ URL 變 `/hub`。
5. 回歸：navigate 一個正常 live 工具（從 `/hub` 或首頁取一個 id，如 `/tool/<liveId>`）→ 正常渲染詳情（非 not-found）。

- [ ] **Step 4: 停 dev server**

`taskkill //PID <pid> //F`（netstat :3000）。

---

## 完成後

- 推 `feature-tool-notfound` → 開 PR（base main；body：行為前後、E2E 結果、清死碼 #29 說明）。
- 獨立 reviewer subagent → CI/Vercel 綠 → 等 Jason merge。

---

## Self-Review（plan vs spec）

- **Spec coverage**：§3.1 fetchTool→T2；§3.2 清 router→T1+T2S1；§3.3 render+Link→T1+T3；§4 統一訊息→T3 單一分支；§5 測試→T3S2 lint+T4 build/E2E。✓
- **Placeholder scan**：完整 old/new 碼、exact 指令；無 TBD。✓
- **一致性**：Link import（T1）↔ Link 使用（T3）；useRouter 刪除（T1+T2S1）↔ router 不再出現（T2S2 deps/body）；fetchTool finally/deps 一致。✓
