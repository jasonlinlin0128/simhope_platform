# dashboard 防重複送出 — 設計（audit #14）

> 日期：2026-06-08 ｜ 分支：`feature-dashboard-issubmitting`（從 main `cd3f43b`）
> 來源：`docs/optimization-audit-2026-06-07.md` #14（P1/Quick Win）

---

## 1. 背景 / 問題

`app/dashboard/page.jsx` 的 `handleFormSubmit`（L136）每次送出都用 `"t_" + Date.now() + "_" + random` 即時產生新 doc id（L139-140），再 `setDoc(doc(db,"tools",id), …)`（L164）。送出按鈕（L318-323）**無 `disabled`**、handler **無重入守門**。慢網路下使用者連點（或按 Enter 多次）→ 每次都產不同 id → **建立多筆重複的 pending 工具**，admin 收件匣被灌重複、需手動清。

## 2. 目標 / 非目標

**目標**：一次送出流程進行中，阻止第二次送出（滑鼠連點 + Enter 重送都擋）；按鈕給「送出中…」視覺回饋。

**非目標**：

- 不改 id 生成邏輯（`isSubmitting` 即 audit 指定修法；idempotent id 屬另案、YAGNI）。
- 不動 AI 生成鈕（`isGenerating` 已自有守門）。
- 不改提交資料結構 / API / rules / 無 migration。

## 3. 架構（單檔，鏡像現有 `isGenerating` pattern）

`app/dashboard/page.jsx`：

1. **state**：在 `const [isGenerating, setIsGenerating] = useState(false);`（L69）後加
   `const [isSubmitting, setIsSubmitting] = useState(false);`
2. **handler 守門**：`handleFormSubmit` 在 `e.preventDefault()`（L137）後立即
   `if (isSubmitting) return;` → `setIsSubmitting(true);`；現有 `try/catch` 補 `finally { setIsSubmitting(false); }`（比照 `handleGenerate` L131-133 的 `finally { setIsGenerating(false); }`）。
3. **按鈕**（L318-323）：加 `disabled={isSubmitting}` + `disabled:opacity-60 disabled:cursor-not-allowed`（對齊全站 disabled 樣式如 PasskeyPrompt `disabled:opacity-60`）；文字改 `{isSubmitting ? "送出中…" : "📤 送出，等審核"}`。

## 4. 行為 / 雙重保險

- `disabled={isSubmitting}`：擋滑鼠在送出進行中的連點。
- `if (isSubmitting) return;`：擋「Enter 鍵在 disabled 之前觸發 submit」或任何繞過按鈕的重送（belt-and-suspenders）。
- `finally`：無論成功/失敗都解鎖（失敗時使用者可修正後重送，不會被永久鎖死）。
- 成功路徑既有 `setFormData(reset)`（L168）；按鈕解鎖後欄位已清空，再點也只是送空白（required 欄位擋住），不影響。

## 5. 測試 / 驗證

- `npm run build` 綠。
- `npm run lint`：基準 5 problems 不增（本檔不引入新 error；dashboard 既有 `exhaustive-deps` warn #38 不在本案範圍，維持原狀）。
- dashboard 為 auth-gated（developer 帳號），playwright 公開頁測不到 → 靠 code review + **Jason live 驗**：慢網路（DevTools throttling）連點送出鈕 → 只建 1 筆 pending；按鈕送出中變灰且顯「送出中…」。

## 6. 交付 / 風險

- 分支 `feature-dashboard-issubmitting`（從 main）→ PR → 獨立 reviewer → CI/Vercel 綠 → 等 Jason merge。
- 風險極低：單檔、加 state + 守門 + 按鈕屬性，鏡像既有 `isGenerating`；無 rules/migration、可乾淨 `git revert`。
- 唯一要顧：`finally` 一定解鎖（避免成功/失敗後按鈕卡死）→ §3 已明列。

## 7. 完成定義（DoD）

- `isSubmitting` state + handler 重入守門 + `finally` 解鎖 + 按鈕 disabled/「送出中…」皆到位。
- build 綠、lint 基準 5 不增。
- 獨立 reviewer READY。
- PR 描述含行為說明 + Jason live 驗步驟（慢網路連點）。
