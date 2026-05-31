import { NextResponse } from "next/server";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import { getAdmin } from "@/lib/firebaseAdmin";
import { getRpInfo, consumeChallenge, HttpError } from "@/lib/passkeyServer";

/**
 * POST /api/auth/passkey/login/verify
 * 不需登入。驗證 assertion → 鑄 Firebase custom token。
 * Body: { challengeId, assertionResponse }
 *
 * 安全：uid 一律來自「伺服器以 credentialID 查到的 owner」，絕不信任 client 傳的 uid。
 */
export async function POST(request) {
  try {
    const { challengeId, assertionResponse } = await request.json();
    const { challenge } = await consumeChallenge(challengeId, "login");
    const { rpID, origin } = getRpInfo(request);
    const { adminDb, adminAuth } = getAdmin();

    const credId = assertionResponse?.id;
    if (!credId) throw new HttpError(400, "缺少 credential id");

    const snap = await adminDb.collection("passkeys").doc(credId).get();
    if (!snap.exists)
      throw new HttpError(400, "找不到此 passkey，請改用其他方式登入");
    const cred = snap.data();

    const verification = await verifyAuthenticationResponse({
      response: assertionResponse,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: credId,
        publicKey: isoBase64URL.toBuffer(cred.publicKey),
        counter: cred.counter,
        transports: cred.transports?.length ? cred.transports : undefined,
      },
      requireUserVerification: true,
    });

    if (!verification.verified) throw new HttpError(400, "passkey 驗證失敗");

    // userHandle 交叉驗證（assertion 回傳的 userHandle 應等於儲存的 uid）
    const userHandle = assertionResponse?.response?.userHandle;
    if (userHandle) {
      const handleUid = new TextDecoder().decode(
        isoBase64URL.toBuffer(userHandle),
      );
      if (handleUid !== cred.uid)
        throw new HttpError(400, "userHandle 與 credential 不符");
    }

    // 更新 counter（防複製）+ lastUsedAt
    await snap.ref.update({
      counter: verification.authenticationInfo.newCounter,
      lastUsedAt: Date.now(),
    });

    // 鑄 custom token — uid 來自伺服器查到的 credential owner
    const customToken = await adminAuth.createCustomToken(cred.uid);
    return NextResponse.json({ customToken });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.status || 500 });
  }
}
