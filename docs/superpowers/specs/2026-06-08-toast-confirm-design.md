# alert/confirm → toast + ConfirmDialog — 設計（audit #13）

> 日期：2026-06-08 ｜ 分支：`feature-toast-confirm`（從 main `b42052b`，含 #23/#25/#26）
> 來源：`docs/optimization-audit-2026-06-07.md` #13

---

## 1. 背景

dashboard / 詳情頁 / admin 等用原生 `alert()` / `confirm()`（~26 處、~10 檔），與公開頁的 inline 紅綠卡是兩套語彙；且原生 `confirm()` 阻塞、樣式不一致、深色不友善。無既有 toast/confirm 基建。

**盤點**（grep `\b(alert|confirm)\s*\(`）：

- **`alert()` ~21**（fire-and-forget 通知）：`app/admin/page.jsx`(101,117,127,138)、`app/dashboard/page.jsx`(123,128,163,170)、`src/components/AIPanel.jsx`(28)、`app/tool/[id]/page.jsx`(906,911)、`src/components/FaqManager.jsx`(48,62)、`src/components/PasskeyPrompt.jsx`(56)、`src/components/RequestInbox.jsx`(92,102,110)、`src/components/ReviewToolWizard.jsx`(155,162,203,216)、`src/components/UploadButton.jsx`(33)。
- **`confirm()` 5**（同步 boolean gate、**全破壞性**）：`admin`(108 刪帳號 / 132 刪工具)、`FaqManager`(67 刪 FAQ)、`PasskeyManager`(66 刪 passkey)、`ReviewToolWizard`(210 退回票)。

## 2. 目標 / 非目標

**目標**

- 抽 toast 系統 + ConfirmDialog，取代全部原生 `alert`/`confirm`，語彙統一（紅綠對齊 inline 卡）、深色友善、a11y。
- ConfirmDialog 重用 #25 共用 `<Modal>`。

**非目標**

- 不改各 handler 的業務邏輯（只換通知/確認 UI）。
- 不引第三方 toast lib（YAGNI；React context 自建）。
- 不動 API/rules、無 migration。

## 3. 架構

- **`src/components/Toast.jsx`**：`ToastProvider`（持 toast 陣列 state + 自動移除）、`useToast()`、頂部 `ToastViewport`。
- **`src/components/ConfirmDialog.jsx`**：`ConfirmProvider`（持 pending promise + 當前 opts）、`useConfirm()`、`ConfirmDialog`（蓋 `<Modal>`）。
- **`app/layout.js`**：`<ToastProvider><ConfirmProvider>…</ConfirmProvider></ToastProvider>` 包住現有樹（不依賴 auth，掛 AuthProvider 外層；但需在 ThemeProvider 內以套深色）。實際順序：`ThemeProvider > ToastProvider > ConfirmProvider > AuthProvider > (Navbar/main/Footer/...)`。

## 4. Toast API / 行為

```js
const toast = useToast();
toast.error(msg); // 紅
toast.success(msg); // 綠
toast.info(msg); // 中性
// 內部：toast.show({ type, message, duration=3500 }) → id；可手動 dismiss(id)
```

- **viewport**：`fixed top-4 left-1/2 -translate-x-1/2 z-[300]`（在 modal `z-[200]` 之上 → modal 內動作的 toast 也看得到）；`flex flex-col gap-2 items-center`，新訊息往下堆疊。
- **每則 toast**：圓角卡 + 類型色（error `bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-200 border-red-200 dark:border-red-800`；success 綠對應；info `bg-[var(--color-card-bg)] border-[var(--color-card-border)]`）、icon（❌/✅/ℹ️）、訊息、手動 ✕。
- auto-dismiss 預設 3500ms（error 5000ms，較久好讀）；`role="status"`、`aria-live`（error=`assertive`，其餘 `polite`）。
- 堆疊上限（如 4 則）超過移除最舊，避免洗版。

## 5. ConfirmDialog API / 行為

```js
const confirm = useConfirm();
const ok = await confirm({
  message,                 // 必填
  title = "確認",
  confirmText = "確定",
  cancelText = "取消",
  danger = false,          // true → 確定鈕紅色（刪除類）
});
if (!ok) return;
```

- Provider 持 `{ opts, resolve }`；`confirm(opts)` 回 `new Promise`（存 resolve）+ 設 opts 顯示對話框。
- 對話框蓋 `<Modal onClose={cancel} labelledBy="confirm-title">`：標題（h3 `id="confirm-title"`）+ 訊息 + [取消(`MUTED_BTN`)] [確定(`danger` ? 紅實心 : `bg-[var(--color-clay-purple)]` 實心)]。
- 確定 → `resolve(true)` + 清 opts；取消 / 背景 / Esc（Modal onClose）→ `resolve(false)` + 清 opts。**未決 promise 一定 resolve**（不懸置）。
- 單一實例、一次一個 confirm。

## 6. 遷移（~26 處 / ~10 檔）

- **alert → toast**：各檔頂部 `const toast = useToast();`，`alert(x)` → `toast.error(x)`；訊息含「成功 / 完成 / 已送出」→ `toast.success(x)`。
  - 成功類：tool[id]:906「儲存成功！」→ success；dashboard:123/163 成功提示 → success（依文案判）。其餘失敗/驗證 → error。
- **confirm → useConfirm**：各檔 `const confirm = useConfirm();`，`if(!confirm(x))return` → `if(!(await confirm({ message:x, danger:true })))return`。5 處皆破壞性 → `danger:true`。
  - **確認 handler 為 async**（plan 逐處查；多數已 async，少數需加 `async`）。
- AIPanel(28) 驗證 alert、PasskeyPrompt(56)、UploadButton(33) 等子元件：靠 Provider 在上層 → `useToast` 可用。

## 7. 測試 / 驗證

- `npm run build` 綠、`npm run lint` 基準 5 不增。
- grep `\balert\s*\(` / `\bconfirm\s*\(`（app/src，排除註解）→ 歸零。
- 公開頁 smoke（playwright）：Provider 掛上後 `/`、`/hub` 正常渲染、無 console error。
- **ConfirmDialog/Toast 元件本身**：若能在公開頁觸發則 E2E；否則靠 reviewer + Jason。
- 獨立 reviewer：async handler 正確、Promise 必 resolve（無懸置/洩漏）、Provider 巢狀順序、toast 自動移除無 setState-after-unmount。
- **🔲 Jason live 驗（auth-gated）**：admin 刪工具/帳號、wizard 退回、faq 刪、passkey 刪 → ConfirmDialog 行為（確定/取消/Esc）；各失敗/成功 → toast 顏色/自動消失。

## 8. 交付 / 風險

- 分支 `feature-toast-confirm`（從 main）→ PR → 獨立 reviewer → CI/Vercel 綠 → 等 Jason merge。
- 最大風險＝`confirm()` 改 async 後 handler 流程（plan 逐處 old→new + 確認 async）；次要＝Provider 順序 / toast unmount 清理。
- 無 migration/rules → 可乾淨 `git revert`。
- commit 分層：(1) Toast.jsx；(2) ConfirmDialog.jsx；(3) layout 掛載；(4) confirm 遷移（5 處）；(5) alert 遷移（按檔分批）。

## 9. 完成定義（DoD）

- 原生 alert/confirm 全數替換（grep 歸零）；toast + ConfirmDialog 系統就緒、蓋 #25 Modal。
- build 綠、lint 不增、公開頁 smoke 過、reviewer READY。
- PR 描述：系統說明 + 待 Jason auth-gated live 驗清單。
