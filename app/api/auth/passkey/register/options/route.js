import { NextResponse } from "next/server";
import { generateRegistrationOptions } from "@simplewebauthn/server";
import { getAdmin } from "@/lib/firebaseAdmin";
import { requireUser, getRpInfo, storeChallenge } from "@/lib/passkeyServer";
import { rateLimit, clientIp } from "@/lib/rateLimit.mjs";
import { HttpError } from "@/lib/httpError.mjs";

/**
 * POST /api/auth/passkey/register/options
 * 需登入。產生 passkey 註冊 challenge（usernameless：residentKey required）。
 */
export async function POST(request) {
  try {
    const ip = clientIp(request);
    if (!rateLimit(`pk-register:${ip}`, { limit: 10, windowMs: 60000 }).ok)
      throw new HttpError(429, "操作過於頻繁，請稍後再試");

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
