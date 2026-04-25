# SimHope AI 工具箱

SimHope 內部 AI 工具中心。收錄各部門實際使用的 AI 小工具，讓同仁不用懂技術也能直接用。

> **內部使用** — 僅供 SimHope 員工使用，未經授權禁止外部散佈。

---

## 截圖

### 首頁

<!-- 截圖：docs/screenshots/homepage.png -->
> 請將首頁截圖放到 `docs/screenshots/homepage.png` 後取消此註解並加入下方 Markdown：
> `![首頁](docs/screenshots/homepage.png)`

### 工具詳情頁

<!-- 截圖：docs/screenshots/tool-detail.png -->
> 請將工具詳情頁截圖放到 `docs/screenshots/tool-detail.png`

### 管理後台

<!-- 截圖：docs/screenshots/admin.png -->
> 請將 admin 截圖放到 `docs/screenshots/admin.png`

---

## 功能

| 功能 | 說明 |
|------|------|
| 工具總覽 | 依場景篩選、查看所有 AI 工具卡 |
| 工具詳情頁 | Rich block editor 教學說明（文字、步驟、圖片、影片、提示、警告） |
| AI 文案生成 | 開發者輸入一句話，Gemini 2.5 Flash 自動產生上架文案 |
| 開發者儀表板 | 提交新工具、管理自己的工具 |
| 管理後台 | 工具審核 / 狀態管理、痛點卡片管理、開發者帳號建立 |
| 深色模式 | 全站支援，自動偵測系統偏好 |
| AI 小幫手 | 浮動聊天 Widget（功能建置中） |

---

## 本地開發

### 1. 安裝依賴

```bash
npm install
```

### 2. 設定環境變數

複製下方內容建立 `.env.local`：

```env
# Firebase Identity Toolkit（伺服器端驗證 ID Token 用）
FIREBASE_WEB_API_KEY=your_firebase_web_api_key

# Firestore REST API（伺服器端讀取使用者 role 用）
FIREBASE_PROJECT_ID=your_firebase_project_id

# Gemini AI（AI 文案生成 /api/generate 用）
GEMINI_API_KEY=your_gemini_api_key
```

> Firebase 用戶端設定（apiKey、authDomain 等）已硬寫在 `src/lib/firebase.js`，這是 Firebase 的正常做法（用戶端設定本身是公開的）。

### 3. 啟動開發伺服器

```bash
npm run dev
```

開啟 [http://localhost:3000](http://localhost:3000)

---

## 部署（Vercel）

1. 在 [Vercel Dashboard](https://vercel.com) import 此 repo
2. **Framework Preset** 選 `Next.js`，**Root Directory** 留空（`./`）
3. 在 Vercel 的 **Environment Variables** 填入上述三個 env var
4. Deploy

> `vercel.json` 已設定 `framework: "nextjs"`，不需要額外調整建置指令。

---

## 專案結構

```
.
├── app/                    # Next.js App Router 頁面
│   ├── page.jsx            # 首頁
│   ├── dashboard/          # 開發者儀表板
│   ├── admin/              # 管理後台
│   ├── tool/[id]/          # 工具詳情頁（含 block editor）
│   └── api/generate/       # AI 文案生成 API
├── src/
│   ├── components/         # 共用 UI 元件
│   ├── context/            # Auth、Theme context
│   └── lib/                # Firebase 初始化、DB wrappers、admin auth
├── docs/                   # 規劃文件
│   └── content-gaps-inventory.md  # 內容缺口補完清單
├── landing-page/           # 舊版靜態 HTML（僅供參考，不再維護）
└── firestore.rules         # Firestore 安全規則
```

---

## 工具狀態說明

| 狀態 | 意思 |
|------|------|
| 使用中 `live` | 已上線，同仁可正常使用 |
| 測試中 `beta` | 功能完整但仍在測試 |
| 新上線 `new` | 剛上架 |
| 開發中 `dev` | 尚未完成 |
| 待驗收 `pending` | 開發完成，等待驗收 |
| 已終止 `terminated` | 停止維護 |

---

## 帳號權限

| 角色 | 權限 |
|------|------|
| 一般同仁 | 瀏覽工具、使用 AI 小幫手 |
| `developer` | 上述 + 提交工具、使用 AI 文案生成 |
| `admin` | 全部 + 審核工具、管理帳號 |

開發者帳號由管理員在 `/admin` 後台建立（需 admin 帳號登入）。

---

© 2026 SimHope　內部使用，未經授權禁止外部散佈。
