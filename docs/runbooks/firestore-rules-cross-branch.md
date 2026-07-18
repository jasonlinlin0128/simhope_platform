# firestore.rules 多分支平行發布 Runbook（順序錯了＝靜默蓋掉其他分支的規則）

> 為什麼需要這份文件：Firebase Console 發布 `firestore.rules` 是**整份文件取代**，不是
> git 那種逐行合併。若兩個以上的 feature branch 同時在改這個檔案，其中一個分支在對方
> merge 前就手動發布了自己孤立版本的 rules，會靜默蓋掉/漏掉另一個分支的規則——沒有
> 任何錯誤訊息，直到有人發現受影響的功能不受規則保護（或反過來被規則誤擋）才會發現。
> 這正是 2026-07-18 analytics 收斂（PR #73）跟 Registry ACL（PR #71）同時改
> `firestore.rules` 時的真實情境——這次靠先確認雙方都 merge 再發布合併版才沒出事，
> 見 `docs/superpowers/specs/2026-07-18-analytics-read-lockdown-design.md`。

## 判斷是否處於風險狀態

```bash
# 列出所有 open PR（或用 gh pr list）
gh pr list --state open --json number,headRefName

# 對每個 open PR 的分支，檢查是否碰了 firestore.rules
git diff main...<branch> --name-only | grep -x firestore.rules
```

若有 **2 個以上** open 分支同時列出 `firestore.rules`，就進入本文件的處理流程。若只有一個，
照該功能自己的 rollout 文件走就好（例如單分支的 `docs/portal/pr4-rollout.md`），不受本文件限制。

## 正確順序

```
1. 列出所有目前「觸碰 firestore.rules 且未 merge」的分支/PR。
2. 逐一 review + merge 進 main（順序依各自 review 就緒程度，不用等其他分支）。
3. 全部 merge 完成後，從當下 main checkout 出最終版 firestore.rules。
4. 只發布這一份「最終合併版」到 Firebase Console——不發布任何單一分支自己的版本。
5. 發布後逐項驗證：對每個分支各自新增/收斂的規則，各跑一條匿名 curl 或
   emulator 測試確認行為符合預期（見下方驗收）。
```

**核心原則**：發布動作永遠指向「當時 main 上最新的 `firestore.rules`」，不是「某個 PR
分支上的 `firestore.rules`」——即使那個 PR 已經 review 通過、測試全綠，只要還有其他分支
也在改這個檔案且尚未合併，就不能提前發布。

## 為什麼不能各自發布再疊加

Console 沒有「發布這段規則、疊加到現有規則上」的操作，只有「用這份文件整個換掉現有規則」。
兩個分支各自的 diff 通常改的是同一份檔案裡不同的 `match` 區塊——git 合併時能正確疊加，
但 Console 發布不會幫你做這件事，貼上哪份文件，正式環境就變成那份文件的樣子。

## 出事怎麼辦

- 發現剛發布的 rules 缺了某個分支的規則（因為發布時那個分支還沒 merge）→ 立刻回
  Firebase Console 重新發布上一個已知正確的版本（或從 git history 取回對的版本手動貼），
  不要想著「反正之後會補」。
- 若已經有請求因為缺規則而通過/被擋（例如某個受限資源被非授權對象讀到）→ 比照
  `docs/runbooks/firestore-dr.md` 情境 A，評估是否需要用 PITR 回溯資料層。

## 驗收

- [ ] 對每個近期合併、涉及 rules 的分支，各挑 1-2 條該分支自己 rules 測試涵蓋的行為，
      用匿名 `curl` 打正式環境 Firestore REST API 驗證：
      `curl -s "https://firestore.googleapis.com/v1/projects/<project>/databases/(default)/documents/<path>"`，
      比對預期是 200 還是 403。
- [ ] `npm run test:rules` 在合併後的 `main` 上全綠（含所有分支各自新增的測試，
      編號無殘留衝突）。
- [ ] 沒有任何分支的規則被靜默漏掉——逐一核對合併後 `firestore.rules` 裡，
      每個分支預期新增/修改的 `match` 區塊都還在。
