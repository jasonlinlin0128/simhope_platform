// Firestore Security Rules 單元測試（跑在 Firebase emulator 上）。
// 執行：npm run test:rules（shell 需有 java；見下方 JAVA 說明）。
import { readFileSync } from "node:fs";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from "@firebase/rules-unit-testing";
import { doc, setDoc, updateDoc, deleteDoc, getDoc } from "firebase/firestore";

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
    await setDoc(doc(db, "painCards", "pc1"), {
      approval: "approved", before: "b", after: "a", // 正式資料：無 authorUid
    });
    await setDoc(doc(db, "painCards", "pc_dev1"), {
      authorUid: "dev1", approval: "pending", before: "b", after: "a",
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
// ===== TESTS END =====

await testEnv.cleanup();
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
