# dashboard 防重複送出 — 實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** dashboard 工具提交在送出進行中阻止第二次送出（防重複建檔），按鈕顯示「送出中…」。

**Architecture:** 單檔 `app/dashboard/page.jsx`：加 `isSubmitting` state + handler 重入守門 + `finally` 解鎖 + 按鈕 `disabled`/文字切換。鏡像現有 `isGenerating` pattern。

**Tech Stack:** Next.js 16 + React 19 client component。

**設計來源：** [spec](../specs/2026-06-08-dashboard-issubmitting-design.md)。

**驗證慣例：** `npm run lint` 基準 5 problems 不增；commit Conventional + 結尾 `Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>`。

---

## Task 1: 加 isSubmitting state + handler 守門 + 按鈕回饋

**Files:** Modify `app/dashboard/page.jsx`

- [ ] **Step 1: 加 `isSubmitting` state（在 `isGenerating` 宣告後）**

old：

```jsx
const [isGenerating, setIsGenerating] = useState(false);
```

new：

```jsx
const [isGenerating, setIsGenerating] = useState(false);
const [isSubmitting, setIsSubmitting] = useState(false);
```

- [ ] **Step 2: `handleFormSubmit` 加重入守門 + finally 解鎖**

old：

```jsx
  const handleFormSubmit = async (e) => {
    e.preventDefault();
    try {
      const id =
        "t_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7);
```

new：

```jsx
  const handleFormSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const id =
        "t_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7);
```

並把 handler 結尾的 `catch` 區塊後補 `finally`：

old：

```jsx
    } catch (error) {
      console.error(error);
      toast.error(
        error.code === "permission-denied"
          ? "儲存失敗：你不是開發者帳號，無法提交工具。請聯絡管理員開通。"
          : "儲存失敗，請稍後再試",
      );
    }
  };
```

new：

```jsx
    } catch (error) {
      console.error(error);
      toast.error(
        error.code === "permission-denied"
          ? "儲存失敗：你不是開發者帳號，無法提交工具。請聯絡管理員開通。"
          : "儲存失敗，請稍後再試",
      );
    } finally {
      setIsSubmitting(false);
    }
  };
```

- [ ] **Step 3: 送出按鈕加 disabled + 文字切換**

old：

```jsx
<button
  type="submit"
  className="mt-2 px-6 py-4 rounded-xl bg-gradient-to-br from-[var(--color-clay-purple)] to-[var(--color-clay-blue)] text-white font-extrabold text-base shadow-md hover:-translate-y-0.5 hover:shadow-lg transition-all"
>
  📤 送出，等審核
</button>
```

new：

```jsx
<button
  type="submit"
  disabled={isSubmitting}
  className="mt-2 px-6 py-4 rounded-xl bg-gradient-to-br from-[var(--color-clay-purple)] to-[var(--color-clay-blue)] text-white font-extrabold text-base shadow-md hover:-translate-y-0.5 hover:shadow-lg transition-all disabled:opacity-60 disabled:cursor-not-allowed disabled:translate-y-0"
>
  {isSubmitting ? "送出中…" : "📤 送出，等審核"}
</button>
```

> 加 `disabled:translate-y-0` 抵消 `hover:-translate-y-0.5`，讓 disabled 時不浮動。

- [ ] **Step 4: lint**

Run: `npm run lint`
Expected: 維持基準 5 problems（`isSubmitting` 有被使用、無新 error/warn）。

- [ ] **Step 5: commit**

```bash
git add app/dashboard/page.jsx
git commit -m "feat(dashboard): 防重複送出 — isSubmitting 守門 + 按鈕鎖定 (audit #14)

handleFormSubmit 每點產新 id，慢網路連點會建多筆重複 pending 工具。
加 isSubmitting：重入守門(擋 Enter 重送)+按鈕 disabled(擋連點)+finally
解鎖+「送出中…」回饋。鏡像現有 isGenerating，單檔、無 rules/migration。

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

## Task 2: build 驗證（不 commit）

**Files:** 無（驗證）

- [ ] **Step 1: build**

Run: `npm run build`
Expected: 綠。

- [ ] **Step 2: 靜態複核**

Run: `grep -nE "isSubmitting" app/dashboard/page.jsx`
Expected: 4 處 — state 宣告、`if (isSubmitting) return`、`setIsSubmitting(true)`/`finally setIsSubmitting(false)`、按鈕 `disabled={isSubmitting}` + 三元文字。

---

## 完成後

- 推 `feature-dashboard-issubmitting` → 開 PR（base main；body：行為前後、Jason live 驗步驟「DevTools 限速→連點送出→只建 1 筆」）。
- 獨立 reviewer subagent → CI/Vercel 綠 → 等 Jason merge。

---

## Self-Review（plan vs spec）

- **Spec coverage**：§3.1 state→T1S1；§3.2 守門+finally→T1S2；§3.3 按鈕→T1S3；§5 測試→T1S4 lint + T2 build/grep。✓
- **Placeholder scan**：完整 old/new 碼、exact 指令；無 TBD。✓
- **一致性**：`isSubmitting`/`setIsSubmitting` 全程一致；`finally` 對齊 `handleGenerate` 既有寫法；按鈕三元文字與 spec 一致。✓
