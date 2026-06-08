# 共用 `<Modal>` a11y 元件 — 設計（audit #12 + #18）

> 日期：2026-06-08 ｜ 分支：`feature-modal-a11y`（從 main `e0b2c28` 開，獨立於未 merge 的 color-sweep PR #23）
> 來源：`docs/optimization-audit-2026-06-07.md` #12（modal a11y）+ #18（點背景關閉 / 死碼 / PasskeyPrompt 背景行為）

---

## 1. 背景

三個 overlay modal 各自手刻、共通 a11y 全缺：

| Modal           | overlay z | onClose prop     | X 鈕       | 關閉方式                           | 備註                                                                |
| --------------- | --------- | ---------------- | ---------- | ---------------------------------- | ------------------------------------------------------------------- |
| `LoginModal`    | `z-[200]` | ✓                | ✓ 右上凸出 | X / 登入成功                       | 有 tab（登入/註冊）、**無單一標題**                                 |
| `RequestCard`   | `z-[120]` | ✓                | ✓ 右上凸出 | X / 送出完成                       | inner `onClick stopPropagation` 是**死碼**（outer 無 onClick，#18） |
| `PasskeyPrompt` | `z-[210]` | ✗（自管 `show`） | ✗          | 稍後再說 / 不再提示 / 設定成功自關 | `alert()` 報錯（屬 #13，本次不動）                                  |

共通缺：`role="dialog"` / `aria-modal` / `aria-labelledby`、Esc 關閉、focus trap（Tab 循環）、開啟移焦 + 關閉還焦、點背景關閉、body scroll lock。共通外觀：`fixed inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm` + 置中卡片（`bg-[var(--color-card-bg)] rounded-3xl`）。

**ReviewToolWizard 排除**——它是 admin 內嵌面板、非 overlay modal。

## 2. 目標 / 非目標

**目標**

- 抽 **`src/components/Modal.jsx`**：集中 overlay + dialog 語意 + 全部 a11y 行為。
- 三個 modal 遷移到 `<Modal>`，鍵盤 / 讀屏可用（#12）；點背景關閉 + 移除死碼 + PasskeyPrompt 背景=稍後再說（#18）。
- **視覺零迴歸**（少數刻意小統一見 §7，請 Jason 過目）。

**非目標**

- 不動 ReviewToolWizard（非 overlay）。
- 不把 `alert()` 改 toast（audit #13，另案）。
- 不引第三方 dialog lib（YAGNI）。
- 不改 modal 的業務邏輯（登入 / 送需求 / passkey 流程一律不動）。

## 3. 架構

新增 **`src/components/Modal.jsx`**（`"use client"`）。它**擁有** overlay `<div>` + dialog 卡片 `<div role="dialog">` + X 鈕 + 所有 a11y 副作用。三個 modal 把「原本卡片內的內容」當 `children` 傳進去，外層 overlay/X/語意/焦點邏輯全交給 Modal。

`useModalA11y` 焦點/Esc/scroll-lock 邏輯**內聯在 Modal.jsx**（單一 consumer，不另抽 hook，YAGNI）。

## 4. 元件 API

```jsx
/**
 * 共用 overlay modal：role=dialog + aria-modal、Esc/點背景/X 關閉、focus trap、移焦還焦、scroll lock。
 * @param {{
 *   onClose: () => void,           // Esc / 點背景 / X 鈕 皆呼叫
 *   children: React.ReactNode,
 *   labelledBy?: string,           // 卡片內標題元素 id → aria-labelledby（與 label 二擇一）
 *   label?: string,                // 無可見標題時的 aria-label（與 labelledBy 二擇一）
 *   className?: string,            // 卡片尺寸/內距/排版（各 modal 自帶，保原樣）
 *   showClose?: boolean,           // 右上角 X，預設 true
 *   closeOnBackdrop?: boolean,     // 點背景關閉，預設 true
 * }} props
 */
export default function Modal({ onClose, children, labelledBy, label, className = "", showClose = true, closeOnBackdrop = true }) { ... }
```

卡片 base（Modal 內 bake，只放共通）：
`relative bg-[var(--color-card-bg)] rounded-3xl w-full`
其餘（`max-w-*` / `p-*` / `shadow-*` / `border` / `flex flex-col gap-*` / `text-center`）由各 modal 的 `className` 帶 → 視覺保原樣。

overlay：`fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4`（§7 統一 z 與 p-4）。

## 5. 行為（集中在 Modal）

1. **語意**：卡片 `role="dialog" aria-modal="true"`，且 `aria-labelledby={labelledBy}`（有則）或 `aria-label={label}`。dev-only：兩者皆無時 `console.warn`（不 throw）。
2. **Esc 關閉**：`useEffect` 掛 `document` `keydown`，`e.key === "Escape"` → `onClose()`；cleanup 移除。
3. **focus trap**：卡片 `ref`。`keydown` 攔 `Tab`：算出卡片內 focusable 清單，焦點在最後一個按 Tab → `preventDefault` 回第一個；在第一個按 Shift+Tab → 跳最後一個。focusable selector：
   `a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])`
   （每次按鍵即時 query，涵蓋條件渲染變動的元素；清單為空則焦點留在卡片本身）。
4. **開啟移焦 + 關閉還焦**：mount 時存 `document.activeElement`（觸發元素）；移焦到卡片第一個 focusable（無則卡片本身，卡片設 `tabIndex={-1}`）；unmount 時 `previousActive?.focus?.()` 還焦。
5. **點背景關閉**：overlay `onClick` → 若 `e.target === e.currentTarget`（點到的是 overlay 本身、非冒泡自卡片）且 `closeOnBackdrop` → `onClose()`。卡片**不需** stopPropagation（用 target===currentTarget 判定，比 stopPropagation 乾淨，順帶解 #18 死碼）。
6. **body scroll lock**：mount 時存 `document.body.style.overflow` 舊值、設 `"hidden"`；unmount 還原。

> 邊角：所有 DOM 存取在 `useEffect`（client-only，SSR 安全；三個 modal 皆 `"use client"`）。同時只會有一個 modal（互斥），scroll-lock 不做 refcount（YAGNI）。

## 6. 三個 modal 遷移（行為/邏輯一律不動，只換外殼）

### 6.1 LoginModal

- `return` 的外層 `<div fixed inset-0 …>` + 卡片 `<div relative …>` + 右上 X 整段 → 換成：
  ```jsx
  <Modal
    onClose={onClose}
    label="登入或開發者註冊"
    className="max-w-sm p-8 flex flex-col gap-5 shadow-2xl border border-[var(--color-card-border)]"
  >
    {/* 原本卡片內的 tab bar / error / 內容，原封不動 */}
  </Modal>
  ```
- 無單一標題 → 用 `label`（aria-label）。移除自寫 X 鈕（Modal 提供）。

### 6.2 RequestCard

- 外殼換 `<Modal onClose={onClose} labelledBy="req-title" className="max-w-2xl p-6 shadow-xl">`；h3「提需求 / 想要的工具」加 `id="req-title"`。
- **死碼 `onClick={(e) => e.stopPropagation()}` 消失**（Modal 用 target===currentTarget 判定背景點擊）。移除自寫 X。

### 6.3 PasskeyPrompt

- 外殼換 `<Modal onClose={() => dismiss(false)} labelledBy="pk-title" showClose={false} className="max-w-sm p-8 flex flex-col gap-4 text-center shadow-2xl border border-[var(--color-card-border)]">`；h2 加 `id="pk-title"`。
- **背景 / Esc = `dismiss(false)`（稍後再說、不寫 localStorage）**（#18）。保留內部「稍後再說 / 不再提示」兩鈕、**不加 X**（`showClose={false}`，維持現狀）。
- `done` 狀態時標題改 h2「設定完成！」也給 `id="pk-title"`（兩分支都有可 label 的標題）。
- 自管 `show` 不變（`if (!show) return null` 仍在外；Modal 只在 show 時 mount）。

## 7. 刻意小統一（請 Jason 過目）

1. **z-index 統一 `z-[200]`**（現 120/200/210）。modal 互斥不疊，統一較乾淨；皆高於 navbar。
2. **overlay 間距用 `p-4`**（取代各自 `mx-4` / `px-4` / `p-4` 混用），手機四邊間距一致；視覺幾乎無感（橫向等同原 mx-4，縱向多 1rem 安全間距）。
3. **PasskeyPrompt `alert()` 不動**（audit #13 alert→toast，另案）。

## 8. 測試 / 驗證

- 本專案 `test:unit`＝node:test（無 jsdom）→ **Modal 不寫單元測試**。
- **playwright E2E（我自驗，免登入可開）**：
  - LoginModal（首頁 navbar「登入👨‍💻 / 註冊🔑」開）、RequestCard（首頁「提需求給我」開）各驗：
    1. 開啟焦點進入卡片
    2. Tab 連按循環不漏到背景頁、Shift+Tab 反向
    3. Esc 關閉
    4. 點背景關閉、點卡片內不關
    5. 關閉後焦點還原到觸發鈕
    6. `role=dialog`/`aria-modal`/`aria-label(ledby)` 存在（讀 DOM 屬性）
- **PasskeyPrompt 需 Jason 手動**（要登入觸發首登提示）：背景/Esc=稍後再說、兩鈕仍在、無 X。
- `npm run build` 綠、`npm run lint` 基準 5 problems 不增。

## 9. 交付 / 風險

- 分支 `feature-modal-a11y`（從 main）→ PR → 獨立 reviewer → CI/Vercel 綠 → 等 Jason merge。
- **與 color-sweep #23 的關係**：#23 改了 LoginModal `231/311`（按鈕 `dark:hover:border-gray-500`），本案改 LoginModal 的是**外殼 overlay/X（178-199 區）**，不同區塊 → 兩 PR 應 auto-merge；萬一 conflict 也僅 LoginModal 一處、易解。RequestCard / PasskeyPrompt #23 未動，無衝突。
- 無 migration、不動 rules → 可乾淨 `git revert`。
- commit 分層：(1) `Modal.jsx` 新增；(2) LoginModal 遷移；(3) RequestCard 遷移（+死碼移除）；(4) PasskeyPrompt 遷移（+背景=稍後再說）。

## 10. 完成定義（DoD）

- `Modal.jsx` 完成 §5 六項行為。
- 三個 modal 遷移、業務邏輯不變、視覺除 §7 外不變。
- LoginModal + RequestCard E2E 六項全過；PasskeyPrompt 留 Jason 手動清單。
- build 綠、lint 不增、可乾淨 revert。
- PR 描述列 §7 三項小統一 + 待 Jason 手驗（PasskeyPrompt + 各 modal 正式站點按）。
