import { HttpError } from "./httpError.mjs";

/**
 * 驗 Bearer idToken（Admin SDK）+ 讀 users/{uid}.role，role 不在 roles 內就擋。
 * @param {Request} req
 * @param {string[]} roles            允許的角色，如 ["developer","admin"]
 * @param {object}  [opts]
 * @param {string}  [opts.forbiddenMessage]  403 自訂訊息
 * @param {{adminAuth, adminDb}} [opts.admin]  注入點（測試）；未注入時 prod 動態載入 getAdmin
 * @returns {Promise<{uid:string, role:string|undefined}>}
 * @throws  {HttpError} 401 / 403
 */
export async function requireRole(req, roles, opts = {}) {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) throw new HttpError(401, "未授權");

  // 動態 import：讓 node --test 載 apiAuth 時不連帶載入 firebase-admin（測試一律注入 opts.admin）。
  const { adminAuth, adminDb } =
    opts.admin ?? (await import("./firebaseAdmin.js")).getAdmin();

  let decoded;
  try {
    // 刻意不帶 checkRevoked：本地驗簽即可，開了會每請求多一次網路讀並放大 DoS 面。
    decoded = await adminAuth.verifyIdToken(token);
  } catch {
    throw new HttpError(401, "未授權");
  }
  const uid = decoded.uid;

  const snap = await adminDb.collection("users").doc(uid).get();
  const role = snap.exists ? snap.data().role : undefined; // Admin SDK：exists 是 property
  if (!roles.includes(role)) {
    throw new HttpError(403, opts.forbiddenMessage || "權限不足");
  }
  return { uid, role };
}
