# SimHope 發展與開發歷程紀錄 (Legacy Docs)

這份文件是在專案準備重構至 Next.js + Tailwind CSS 之前，所做的歷史傳承紀錄。
目的是確保在轉換重構的過程中，核心的商業邏輯、AI 功能、以及資料庫綱要都不會遺失，未來也可以作為團隊開發的技術歷史參考。

## 📅 開發歷史演進回顧
* **初期階段 (LocalStorage)**：專案最初是以純本地端 (LocalStorage) 進行開發，以最高效率打造出 UI 原型。使用 HTML + JS + CSS 刻畫出了順暢的 Dashboard 與 Tool Detail 佈局。
* **第二階段 (Firebase 雲端化與權限分離)**：導入 Firebase Authentication (Google 登入) 與 Cloud Firestore。將使用者分為三種角色（未登入 / 一般開發者 / admin 管理員）。所有新增、刪除權限皆嚴格掛鉤於 Firebase Rules。
* **第三階段 (AI 賦能：Magic Sparkle 🪄)**：整合 Google Gemini 1.5 Flash API，開發出「AI 自動生生工具文案」功能。使用者只需輸入一句話，AI 會自動產生符合指定 JSON Schema 的文案，並在前端實作了**打字機連續顯示特效 (Typewriter Effect)**，帶來了極佳的使用者體驗。
* **第四階段 (防呆體驗與流程統一)**：我們將管理員的 AI 編輯面板擴張到全站（Dashboard 與 Tool 編輯頁）。並為了解決 GitHub 單檔上限 (100MB) 等問題，將工具上架流程徹底拆分為「Web App 網頁應用」與「檔案下載 (引導至 Google Drive)」，統一了平台上的軟體上架路徑。而且修復了痛點陣列因 Firebase 為空導致畫面消失的問題。
* **現階段 (框架升級)**：為了避免 Vanilla JS 中使用字串 (`innerHTML`) 拼接造成的錯誤（如跳脫字元錯誤、CSS class 丟失等），專案正式決議遷移至 **Next.js + Tailwind CSS**，迎來全元件化的時代！

## 🗃️ Firebase Firestore 資料結構 (Schema 機制)

目前資料庫核心集合 (Collections) 以及文件標準結構：

### 1. `tools` (工具集合)
- `title` (字串)：工具名稱
- `tagline` (字串)：一句話介紹
- `desc` (字串)：詳細長說明
- `dept` (字串)：適用主部門首選代碼 (例如 factory, admin, mgmt 等)
- `scenarios` (字串陣列)：所有適用的情境或部門標籤
- `folder` (字串)：專案歸類用資料夾
- `type` (字串)：`webapp` 或 `download` (或 `showcase`)
- `status` (字串)：`live`, `dev`, `beta`, `pending`, `terminated` 等生命週期
- `url` (字串)：網頁應用的跳轉連結 (如果為 download 則為空字串 `""`)
- `tags` (字串陣列)：自訂小標籤
- `steps` (字串陣列)：最多三個簡短的使用步驟
- `icon` (字串)：單頁的 Emoji
- `color` (字串)：`c1` 到 `c6` 的漸層色票類別
- `blog` (物件)：存放工具的富文本說明 `{"blocks": [{"type": "text", "content": "..."}]}`
- `files` (陣列)：如果為 download，則紀錄最新軟體 `{name: "...", path: "Google Drive URL", size: "Unknown"}`
- `versions` (陣列)：軟體版本歷史紀錄 `[{version: "v1.0", releaseNotes: "...", fileUrl: "Google Drive..."}]`
- `authorUid` / `updatedAt` / `createdAt`

### 2. `painCards` (痛點卡片集合)
- `before` (字串)：遇到問題的慘況 (😤)
- `after` (字串)：AI 解決後的順暢狀況 (✅)
- `scenarios` / `folder` / `authorUid` / `approval` 等屬性

### 3. `userProfiles` (使用者設定)
- `role`：`admin` 或 `developer`

### 4. `chatConfig/settings`
- 用來存放 `geminiKey` 等全域密鑰，從後台 API 呼叫拿取。

## 🪄 AI 魔術生成器 Prompt 核心邏輯
重構時，請務必將此 Prompt 移植至 API Route 或 Server Action：
```javascript
const systemPrompt = `你是一個非常厲害的行銷企劃與產品經理。你要幫內部的開發者撰寫「工具上架文案」。
使用者會用一句話描述他的小工具，請生出吸引人、白話文的文案，並固定輸出為純 JSON 格式。

JSON Schema:
{
  "icon": "單一Emoji",
  "title": "簡短名稱 (約6-12字)",
  "tagline": "吸引人的副標題 (約10-25字)",
  "desc": "功能與價值說明 (約50-80字，對非技術人員要友善白話)",
  "dept": "factory 或 admin 或 mgmt 或 quality 或 defense 或 other",
  "s1": "步驟1 (動詞開頭，最多8字)",
  "s2": "步驟2 (動詞開頭，最多8字)",
  "s3": "步驟3 (動詞開頭，最多8字)",
  "tags": ["關鍵字1", "關鍵字2", "關鍵字3"]
}`;
```

舊版的 `legacy_landing_page` 已全數作為珍貴參考保留不刪除。本文件亦提供後續接手開發者了解系統全貌。
