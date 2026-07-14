import { initializeApp, getApps } from "firebase/app";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db as primaryDb } from "./firebase";
import { setRole } from "./setRole";

const firebaseConfig = {
  apiKey: "AIzaSyDFknAmnkhg1BMq3lczOndvVLuiWCrnZjU",
  authDomain: "simhope-platform.firebaseapp.com",
  projectId: "simhope-platform",
  storageBucket: "simhope-platform.firebasestorage.app",
  messagingSenderId: "612744138082",
  appId: "1:612744138082:web:f2c3315e39b4e4c2cc303b",
};

const SECONDARY = "secondary-admin";

/**
 * 建立 developer 帳號，不影響 admin 目前的登入 session。
 *
 * 流程（資安加固後）：
 *   1. secondary Firebase App 只負責建立 Auth 帳號（避免登出 admin），建完立刻 signOut
 *   2. role 文件改用 **primary db（admin 仍登入中）** 寫入
 *      → 受 firestore.rules 的 isAdmin() 授權；新使用者本人無法自寫 role（已被 roleIsViewerOrAbsent 擋）
 *
 * 注意：呼叫端（admin 後台）必須是已登入的 admin，否則 primary db 的寫入會被規則拒絕。
 *
 * @param {{ email: string, password: string, displayName?: string, createdByUid: string }} options
 * @returns {Promise<string>} 新使用者的 UID
 */
export async function createDeveloperAccount({
  email,
  password,
  displayName,
  createdByUid,
}) {
  const existing = getApps().find((a) => a.name === SECONDARY);
  const secondaryApp = existing || initializeApp(firebaseConfig, SECONDARY);
  const secondaryAuth = getAuth(secondaryApp);

  // 1. 用 secondary app 建 Auth 帳號，建完立刻登出 secondary（不碰 primary 的 admin session）
  const { user } = await createUserWithEmailAndPassword(
    secondaryAuth,
    email,
    password,
  );
  await signOut(secondaryAuth);

  // 2. 基本資料由 primary（admin）寫入 → 受 isAdmin() 授權
  await setDoc(doc(primaryDb, "users", user.uid), {
    uid: user.uid,
    email,
    displayName: displayName || email.split("@")[0],
    createdBy: createdByUid,
    createdAt: serverTimestamp(),
  });

  // 3. role 一律走後端（稽核）：這裡不寫 role，由 /api/admin/set-role 授予並寫
  //    PERMISSION_CHANGE。失敗就讓錯誤往上拋——帳號會停在無 role（＝viewer）狀態，
  //    admin 可在帳號管理重試授權，不會留下「有 developer 權限但沒稽核」的帳號。
  await setRole(user.uid, "developer");

  return user.uid;
}
