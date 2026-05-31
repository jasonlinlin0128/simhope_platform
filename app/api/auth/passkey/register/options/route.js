import { NextResponse } from "next/server";
import { generateRegistrationOptions } from "@simplewebauthn/server";
import { getAdmin } from "@/lib/firebaseAdmin";
import { requireUser, getRpInfo, storeChallenge } from "@/lib/passkeyServer";

/**
 * POST /api/auth/passkey/register/options
 * 需登入。產生 passkey 註冊 challenge（usernameless：residentKey required）。
 */
export async function POST(request) {
  try {
    const decoded = await requireUser(request);
    const uid = decoded.uid;
    const email = decoded.email || "";
    const { rpID, rpName } = getRpInfo(request);
    const { adminDb } = getAdmin();

    // 既有 passkeys → excludeCredentials（避免同一裝置重複註冊）
    const existing = await adminDb
      .collection("passkeys")
      .where("uid", "==", uid)
      .get();
    const excludeCredentials = existing.docs.map((d) => ({
      id: d.id,
      transports: d.data().transports?.length ? d.data().transports : undefined,
    }));

    const options = await generateRegistrationOptions({
      rpName,
      rpID,
      userName: email || uid,
      userDisplayName: decoded.name || email || uid,
      userID: new TextEncoder().encode(uid),
      attestationType: "none",
      excludeCredentials,
      authenticatorSelection: {
        residentKey: "required",
        userVerification: "required",
      },
    });

    const challengeId = await storeChallenge({
      challenge: options.challenge,
      uid,
      type: "register",
    });
    return NextResponse.json({ challengeId, options });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.status || 500 });
  }
}
