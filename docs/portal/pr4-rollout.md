# PR-4 上線程序（順序錯了＝首頁工具歸零）

> 為什麼需要這份文件：`getServerCatalog()` 看起來是 server 端，實際是**匿名 Firestore REST**，
> 一樣受 firestore.rules 管。而 Firestore 對 **query** 的規則檢查要求「查詢條件本身可證明安全」——
> 收斂後的 rules 要求 `visibility == 'PUBLIC_ALL'`，若查詢沒帶這個條件，**整個查詢被拒**，
> 首頁不是少幾個工具，是變成 0 個（且 `catch → []` 會讓它靜默發生）。
> 這正是 2026-05-29「13→8」事故的同一種形狀（rules 測試 #102 已把它鎖成回歸測試）。

## 三個變更之間的相依

| 變更                                              | 依賴                                                                 |
| ------------------------------------------------- | -------------------------------------------------------------------- |
| A. migration（每個 tool 補 `visibility` 欄位）    | 無                                                                   |
| B. code（serverCatalog 查詢加 `visibility` 過濾） | 依賴 A（沒有欄位的文件不會被等值查詢命中 → 從首頁消失）              |
| C. rules（只放行 `visibility == PUBLIC_ALL`）     | 依賴 A（沒有欄位的文件會被 rules 擋掉）＋ 依賴 B（舊查詢形狀會被拒） |

## 正確順序

```
1. 建索引 tools(visibility ASC, status ASC)   ← 已建（gcloud，READY）
2. node scripts/migrate-tools-portal-fields.mjs           # dry-run 確認 25/25
3. node scripts/migrate-tools-portal-fields.mjs --apply   # 記下 UTC 時間戳
   → 此時 live 站行為完全不變（現行程式碼不讀 visibility）
4. 驗證 live 首頁工具數量與 migration 前一致
5. merge PR → Vercel 部署（serverCatalog 帶 visibility 過濾的新查詢）
   → 此時 rules 仍是舊的（寬鬆），新查詢一樣過得了 → 無破窗
6. 驗證 live 首頁工具數量仍然一致
7. Firebase Console 發布 firestore.rules（收斂）
8. 再驗一次 live 首頁 + 匿名無痕視窗開 /hub
```

**第 3 步刻意排在 merge 之前**——這與 AGENTS.md「code merge → deploy → migration」的通則相反，
理由是：這支 migration 是**純新增欄位**，現行程式碼完全不讀它，因此提前跑是不可觀察的（no-op）；
反過來若照通則先 merge，第 5 步部署的新查詢會找不到任何帶 visibility 的文件 → 首頁當場歸零。
通則的本意是「不要讓資料先於程式碼改變語意」，這裡資料沒有改變任何現行語意。

## 為什麼「新建工具」也必須帶 visibility（review 抓到的延後版事故）

migration 只跑一次。若新建路徑（/dashboard 送審、import script、未來任何新路徑）沒寫
`visibility`，那個工具過審上架後**不會被首頁的等值查詢命中、也讀不到** → 靜默消失。
這是同一個事故延後到「下一個上架的工具」才發生。

處置（三層，缺一不可）：

1. `PORTAL_DEFAULTS`（`src/lib/appAccess.mjs`）＝新建工具必帶的欄位，兩條建立路徑都套用。
2. `firestore.rules` 的 `allow create` **強制** `visibility == 'PUBLIC_ALL'`——忘記寫的當場
   失敗，不會靜默上架成隱形工具（rules 測試 #103–#105）。
3. 要設成受限（BY_RULE/HIDDEN）由 admin 事後在後台改，不從建立端開放。

## ⚠️ 上線期間的凍結規定（第 5 步～第 7 步之間）

這段區間程式碼是新的、rules 還是舊的（寬鬆）。舊 rules 只看 status、不看 visibility →
**此時若把任何工具改成 BY_RULE/HIDDEN，匿名使用者仍可直接讀到它**（連 ACL 欄位一起）。

→ **在第 7 步（rules 發布）完成並驗證之前，不得設定任何受限 app。** 第 8 步的驗收要包含：
用無痕視窗直接讀一個已知的受限文件，必須被拒（permission denied）。

## 出事回滾

- 第 5 步後首頁異常 → Vercel instant rollback（rules 還沒動，舊碼 + 新欄位可正常運作）。
- 第 7 步後首頁異常 → Console 把 tools 的 `allow read` 改回舊條件（拿掉 visibility 那段）即可。
- 資料層 → PITR（`docs/runbooks/firestore-dr.md` 情境 A），用第 3 步記下的時間戳。

## 驗收（第 8 步）

- 匿名無痕：首頁工具數 = 25 筆中的可見數（migration 前後相同）；/hub 卡片數相同。
- 登入 admin：/admin 工具清單（含 pending）正常、🩺 健檢與 📊 使用概況正常（靠 isAdmin 分支）。
- 登入 developer：/dashboard 看得到自己的 pending 工具（靠 authorUid 分支）。
- 詳情頁 /tool/{任一公開工具} 正常開啟。
