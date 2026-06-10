// Firestore Security Rules 單元測試（跑在 Firebase emulator 上）。
// 執行：npm run test:rules（shell 需有 java；見下方 JAVA 說明）。
import { readFileSync } from "node:fs";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from "@firebase/rules-unit-testing";
import {
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  collection,
  query,
  where,
} from "firebase/firestore";

const PROJECT_ID = "demo-simhope-rules";
let passed = 0;
let failed = 0;

const testEnv = await initializeTestEnvironment({
  projectId: PROJECT_ID,
  firestore: { rules: readFileSync("firestore.rules", "utf8") },
});

const anon = testEnv.unauthenticatedContext().firestore();
const dev1 = testEnv.authenticatedContext("dev1").firestore();
const dev2 = testEnv.authenticatedContext("dev2").firestore();
const admin = testEnv.authenticatedContext("admin1").firestore();
const viewer1 = testEnv.authenticatedContext("viewer1").firestore();

// 每條測試前清空並重新種子 → 測試彼此獨立。
async function seed() {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "users", "admin1"), { role: "admin" });
    await setDoc(doc(db, "users", "dev1"), { role: "developer" });
    await setDoc(doc(db, "users", "dev2"), { role: "developer" });
    await setDoc(doc(db, "users", "viewer1"), { email: "v@x.com" }); // 無 role
    await setDoc(doc(db, "tools", "t_pending"), {
      authorUid: "dev1", status: "pending", createdAt: 1000, title: "P",
    });
    await setDoc(doc(db, "tools", "t_live"), {
      authorUid: "dev1", status: "live", createdAt: 1000, title: "L",
    });
    await setDoc(doc(db, "tools", "t_legacy_nocreated"), {
      authorUid: "dev1", status: "pending", title: "NoCreated", // 缺 createdAt
    });
    await setDoc(doc(db, "tools", "t_no_author"), {
      status: "live", createdAt: 1000, title: "NoAuthor", // 缺 authorUid（fail-closed fixture）
    });
    await setDoc(doc(db, "tools", "t_no_status"), {
      authorUid: "dev1", createdAt: 1000, title: "NoStatus", // 缺 status（fail-closed fixture）
    });
    await setDoc(doc(db, "painCards", "pc1"), {
      approval: "approved", before: "b", after: "a", // 正式資料：無 authorUid
    });
    await setDoc(doc(db, "painCards", "pc_dev1"), {
      authorUid: "dev1", approval: "pending", before: "b", after: "a",
    });
    await setDoc(doc(db, "analytics", "totals"), {
      toolOpen: 5, toolView: 9,
    });
    await setDoc(doc(db, "analytics_daily", "20260610"), {
      date: "2026-06-10", toolOpen: 2,
    });
    await setDoc(doc(db, "requests", "req_dev1"), {
      type: "feature", uid: "dev1", message: "m1", status: "pending", createdAt: 1000,
    });
    await setDoc(doc(db, "requests", "req_dev2"), {
      type: "feature", uid: "dev2", message: "m2", status: "pending", createdAt: 1000,
    });
    await setDoc(doc(db, "requests", "req_anon"), {
      type: "feature", message: "m3", status: "pending", createdAt: 1000, // 無 uid（匿名）
    });
  });
}

async function it(name, fn) {
  await seed();
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.error(`  ✗ ${name}\n    ${e.message}`);
  }
}

// ===== TESTS START =====
console.log("tools:");
await it("1. 作者改自己 pending 工具內容 → ALLOW", async () => {
  await assertSucceeds(
    updateDoc(doc(dev1, "tools", "t_pending"), { url: "https://x", type: "webapp" }),
  );
});
await it("2. 作者把自己工具 status 改 live（P0） → DENY", async () => {
  await assertFails(updateDoc(doc(dev1, "tools", "t_pending"), { status: "live" }));
});
await it("3. 作者改自己工具 authorUid → DENY", async () => {
  await assertFails(updateDoc(doc(dev1, "tools", "t_pending"), { authorUid: "dev2" }));
});
await it("4. 作者改自己工具 createdAt → DENY", async () => {
  await assertFails(updateDoc(doc(dev1, "tools", "t_pending"), { createdAt: 9999 }));
});
await it("5. admin 改任一工具 status → ALLOW", async () => {
  await assertSucceeds(updateDoc(doc(admin, "tools", "t_pending"), { status: "beta" }));
});
await it("6. admin 改工具 authorUid（轉移） → ALLOW", async () => {
  await assertSucceeds(updateDoc(doc(admin, "tools", "t_live"), { authorUid: "dev2" }));
});
await it("7. 非作者非 admin 改別人的工具 → DENY", async () => {
  await assertFails(updateDoc(doc(dev2, "tools", "t_pending"), { url: "https://y" }));
});
await it("8. developer create status:'live' → DENY", async () => {
  await assertFails(
    setDoc(doc(dev1, "tools", "t_new_live"), {
      authorUid: "dev1", status: "live", createdAt: 1,
    }),
  );
});
await it("9. developer create status:'pending'、authorUid 自己 → ALLOW", async () => {
  await assertSucceeds(
    setDoc(doc(dev1, "tools", "t_new_pending"), {
      authorUid: "dev1", status: "pending", createdAt: 1,
    }),
  );
});
await it("10. 作者編輯缺 createdAt 的舊工具內容（不 brick） → ALLOW", async () => {
  await assertSucceeds(
    updateDoc(doc(dev1, "tools", "t_legacy_nocreated"), { url: "https://z" }),
  );
});
await it("11. 作者刪自己工具 → ALLOW", async () => {
  await assertSucceeds(deleteDoc(doc(dev1, "tools", "t_live")));
});
await it("12. 非作者刪別人工具 → DENY", async () => {
  await assertFails(deleteDoc(doc(dev2, "tools", "t_pending")));
});

console.log("painCards:");
await it("13. developer 改自己 painCard approval → DENY", async () => {
  await assertFails(updateDoc(doc(dev1, "painCards", "pc_dev1"), { approval: "approved" }));
});
await it("14. admin 改 painCard approval → ALLOW", async () => {
  await assertSucceeds(updateDoc(doc(admin, "painCards", "pc1"), { approval: "rejected" }));
});
await it("15. developer create painCard approval:'pending' → ALLOW", async () => {
  await assertSucceeds(
    setDoc(doc(dev1, "painCards", "pc_new"), {
      authorUid: "dev1", approval: "pending", before: "b", after: "a",
    }),
  );
});

console.log("fail-closed（缺安全欄位 → 作者 DENY / admin ALLOW）:");
await it("16. 作者編輯缺 authorUid 的工具內容（fail-closed） → DENY", async () => {
  await assertFails(updateDoc(doc(dev1, "tools", "t_no_author"), { url: "https://a" }));
});
await it("17. admin 編輯缺 authorUid 的工具內容 → ALLOW", async () => {
  await assertSucceeds(updateDoc(doc(admin, "tools", "t_no_author"), { url: "https://a" }));
});
await it("18. 作者編輯缺 status 的工具內容（fail-closed） → DENY", async () => {
  await assertFails(updateDoc(doc(dev1, "tools", "t_no_status"), { url: "https://s" }));
});
await it("19. admin 編輯缺 status 的工具內容 → ALLOW", async () => {
  await assertSucceeds(updateDoc(doc(admin, "tools", "t_no_status"), { url: "https://s" }));
});

console.log("提權主體（anon / viewer 無 role）:");
await it("20. 未登入建立工具 → DENY", async () => {
  await assertFails(
    setDoc(doc(anon, "tools", "t_anon"), { authorUid: "x", status: "pending", createdAt: 1 }),
  );
});
await it("21. viewer（無 role）建立工具 → DENY", async () => {
  await assertFails(
    setDoc(doc(viewer1, "tools", "t_v"), { authorUid: "viewer1", status: "pending", createdAt: 1 }),
  );
});
await it("22. viewer（無 role）建立 painCard → DENY", async () => {
  await assertFails(
    setDoc(doc(viewer1, "painCards", "pc_v"), {
      authorUid: "viewer1", approval: "pending", before: "b", after: "a",
    }),
  );
});
await it("23. viewer 改別人既有工具 → DENY", async () => {
  await assertFails(updateDoc(doc(viewer1, "tools", "t_pending"), { url: "https://v" }));
});

console.log("邊界 / 組合攻擊:");
await it("24. 作者同時改 status+authorUid（P0 組合攻擊） → DENY", async () => {
  await assertFails(
    updateDoc(doc(dev1, "tools", "t_pending"), { status: "live", authorUid: "dev2" }),
  );
});
await it("25. 作者刪自己 painCard（僅 admin 可刪） → DENY", async () => {
  await assertFails(deleteDoc(doc(dev1, "painCards", "pc_dev1")));
});
await it("26. admin 刪 painCard → ALLOW", async () => {
  await assertSucceeds(deleteDoc(doc(admin, "painCards", "pc1")));
});
await it("27. 作者 setDoc 覆寫既有工具改 status=live（走 update 評估） → DENY", async () => {
  await assertFails(
    setDoc(doc(dev1, "tools", "t_pending"), {
      authorUid: "dev1", status: "live", createdAt: 1000, title: "P",
    }),
  );
});
console.log("tools / painCards read 收緊（S3）:");
await it("28. anon 讀公開 t_live → ALLOW", async () => {
  await assertSucceeds(getDoc(doc(anon, "tools", "t_live")));
});
await it("29. anon 讀未審 t_pending → DENY", async () => {
  await assertFails(getDoc(doc(anon, "tools", "t_pending")));
});
await it("30. dev2（非作者非 admin）讀 t_pending → DENY", async () => {
  await assertFails(getDoc(doc(dev2, "tools", "t_pending")));
});
await it("31. dev1（作者）讀自己 t_pending → ALLOW", async () => {
  await assertSucceeds(getDoc(doc(dev1, "tools", "t_pending")));
});
await it("32. admin 讀 t_pending → ALLOW", async () => {
  await assertSucceeds(getDoc(doc(admin, "tools", "t_pending")));
});
await it("33. viewer（無 role）讀公開 t_live → ALLOW", async () => {
  await assertSucceeds(getDoc(doc(viewer1, "tools", "t_live")));
});
await it("34. anon 讀已核准 pc1 → ALLOW", async () => {
  await assertSucceeds(getDoc(doc(anon, "painCards", "pc1")));
});
await it("35. anon 讀未核准 pc_dev1 → DENY", async () => {
  await assertFails(getDoc(doc(anon, "painCards", "pc_dev1")));
});
await it("36. dev1（作者）讀自己 pc_dev1 → ALLOW", async () => {
  await assertSucceeds(getDoc(doc(dev1, "painCards", "pc_dev1")));
});
await it("37. admin 讀 pc_dev1 → ALLOW", async () => {
  await assertSucceeds(getDoc(doc(admin, "painCards", "pc_dev1")));
});

console.log("LIST query 相容性（P0 防護：home/hub/admin/dashboard 查詢）:");
await it("38. anon LIST tools where status in [public]（home/hub）→ ALLOW", async () => {
  await assertSucceeds(
    getDocs(
      query(
        collection(anon, "tools"),
        where("status", "in", ["live", "beta", "new", "dev", "terminated"]),
      ),
    ),
  );
});
await it("39. anon 無約束 LIST tools（含 pending）→ DENY", async () => {
  await assertFails(getDocs(collection(anon, "tools")));
});
await it("40. anon LIST painCards where approval=='approved' → ALLOW", async () => {
  await assertSucceeds(
    getDocs(
      query(collection(anon, "painCards"), where("approval", "==", "approved")),
    ),
  );
});
await it("41. admin 無約束 LIST tools → ALLOW", async () => {
  await assertSucceeds(getDocs(collection(admin, "tools")));
});
await it("42. dev1 LIST tools where authorUid=='dev1'（dashboard）→ ALLOW", async () => {
  await assertSucceeds(
    getDocs(query(collection(dev1, "tools"), where("authorUid", "==", "dev1"))),
  );
});
// ===== analytics（使用數據）=====
await it("43. anon 可讀 analytics/totals（首頁要顯示）→ ALLOW", async () => {
  await assertSucceeds(getDoc(doc(anon, "analytics", "totals")));
});
await it("44. anon 不可寫 analytics/totals → DENY", async () => {
  await assertFails(setDoc(doc(anon, "analytics", "totals"), { toolOpen: 999 }));
});
await it("45. dev（一般登入）不可寫 analytics/totals → DENY", async () => {
  await assertFails(
    updateDoc(doc(dev1, "analytics", "totals"), { toolOpen: 999 }),
  );
});
await it("46. anon 不可讀 analytics_daily（僅 admin）→ DENY", async () => {
  await assertFails(getDoc(doc(anon, "analytics_daily", "20260610")));
});
await it("47. admin 可讀 analytics_daily、但仍不可寫", async () => {
  await assertSucceeds(getDoc(doc(admin, "analytics_daily", "20260610")));
  await assertFails(
    setDoc(doc(admin, "analytics_daily", "20260610"), { toolOpen: 1 }),
  );
});
// ===== requests 讀自己（B-2b）=====
await it("48. dev1 讀自己的 request（uid 相符）→ ALLOW", async () => {
  await assertSucceeds(getDoc(doc(dev1, "requests", "req_dev1")));
});
await it("49. dev1 讀別人的 request → DENY", async () => {
  await assertFails(getDoc(doc(dev1, "requests", "req_dev2")));
});
await it("50. dev1 讀匿名 request（無 uid）→ DENY", async () => {
  await assertFails(getDoc(doc(dev1, "requests", "req_anon")));
});
await it("51. admin 讀任意 request → ALLOW", async () => {
  await assertSucceeds(getDoc(doc(admin, "requests", "req_dev2")));
  await assertSucceeds(getDoc(doc(admin, "requests", "req_anon")));
});
await it("52. anon（未登入）讀 request → DENY", async () => {
  await assertFails(getDoc(doc(anon, "requests", "req_dev1")));
});
// ===== TESTS END =====

await testEnv.cleanup();
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
