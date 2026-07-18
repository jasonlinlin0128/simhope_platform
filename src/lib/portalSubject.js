import { getAdmin } from "@/lib/firebaseAdmin";
import { ANONYMOUS } from "@/lib/appAccess.mjs";

/**
 * 從 request 組出授權主體（Subject）——**伺服器端唯一的身分來源**。
 * 沒有 Bearer token、token 無效 → 匿名（只看得到 PUBLIC_ALL），不拋錯：
 * 入口網清單本來就要能給訪客看，不能因為沒登入就 401。
 *
 * 停用員工在這裡就被標成 status=inactive → canSeeApp 全部擋掉（規格的停用封鎖點）。
 *
 * @returns {Promise<import("@/lib/appAccess.mjs").Subject>}
 */
export async function getSubject(request) {
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return ANONYMOUS;

  const { adminAuth, adminDb } = getAdmin();
  let uid;
  try {
    ({ uid } = await adminAuth.verifyIdToken(token));
  } catch {
    return ANONYMOUS; // 壞 token 一律降級成訪客，不是錯誤
  }

  const userSnap = await adminDb.collection("users").doc(uid).get();
  const profile = userSnap.exists ? userSnap.data() : {};
  const employeeId = profile.employee_id ?? null;

  let status = "active"; // 無員編的既有帳號（Google/開發者）不受母檔約束
  let departmentId = null;
  if (employeeId) {
    const empSnap = await adminDb.collection("employees").doc(employeeId).get();
    if (!empSnap.exists) return { ...ANONYMOUS, uid }; // 母檔沒了 → 降級（fail-closed）
    const emp = empSnap.data();
    // status 欄位缺失視為 inactive（fail-closed）。不能留 undefined——canSeeApp 會因
    // `status !== "active"` 把他擋成「什麼都看不到」，包括本來人人可見的 PUBLIC_ALL。
    status = emp.status === "active" ? "active" : "inactive";
    departmentId = emp.department_id ?? null;
  }

  return {
    uid,
    employee_id: employeeId,
    status,
    role: profile.role ?? "viewer", // 缺席＝viewer（對齊 rules 的 roleIsViewerOrAbsent）
    acl_roles: Array.isArray(profile.acl_roles) ? profile.acl_roles : [],
    department_id: departmentId,
  };
}
