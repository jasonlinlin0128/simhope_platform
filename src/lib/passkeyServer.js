import { randomUUID } from "crypto";
import { getAdmin } from "./firebaseAdmin";
import { HttpError } from "./httpError.mjs";
import { Timestamp } from "firebase-admin/firestore";

/**
 * passkey API route 共用伺服器端 helper。
 */

const CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5 分鐘

/** 從 Authorization: Bearer <idToken> 驗證並回 decoded token（含 uid）。失敗丟錯。 */
export async function requireUser(request) {
  const authHeader = request.headers.get("authorization");
  const idToken = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;
  if (!idToken) throw new HttpError(401, "未授權");
  const { adminAuth } = getAdmin();
  try {
    return await adminAuth.verifyIdToken(idToken);
  } catch {
    throw new HttpError(401, "idToken 無效");
  }
}

/** 從 request host 推 rpID / origin（支援 localhost dev 與 vercel.app prod）。 */
export function getRpInfo(request) {
  const host = request.headers.get("host") || "localhost:3000";
  const rpID = host.split(":")[0];
  const proto = rpID === "localhost" ? "http" : "https";
  return { rpID, origin: `${proto}://${host}`, rpName: "SimHope AI 工具中心" };
}

/** 存一筆 challenge，回 challengeId（單次使用）。 */
export async function storeChallenge({ challenge, uid = null, type }) {
  const { adminDb } = getAdmin();
  const challengeId = randomUUID();
  const now = Date.now();
  await adminDb
    .collection("webauthnChallenges")
    .doc(challengeId)
    .set({
      challenge,
      uid,
      type,
      createdAt: now,
      // TTL：Firestore TTL policy（欄位 expireAt）過期後清掉沒被消費的孤兒 challenge。
      expireAt: Timestamp.fromMillis(now + CHALLENGE_TTL_MS),
    });
  return challengeId;
}

/** 取出並刪除 challenge（單次使用）。驗證 type 與 TTL。回 { challenge, uid }。 */
export async function consumeChallenge(challengeId, expectedType) {
  if (!challengeId) throw new HttpError(400, "缺少 challengeId");
  const { adminDb } = getAdmin();
  const ref = adminDb.collection("webauthnChallenges").doc(challengeId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpError(400, "challenge 不存在或已使用");
  const data = snap.data();
  await ref.delete(); // 單次使用：先刪
  if (data.type !== expectedType)
    throw new HttpError(400, "challenge 類型不符");
  if (Date.now() - (data.createdAt || 0) > CHALLENGE_TTL_MS) {
    throw new HttpError(400, "challenge 已過期，請重試");
  }
  return { challenge: data.challenge, uid: data.uid };
}
