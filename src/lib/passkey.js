"use client";

import {
  startRegistration,
  startAuthentication,
  browserSupportsWebAuthn,
} from "@simplewebauthn/browser";
import { signInWithCustomToken } from "firebase/auth";
import { auth } from "./firebase";

/** 帶 idToken 的 POST，回 JSON；非 2xx 丟錯。 */
async function authedPost(url, idToken, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(body || {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "請求失敗");
  return data;
}

/** 這個瀏覽器支不支援 WebAuthn / passkey。 */
export function passkeySupported() {
  return typeof window !== "undefined" && browserSupportsWebAuthn();
}

/** 註冊這台裝置的 passkey（需已登入）。 */
export async function registerPasskey(deviceName) {
  const user = auth.currentUser;
  if (!user) throw new Error("請先登入再註冊 Face ID / 指紋");
  const idToken = await user.getIdToken();
  const { challengeId, options } = await authedPost(
    "/api/auth/passkey/register/options",
    idToken,
  );
  const attestationResponse = await startRegistration({ optionsJSON: options });
  await authedPost("/api/auth/passkey/register/verify", idToken, {
    challengeId,
    attestationResponse,
    deviceName,
  });
}

/** 用 passkey 登入（usernameless，免登入態）。成功後建立 Firebase session。 */
export async function loginWithPasskey() {
  const optRes = await fetch("/api/auth/passkey/login/options", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  const optData = await optRes.json().catch(() => ({}));
  if (!optRes.ok) throw new Error(optData.error || "無法取得登入挑戰");
  const { challengeId, options } = optData;

  const assertionResponse = await startAuthentication({ optionsJSON: options });

  const verifyRes = await fetch("/api/auth/passkey/login/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ challengeId, assertionResponse }),
  });
  const data = await verifyRes.json().catch(() => ({}));
  if (!verifyRes.ok) throw new Error(data.error || "passkey 登入失敗");
  await signInWithCustomToken(auth, data.customToken);
}

/** 列出目前使用者已註冊的 passkeys。 */
export async function listPasskeys() {
  const user = auth.currentUser;
  if (!user) return [];
  const idToken = await user.getIdToken();
  const { passkeys } = await authedPost("/api/auth/passkey/list", idToken);
  return passkeys || [];
}

/** 刪除自己的 passkey。 */
export async function deletePasskey(credentialID) {
  const user = auth.currentUser;
  if (!user) throw new Error("未登入");
  const idToken = await user.getIdToken();
  await authedPost("/api/auth/passkey/delete", idToken, { credentialID });
}
