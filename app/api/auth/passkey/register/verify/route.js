import { NextResponse } from "next/server";
import { verifyRegistrationResponse } from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import { getAdmin } from "@/lib/firebaseAdmin";
import { requireUser, getRpInfo, consumeChallenge } from "@/lib/passkeyServer";
import { HttpError } from "@/lib/httpError.mjs";

/**
 * POST /api/auth/passkey/register/verify
 * 需登入。驗證 attestation，存公鑰到 passkeys/{credentialID}。
 * Body: { challengeId, attestationResponse, deviceName }
 */
export async function POST(request) {
  try {
    const decoded = await requireUser(request);
    const uid = decoded.uid;
    const { challengeId, attestationResponse, deviceName } =
      await request.json();

    const { challenge, uid: challengeUid } = await consumeChallenge(
      challengeId,
      "register",
    );
    if (challengeUid !== uid)
      throw new HttpError(400, "challenge 與使用者不符");

    const { rpID, origin } = getRpInfo(request);
    const verification = await verifyRegistrationResponse({
      response: attestationResponse,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
    });

    if (!verification.verified || !verification.registrationInfo) {
      throw new HttpError(400, "passkey 註冊驗證失敗");
    }

    const { credential, credentialDeviceType, credentialBackedUp } =
      verification.registrationInfo;
    const { adminDb } = getAdmin();
    await adminDb
      .collection("passkeys")
      .doc(credential.id)
      .set({
        uid,
        publicKey: isoBase64URL.fromBuffer(credential.publicKey),
        counter: credential.counter,
        transports: credential.transports || [],
        deviceType: credentialDeviceType,
        backedUp: credentialBackedUp,
        deviceName: (deviceName || "").slice(0, 60) || "未命名裝置",
        createdAt: Date.now(),
        lastUsedAt: Date.now(),
      });

    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.status || 500 });
  }
}
