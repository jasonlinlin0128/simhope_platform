# Phase C（LINE 登入 + MCP/API 認證）— 暫緩，記觸發條件

> **建立日期**：2026-05-29
> **狀態**：⏸️ **deferred（YAGNI）** — 經 brainstorm 評估，現在沒有具體要解的痛，等觸發條件出現再做。
> **背景**：auth 三階段的 Phase C。Phase A（Google 登入 + 加固）、Phase B（passkey）已上線。

---

## 為什麼暫緩

把兩個功能放到具體場景檢驗，現在價值都很薄：

### LINE 登入

- 平台**瀏覽工具本來就免登入**（firestore tools `read: if true`）。
- 需要登入的只有「提交 / 審核」= dev/admin 少數人，他們已有 Google / 密碼 / passkey。
- 一般同仁只是看 → 不用登入。
- **結論**：現在沒有「同仁需要登入才能做的事」→ LINE 登入沒有要解的痛。

### MCP / API 認證

- 平台 tools 資料**現在公開可讀** → 程式來讀目錄不用認證。
- **結論**：沒有私密資源、沒有外部寫入需求 → 不需要 machine auth。

蓋投機性的認證基礎建設 = 沒用 + 多攻擊面（auth 是資安敏感）。等需求來再做，會設計得更準。

---

## 觸發條件（看到這些再回來做）

| 功能               | 等這個出現再做                                                  | 屆時要 brainstorm 的核心問題                                                                                                                    |
| ------------------ | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **LINE 登入**      | 開始做 LINE bot 推播 / 需要「LINE 帳號 ↔ 員工」綁定             | LINE 帳號怎麼對應到員工 + 角色？（LINE ID 非 email）；LINE Login 是 OIDC，可走 Firebase OIDC custom provider 或 custom token 流程（同 passkey） |
| **MCP / API 認證** | 出現第一個「私密 / 需保護」資源要對外提供，或要開放外部**寫入** | API key vs OAuth client credentials；scope 設計；rate limit；key 輪替                                                                           |

## 實作時的技術備註（先記著，免得之後重查）

- **LINE 登入**：LINE 是 OIDC provider。兩條路：
  1. Firebase Auth OIDC custom provider（Console 設 OIDC，前端 `signInWithPopup`）— 較原生
  2. 後端驗 LINE access token → Admin SDK 鑄 custom token（同 passkey Phase B 的模式）— 較彈性
  - 角色比照 Google：LINE 登入 → 無 role viewer，admin 提拔。firestore.rules 的 `roleIsViewerOrAbsent` 已能涵蓋。
- **MCP / API 認證**：machine-to-machine，跟人登入分開。考慮 API key 存 Firestore（hash）+ middleware 驗證，或 Firebase App Check。

## 已有的相關資產

- siyulio-workspace 有 `line-bot` 專案（公司 LINE Bot / 地端 LLM）— LINE 登入若做，跟它整合。
- Admin SDK（`src/lib/firebaseAdmin.js`，Phase B 已建）可重用於 custom token。
