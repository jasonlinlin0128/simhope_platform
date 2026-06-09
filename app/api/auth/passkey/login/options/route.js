import { NextResponse } from "next/server";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { getRpInfo, storeChallenge } from "@/lib/passkeyServer";
import { rateLimit, clientIp } from "@/lib/rateLimit.mjs";
import { HttpError } from "@/lib/httpError.mjs";

/**
 * POST /api/auth/passkey/login/options
 * 不需登入。usernameless：allowCredentials 留空 → 瀏覽器列出本域所有 resident key。
 */
export async function POST(request) {
  try {
    const ip = clientIp(request);
    if (!rateLimit(`pk-login:${ip}`, { limit: 10, windowMs: 60000 }).ok)
      throw new HttpError(429, "操作過於頻繁，請稍後再試");

    const { rpID } = getRpInfo(request);
    const options = await generateAuthenticationOptions({
      rpID,
      allowCredentials: [],
      userVerification: "required",
    });
    const challengeId = await storeChallenge({
      challenge: options.challenge,
      type: "login",
    });
    return NextResponse.json({ challengeId, options });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.status || 500 });
  }
}
