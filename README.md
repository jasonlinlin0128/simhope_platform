# SimHope AI 工具中心

公司內部 AI 工具平台 Landing Page，採用純靜態 HTML/CSS/JS 建置，資料存於 localStorage。

## 結構

```
landing-page/
├── index.html   公開首頁（工具展示）
├── admin.html   後台管理（工具 CRUD / 網站設定）
└── data.js      共用資料層（localStorage）
```

## 部署

本站透過 **Vercel** 部署靜態檔案，ROOT 目錄設定為 `landing-page/`。

## 本地預覽

直接用瀏覽器開啟 `landing-page/index.html` 即可。

## 管理員

- 網址：`/admin.html`
- 帳號：`simhope`（可在 `data.js` / `admin.html` 中修改）
