import { db } from "./firebase";
import { normalizeMetrics } from "./metrics.mjs";
import { sortByCreatedAtDesc } from "./requests.mjs";
import {
  collection,
  getDocs,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  serverTimestamp,
} from "firebase/firestore";
import { DEFAULT_SITE } from "./siteDefaults";

// 對外 re-export，沿用既有 `import { DEFAULT_SITE } from "@/lib/db"`。
export { DEFAULT_SITE };

export const DEPTS = {
  factory: { label: "🏭 生產現場", cls: "dept-factory" },
  admin: { label: "📋 行政/文書", cls: "dept-admin" },
  mgmt: { label: "👔 主管/管理", cls: "dept-mgmt" },
  quality: { label: "🔧 品管/工程", cls: "dept-quality" },
  defense: { label: "🛡️ 國防/專案", cls: "dept-defense" },
  other: { label: "🔹 其他", cls: "dept-admin" },
};

export const STATUSES = {
  live: { label: "使用中", cls: "status-live" },
  beta: { label: "測試中", cls: "status-beta" },
  new: { label: "新上線", cls: "status-new" },
  dev: { label: "開發中", cls: "status-dev" },
  pending: { label: "待驗收", cls: "status-pending" },
  terminated: { label: "已終止", cls: "status-terminated" },
};

// --- Firebase Modular SDK DB Wrappers ---

/**
 * @param {string} uid
 * @returns {Promise<object|null>} Profile data, or null if not found / on error
 */
export async function getUserProfile(uid) {
  if (!uid) return null;
  try {
    const snap = await getDoc(doc(db, "users", uid));
    return snap.exists() ? snap.data() : null;
  } catch {
    return null;
  }
}

/**
 * 確保登入使用者在 Firestore 有一份 users 文件。
 * 若不存在 → 建立「無 role」的 viewer 文件（受 firestore.rules 的
 * roleIsViewerOrAbsent 約束，使用者無法藉此自我提權）。
 * 已存在（含有 role 的）→ 不動。
 * @param {import('firebase/auth').User} user
 */
export async function ensureUserDoc(user) {
  if (!user?.uid) return;
  try {
    const ref = doc(db, "users", user.uid);
    const snap = await getDoc(ref);
    if (snap.exists()) return; // 既有文件（可能含 role）不覆蓋
    const provider = user.providerData?.[0]?.providerId || "unknown";
    await setDoc(ref, {
      uid: user.uid,
      email: user.email || "",
      displayName:
        user.displayName || (user.email ? user.email.split("@")[0] : ""),
      photoURL: user.photoURL || "",
      provider,
      createdAt: serverTimestamp(),
      // 注意：不寫 role 欄位 → 視為 viewer，由 admin 後台手動提拔
    });
  } catch (e) {
    // 建文件失敗不應擋住登入（例如規則暫時拒絕）— 靜默記錄
    console.error("ensureUserDoc failed:", e);
  }
}

/** Returns all documents in the `tools` collection (admin use only). */
export async function getAllTools() {
  const snap = await getDocs(collection(db, "tools"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Returns tools visible to the current user.
 * Admins get everything; others get tools where `status` is live/beta/new/dev/terminated.
 * Pending tools are only visible to author/admin.
 *
 * 註：原本還會 fallback 查 legacy `approval === 'approved'` 欄位，2026-05-29 cleanup 後砍掉。
 * @param {boolean} [isAdmin=false] 由呼叫端（AuthContext 已持有）傳入；true=回全部，false=只回公開狀態。
 */
export async function getApprovedTools(isAdmin = false) {
  if (isAdmin) {
    return await getAllTools();
  }
  const snap = await getDocs(
    query(
      collection(db, "tools"),
      where("status", "in", ["live", "beta", "new", "dev", "terminated"]),
    ),
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * 取已發布的 FAQ，依 category 內 order 升冪。
 * @returns {Promise<object[]>}
 */
export async function getFaqs() {
  const snap = await getDocs(collection(db, "faqs"));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((f) => f.published !== false)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

/**
 * 取目錄（catalog）— 重用 getApprovedTools 的可見性，再依 category 過濾。
 * @param {{category?: string, isAdmin?: boolean}} opts  category 省略或 'all' = 全部；isAdmin 透傳給 getApprovedTools
 * @returns {Promise<object[]>}
 */
export async function getCatalog({ category, isAdmin } = {}) {
  const tools = await getApprovedTools(isAdmin);
  if (!category || category === "all") return tools;
  // 無 category 欄位的舊資料視為 'tool'（與 categoryCounts 一致）
  return tools.filter((t) => (t.category || "tool") === category);
}

/**
 * Returns approved pain cards, falling back to DEFAULT_SITE.painCards
 * when the Firestore collection is empty (e.g. fresh deploy).
 */
export async function getApprovedPainCards(isAdmin = false) {
  let snap;
  if (isAdmin) {
    snap = await getDocs(collection(db, "painCards"));
  } else {
    const q = query(
      collection(db, "painCards"),
      where("approval", "==", "approved"),
    );
    snap = await getDocs(q);
  }

  const defaultPains = DEFAULT_SITE.painCards || [];
  if (snap.empty && defaultPains.length > 0) return defaultPains;

  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * 讀使用累計數（首頁 MetricsBand 用）。
 * doc 不存在 / 讀取失敗 → 全 0（冷啟動安全）。
 * @returns {Promise<{toolOpen:number, toolView:number, search:number, requestSubmit:number}>}
 */
export async function getMetrics() {
  try {
    const snap = await getDoc(doc(db, "analytics", "totals"));
    return normalizeMetrics(snap.exists() ? snap.data() : {});
  } catch {
    return normalizeMetrics({});
  }
}

/**
 * 取目前使用者自己提的需求（feature requests），新→舊。
 * 用等值查 uid==X（免 composite index）+ client 排序。
 * @param {string} uid
 * @returns {Promise<object[]>}
 */
export async function getMyRequests(uid) {
  if (!uid) return [];
  const snap = await getDocs(
    query(collection(db, "requests"), where("uid", "==", uid)),
  );
  return sortByCreatedAtDesc(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
}
