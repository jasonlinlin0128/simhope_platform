# AI 輔助結構化引導 — design（2026-06-07）

> 來源：Jason 測試 v0.7 後回饋 ——「AI 輔助希望要求使用者作出更多引導，避免生成方向錯誤」。
> 選定方向：**結構化提示欄**（非「門檻+範例」或「兩段式反問」）。範圍：兩個 AI 輔助 surface 都做。

## 問題

兩個 AI 生成入口都只給一個模糊的自由欄位，使用者容易給太少 → AI 亂猜、方向歪：

- `AIPanel.jsx`（dashboard，`/api/generate`）：單一「一句話描述你的工具」textarea → 生成整份上架文案。
- `AiAssist.jsx`（詳情頁 block 編輯器，`/api/ai/assist-block`）：單一「要 AI 幫你做什麼？」input → 生成文章段落。

## 設計：前端組裝結構化欄位，route 不動

兩個 route 的契約**不變**（generate 收 `{prompt}` 字串、assist-block 收 `{instruction,...}`）；
改在**前端**把多個引導欄位組裝成更明確的 prompt/instruction 字串送出 → 改動最小、零後端風險。

### AIPanel（dashboard 生成）

單一 textarea → 4 欄：

- **① 這工具做什麼？**（一句話，**必填**）
- **② 給誰用 / 什麼情境？**（選填）
- **③ 解決什麼痛點 / 帶來什麼改變？**（選填，餵 Pattern C Before/After）
- **④ 關鍵功能 / 亮點**（選填）

組裝：

```
這個工具：<①>
給誰用 / 使用情境：<②>
解決的痛點 / 帶來的改變：<③>
關鍵功能 / 亮點：<④>
```

（②③④ 空則該行省略）。送出前若 ① 空 → 擋下提示「請先填①，AI 才有方向」。

### AiAssist（block 編輯器）

單一 instruction → 主題 + 重點（保留既有 sourceUrl）：

- **① 要寫什麼**（主題，textarea，*依指示生成*時**必填**，除非有貼來源連結）
- **② 想強調的要點**（選填，一行一個）
- **③ 來源連結**（選填，既有 `sourceUrl`，GitHub README / 文件）

組裝成 `instruction`：`<主題>\n要點：\n- <點1>\n- <點2>`。
**守門**：按「依指示生成」時若 ①、③ 皆空 → 擋下提示「請先給 AI 方向，避免亂猜」。
潤飾模式：①② 當「額外指示」選填，行為不變。

## 範圍 / 驗證

- 純前端（`AIPanel.jsx` / `AiAssist.jsx`）；route、rules、資料模型皆不動。
- `npm run build` 綠、`npm run lint` 無新增問題（我可驗）。
- ⚠️ runtime（生成方向、守門提示）需登入驗：generate 需 developer/admin；assist 在 block 編輯器。
