import { auth } from "@/lib/firebase";

/**
 * 變更角色（admin 專用）→ /api/admin/set-role。
 * 之所以不在 client 直接 updateDoc users/{uid}.role：沒有 server hop 就寫不出可信的
 * PERMISSION_CHANGE 稽核。伺服器端會把「變更」與「稽核」放同一個 batch。
 * @throws {Error} 後端回傳的錯誤訊息
 */
export async function setRole(uid, role, devStatus) {
  const idToken = await auth.currentUser.getIdToken();
  const res = await fetch("/api/admin/set-role", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ uid, role, ...(devStatus ? { devStatus } : {}) }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "角色變更失敗");
  return data;
}
