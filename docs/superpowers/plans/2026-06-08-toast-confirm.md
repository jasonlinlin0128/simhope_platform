# alert/confirm → toast + ConfirmDialog — 實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用 toast 系統 + ConfirmDialog 取代全部原生 `alert()`/`confirm()`（27 處 / 10 檔），語彙統一、深色、a11y。

**Architecture:** 新增 `Toast.jsx`（ToastProvider/useToast/viewport）+ `ConfirmDialog.jsx`（ConfirmProvider/useConfirm，蓋 #25 `<Modal>`）；layout 包 Provider；各 handler `alert→toast.error/success`、`if(!confirm(x))return → if(!(await confirm({message:x,danger:true})))return`。業務邏輯不動。

**Tech Stack:** Next.js 16 + React 19 client component + Tailwind v4。import 別名 `@/* → src/*`。

**設計來源：** [spec](../specs/2026-06-08-toast-confirm-design.md)。

**全域驗證慣例：** `npm run lint` 基準 5 problems 不增；commit Conventional + 結尾 `Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>`。build + smoke 集中 Task 6。

---

## Task 1: 新增 `src/components/Toast.jsx`

**Files:** Create `src/components/Toast.jsx`

- [ ] **Step 1: 建立檔案（一字不差）**

```jsx
"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useRef,
} from "react";

const ToastCtx = createContext(null);

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error("useToast 必須在 <ToastProvider> 內使用");
  return ctx;
}

const TYPE_STYLE = {
  error:
    "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-200 border-red-200 dark:border-red-800",
  success:
    "bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-200 border-green-200 dark:border-green-800",
  info: "bg-[var(--color-card-bg)] text-[var(--color-text-dark)] border-[var(--color-card-border)]",
};
const TYPE_ICON = { error: "❌", success: "✅", info: "ℹ️" };
const DURATION = { error: 5000, success: 3500, info: 3500 };
const MAX = 4;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback((message, type = "info") => {
    const id = ++idRef.current;
    setToasts((prev) => [...prev, { id, message, type }].slice(-MAX));
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, DURATION[type] ?? 3500);
    return id;
  }, []);

  const toast = useMemo(
    () => ({
      show,
      error: (m) => show(m, "error"),
      success: (m) => show(m, "success"),
      info: (m) => show(m, "info"),
    }),
    [show],
  );

  return (
    <ToastCtx.Provider value={toast}>
      {children}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[300] flex flex-col items-center gap-2 w-full max-w-sm px-4 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            aria-live={t.type === "error" ? "assertive" : "polite"}
            className={`pointer-events-auto w-full flex items-start gap-2 rounded-xl border px-4 py-3 shadow-lg text-sm font-bold ${TYPE_STYLE[t.type] || TYPE_STYLE.info}`}
          >
            <span aria-hidden="true">
              {TYPE_ICON[t.type] || TYPE_ICON.info}
            </span>
            <span className="flex-1 whitespace-pre-wrap leading-relaxed">
              {t.message}
            </span>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="關閉通知"
              className="opacity-60 hover:opacity-100 text-lg leading-none"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
```

- [ ] **Step 2: lint** → `npm run lint` 維持 5 problems。

- [ ] **Step 3: commit**

```bash
git add src/components/Toast.jsx
git commit -m "feat(ui): 新增 Toast 系統 (ToastProvider/useToast) (audit #13)

頂部置中 toast viewport，error/success/info 類型（紅綠對齊 inline 卡、
dark-safe），auto-dismiss + 手動關 + aria-live。尚未接線。

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

## Task 2: 新增 `src/components/ConfirmDialog.jsx`

**Files:** Create `src/components/ConfirmDialog.jsx`

- [ ] **Step 1: 建立檔案（一字不差）**

```jsx
"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
} from "react";
import Modal from "@/components/Modal";
import { MUTED_BTN } from "@/lib/uiClasses";

const ConfirmCtx = createContext(null);

export function useConfirm() {
  const ctx = useContext(ConfirmCtx);
  if (!ctx) throw new Error("useConfirm 必須在 <ConfirmProvider> 內使用");
  return ctx;
}

export function ConfirmProvider({ children }) {
  const [opts, setOpts] = useState(null);
  const resolveRef = useRef(null);

  const confirm = useCallback((options) => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setOpts({
        title: "確認",
        confirmText: "確定",
        cancelText: "取消",
        danger: false,
        ...options,
      });
    });
  }, []);

  const finish = useCallback((result) => {
    resolveRef.current?.(result);
    resolveRef.current = null;
    setOpts(null);
  }, []);

  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      {opts && (
        <Modal
          onClose={() => finish(false)}
          labelledBy="confirm-title"
          showClose={false}
          className="max-w-sm p-6 flex flex-col gap-4 shadow-2xl border border-[var(--color-card-border)]"
        >
          <h3
            id="confirm-title"
            className="font-black text-lg text-[var(--color-text-dark)]"
          >
            {opts.title}
          </h3>
          <p className="text-sm font-semibold text-[var(--color-text-mid)] whitespace-pre-wrap leading-relaxed">
            {opts.message}
          </p>
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => finish(false)}
              className={`${MUTED_BTN} px-4 py-2 rounded-xl font-bold text-sm`}
            >
              {opts.cancelText}
            </button>
            <button
              type="button"
              onClick={() => finish(true)}
              className={`px-4 py-2 rounded-xl font-extrabold text-sm text-white ${opts.danger ? "bg-red-500 hover:bg-red-600" : "bg-[var(--color-clay-purple)] hover:opacity-90"}`}
            >
              {opts.confirmText}
            </button>
          </div>
        </Modal>
      )}
    </ConfirmCtx.Provider>
  );
}
```

- [ ] **Step 2: lint** → 維持 5 problems。

- [ ] **Step 3: commit**

```bash
git add src/components/ConfirmDialog.jsx
git commit -m "feat(ui): 新增 ConfirmDialog (ConfirmProvider/useConfirm) (audit #13)

await confirm({message,danger}) → Promise<boolean>；蓋 #25 <Modal>
（focus trap/Esc/還焦免費）；danger 確定鈕紅。promise 必 resolve。尚未接線。

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

## Task 3: layout 掛載 Provider

**Files:** Modify `app/layout.js`

- [ ] **Step 1: 加 import**（在 `import ChatbotWidget ...` 後）

```js
import { ToastProvider } from "@/components/Toast";
import { ConfirmProvider } from "@/components/ConfirmDialog";
```

- [ ] **Step 2: 包住 AuthProvider**

old：

```jsx
        <ThemeProvider>
          <BlobBackground />
          <AuthProvider>
```

new：

```jsx
        <ThemeProvider>
          <BlobBackground />
          <ToastProvider>
            <ConfirmProvider>
              <AuthProvider>
```

old（收尾）：

```jsx
          </AuthProvider>
        </ThemeProvider>
```

new：

```jsx
              </AuthProvider>
            </ConfirmProvider>
          </ToastProvider>
        </ThemeProvider>
```

- [ ] **Step 3: lint** → 維持 5。（prettier 會重排縮排。）

- [ ] **Step 4: commit**

```bash
git add app/layout.js
git commit -m "feat(ui): layout 掛載 ToastProvider + ConfirmProvider (audit #13)

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

## Task 4: 遷移 5 個 `confirm()` → `useConfirm`

> 每檔加 `import { useConfirm } from "@/components/ConfirmDialog";` + 元件內 `const confirm = useConfirm();`。所有 handler 已 async（確認過）。

**Files:** `app/admin/page.jsx`、`src/components/FaqManager.jsx`、`src/components/PasskeyManager.jsx`、`src/components/ReviewToolWizard.jsx`

- [ ] **Step 1: admin/page.jsx**

import 後加；元件內（`const router = useRouter();` 下一行）加 `const confirm = useConfirm();`。

handleRemoveUser（108）old:

```jsx
if (
  !confirm(
    `確定移除 ${u.displayName || u.email || u.id} 的權限？\n該帳號會降回一般同仁（viewer），仍可瀏覽/使用工具。`,
  )
)
  return;
```

new:

```jsx
if (
  !(await confirm({
    message: `確定移除 ${u.displayName || u.email || u.id} 的權限？\n該帳號會降回一般同仁（viewer），仍可瀏覽/使用工具。`,
    danger: true,
  }))
)
  return;
```

handleDeleteTool（132）old: `    if (!confirm("確定刪除此工具？")) return;`
new: `    if (!(await confirm({ message: "確定刪除此工具？", danger: true }))) return;`

- [ ] **Step 2: FaqManager.jsx**（remove，67）

import + `const confirm = useConfirm();`（元件內）。
old: `    if (!confirm("確定刪除這題？")) return;`
new: `    if (!(await confirm({ message: "確定刪除這題？", danger: true }))) return;`

- [ ] **Step 3: PasskeyManager.jsx**（handleDelete，66）

import + `const confirm = useConfirm();`。
old:

```jsx
if (
  !window.confirm(
    "確定移除這個 passkey？移除後該裝置不能再用 Face ID / 指紋登入。",
  )
)
  return;
```

new:

```jsx
if (
  !(await confirm({
    message: "確定移除這個 passkey？移除後該裝置不能再用 Face ID / 指紋登入。",
    danger: true,
  }))
)
  return;
```

- [ ] **Step 4: ReviewToolWizard.jsx**（handleReject，210）

import + `const confirm = useConfirm();`。
old: `    if (!confirm("確定打回票？工具會被刪除，作者要重新提交。")) return;`
new: `    if (!(await confirm({ message: "確定打回票？工具會被刪除，作者要重新提交。", danger: true }))) return;`

- [ ] **Step 5: lint + grep** → `grep -rnE "\bconfirm\s*\(" app src --include=*.jsx`：應只剩 `useConfirm`/`const confirm =` 定義，無裸 `confirm(`/`window.confirm(`。

- [ ] **Step 6: commit**

```bash
git add app/admin/page.jsx src/components/FaqManager.jsx src/components/PasskeyManager.jsx src/components/ReviewToolWizard.jsx
git commit -m "fix(ui): confirm() → useConfirm ConfirmDialog (audit #13)

5 處破壞性 confirm（刪工具/帳號/FAQ/passkey/退回票）改 await confirm(danger)。
handler 皆已 async。

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

## Task 5: 遷移 22 個 `alert()` → `toast`

> 每檔加 `import { useToast } from "@/components/Toast";` + 元件內 `const toast = useToast();`（admin/dashboard 等已在 T4 加過 import 的，補 toast import + `const toast`）。`alert(x)`→`toast.error(x)`；success 類→`toast.success`。

- [ ] **Step 1: admin/page.jsx**（4 處，皆 error）

`const toast = useToast();`（接 `const confirm` 後）。

- 101 & 127（同字串，replace_all）：`alert("更新失敗，請重新整理後再試");` → `toast.error("更新失敗，請重新整理後再試");`
- 117：`alert("移除失敗：" + (e.code || e.message));` → `toast.error("移除失敗：" + (e.code || e.message));`
- 138：`alert("刪除失敗，請重新整理後再試");` → `toast.error("刪除失敗，請重新整理後再試");`

- [ ] **Step 2: dashboard/page.jsx**（4 處）

`const toast = useToast();`（`const router = useRouter();` 後）。

- 123 old:

```jsx
alert("✨ 文案生成完成！其他欄位請手動填，送出後經企室審核時會補完細節。");
```

new: `      toast.success("✨ 文案生成完成！其他欄位請手動填，送出後經企室審核時會補完細節。");`

- 128：`alert("AI 生成失敗，請稍後再試");` → `toast.error("AI 生成失敗，請稍後再試");`
- 163 old:

```jsx
alert(
  "已送出！經企室審核後會跟你討論細節（截圖、使用步驟、適用部門、進階安裝方式等），通過後上架。",
);
```

new: `      toast.success("已送出！經企室審核後會跟你討論細節（截圖、使用步驟、適用部門、進階安裝方式等），通過後上架。");`

- 170 old:

```jsx
alert(
  error.code === "permission-denied"
    ? "儲存失敗：你不是開發者帳號，無法提交工具。請聯絡管理員開通。"
    : "儲存失敗，請稍後再試",
);
```

new:

```jsx
toast.error(
  error.code === "permission-denied"
    ? "儲存失敗：你不是開發者帳號，無法提交工具。請聯絡管理員開通。"
    : "儲存失敗，請稍後再試",
);
```

- [ ] **Step 3: src/components/AIPanel.jsx**（28，error）

`const toast = useToast();`（元件內，state 宣告後）。
old: `      alert("請先填①「這工具做什麼」，AI 才有方向");`
new: `      toast.error("請先填①「這工具做什麼」，AI 才有方向");`

- [ ] **Step 4: app/tool/[id]/page.jsx**（906 success、911 error）

`const toast = useToast();`（元件內 hook 區）。

- 906：`alert("儲存成功！");` → `toast.success("儲存成功！");`
- 911 old:

```jsx
      alert(
        error.code === "permission-denied"
          ? "儲存失敗：你沒有編輯此工具的權限"
```

（注意這是多行 ternary，old_string 需含到 `);`）— 完整 old:

```jsx
alert(
  error.code === "permission-denied"
    ? "儲存失敗：你沒有編輯此工具的權限"
    : "儲存失敗，請稍後再試",
);
```

new:

```jsx
toast.error(
  error.code === "permission-denied"
    ? "儲存失敗：你沒有編輯此工具的權限"
    : "儲存失敗，請稍後再試",
);
```

> 實作前先 `Read` 911-915 確認 ternary 第二分支文案完全一致再改。

- [ ] **Step 5: src/components/FaqManager.jsx**（48、62）

`const toast = useToast();`。

- 48 old: `    if (!editing.question?.trim()) return alert("請填問題");`
  new: `    if (!editing.question?.trim()) return toast.error("請填問題");`
  （`return toast.error(...)` 合法：toast.error 回傳 undefined，等同 `return;` 提早退出。行為一致。）
- 62：`alert("儲存失敗：" + (e.code || e.message));` → `toast.error("儲存失敗：" + (e.code || e.message));`

- [ ] **Step 6: src/components/PasskeyPrompt.jsx**（56）

`const toast = useToast();`。old:

```jsx
alert(
  "設定失敗：" +
    (e?.name === "NotAllowedError" ? "已取消或逾時" : e?.message || "未知錯誤"),
);
```

new:

```jsx
toast.error(
  "設定失敗：" +
    (e?.name === "NotAllowedError" ? "已取消或逾時" : e?.message || "未知錯誤"),
);
```

- [ ] **Step 7: src/components/RequestInbox.jsx**（92、102、110）

`const toast = useToast();`。

- 92：`alert("核准失敗：" + (e.code || e.message));` → `toast.error(...)`
- 102 & 110（同字串 `alert("操作失敗：" + (e.code || e.message));`，replace_all）→ `toast.error("操作失敗：" + (e.code || e.message));`

- [ ] **Step 8: src/components/ReviewToolWizard.jsx**（155 success、162/203/216 error）

`const toast = useToast();`。

- 155 old:

```jsx
alert(
  r._readmeFound
    ? "✨ AI 已讀取 GitHub README 並填入建議內容，請確認後再調整。"
    : "✨ AI 已依現有資訊填入建議內容，請確認後再調整。",
);
```

（實作前 Read 155-159 確認第二分支文案）new: 同結構改 `toast.success(`。

- 162：`alert("AI 預填失敗：" + err.message);` → `toast.error("AI 預填失敗：" + err.message);`
- 203：`alert("儲存失敗：" + err.message);` → `toast.error("儲存失敗：" + err.message);`
- 216：`alert("刪除失敗：" + err.message);` → `toast.error("刪除失敗：" + err.message);`

- [ ] **Step 9: src/components/UploadButton.jsx**（33）

`const toast = useToast();`。old: `      alert("上傳失敗：" + err.message);` → `toast.error("上傳失敗：" + err.message);`

- [ ] **Step 10: lint + grep**

`npm run lint` → 維持 5。
`grep -rnE "\balert\s*\(" app src --include=*.jsx --include=*.js` → **0**。

- [ ] **Step 11: commit**

```bash
git add app/admin/page.jsx app/dashboard/page.jsx "app/tool/[id]/page.jsx" src/components/AIPanel.jsx src/components/FaqManager.jsx src/components/PasskeyPrompt.jsx src/components/RequestInbox.jsx src/components/ReviewToolWizard.jsx src/components/UploadButton.jsx
git commit -m "fix(ui): alert() → toast (audit #13)

22 處原生 alert 改 toast.error/success（9 檔）。語彙統一、深色、aria-live。

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

## Task 6: build + grep + smoke 驗證

**Files:** 無（驗證）

- [ ] **Step 1: build + lint + grep**

`npm run build` 綠；`npm run lint` 5；`grep -rnE "\b(alert|confirm|window\.confirm)\s*\(" app src --include=*.jsx --include=*.js` → 僅剩 `useConfirm`/`const confirm =`/`confirm(options)` 定義（無裸呼叫）。

- [ ] **Step 2: 公開頁 smoke（playwright）**

起 dev、navigate `/`、`/hub`、一個 live `/tool/[id]`：頁面正常渲染、**console 無 error**（確認 Provider 巢狀不破壞公開頁、toast viewport 不擋內容）。停 dev。

> Toast/ConfirmDialog 實際觸發多在 auth-gated（admin/dashboard/wizard/faq/passkey）→ **留 Jason live 驗**。若能在公開頁找到觸發點（如 RequestCard 送出失敗）則附帶截一張 toast。

---

## 完成後

- 推 `feature-toast-confirm` → PR（base main；body：系統說明 + 待 Jason auth-gated live 驗清單）。
- 獨立 reviewer subagent（async handler / promise 必 resolve / Provider 順序 / toast unmount 清理）→ CI/Vercel 綠 → 等 Jason merge。

---

## Self-Review（plan vs spec）

- **Spec coverage**：§3 架構→T1/T2/T3；§4 Toast API→T1；§5 Confirm API→T2；§6 遷移→T4(confirm 5)+T5(alert 22)；§7 測試→T6。✓
- **Placeholder scan**：兩元件全碼、layout diff、27 處 exact old→new（多行 ternary 標「先 Read 確認」）；無 TBD。✓
- **一致性**：`useToast`/`toast.error/success/info`、`useConfirm`/`await confirm({message,danger})`、import 路徑 `@/components/Toast`、`@/components/ConfirmDialog` 全程一致；ConfirmDialog 用 `MUTED_BTN`(uiClasses)+`<Modal>`(#25) 一致。✓
- **async 確認**：5 confirm handler 皆已 async（grep -C 確認），await 改造安全。✓
