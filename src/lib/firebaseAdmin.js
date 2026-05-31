import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

/**
 * Firebase Admin SDK（伺服器端專用）。
 *
 * 用 FIREBASE_SERVICE_ACCOUNT 環境變數（serviceAccountKey.json 全文 JSON 字串）初始化。
 * 只能在 server（API route）import — 絕不可在 client component 引入。
 *
 * 用途：passkey 登入時鑄 custom token、讀寫 server-only 的 passkeys/webauthnChallenges。
 */
let adminAuth = null;
let adminDb = null;

function init() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    throw new Error(
      "缺少 FIREBASE_SERVICE_ACCOUNT 環境變數（請在 Vercel / .env.local 設定）",
    );
  }
  const app = getApps().length
    ? getApps()[0]
    : initializeApp({ credential: cert(JSON.parse(raw)) });
  adminAuth = getAuth(app);
  adminDb = getFirestore(app);
}

export function getAdmin() {
  if (!adminAuth || !adminDb) init();
  return { adminAuth, adminDb };
}
