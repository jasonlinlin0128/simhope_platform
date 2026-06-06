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
console.log("smoke:");
await it("smoke: 未登入讀 tools → ALLOW", async () => {
  await assertSucceeds(getDoc(doc(anon, "tools", "t_pending")));
});
// ===== TESTS END =====

await testEnv.cleanup();
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
