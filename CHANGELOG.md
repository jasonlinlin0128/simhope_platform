# Changelog

## [0.4] — 2026-04-09

### 新增
- 開發者帳號管理：管理員可在 `/admin` 直接建立 email/password 開發者帳號（使用 secondary Firebase App，不影響 admin 登入狀態）
- Rich block editor：工具詳情頁支援文字、步驟、圖片、影片、提示、警告六種 block，by author 或 admin 可編輯

### 修正
- Firestore 安全規則強化：限制 `users` collection 寫入、admin guard 防止越權
- Block ID 穩定性：edit mode 進入時補齊缺少 ID 的舊 block，避免 key 衝突
- 深色模式對比：白色卡片改用 `card-bg` CSS 變數，避免深色模式下出現白底

---

## [0.3] — 2026-04-08

### 新增
- 開發者儀表板：可提交工具、查看自己提交的工具
- Auth roles：`admin` / `developer` / 一般用戶三級權限
- Firestore rules：按 role 控制讀寫權限

### 修正
- Auth roles 判斷邏輯、dashboard 編輯連結
- Vercel 部署設定（`app/` 移至 repo root，`vercel.json` 簡化）

---

## [0.2] — 2026-04-06

### 新增
- 首頁完整改版：Hero、stats 卡片、場景篩選、痛點區、同仁回饋、CTA
- AI 小幫手 ChatbotWidget（浮動，功能建置中）
- 工具卡深色模式支援

### 修正
- 程式碼審查後修正：download url key、files schema、showcase TypeError
- 字型換 Nunito + Noto Sans TC，blob 背景效果調整

---

## [0.1] — 2026-04-06

- 初始版本：Next.js App Router + Firebase + Tailwind 架構建立
- 工具卡元件、首頁基礎版、Navbar、LoginModal
