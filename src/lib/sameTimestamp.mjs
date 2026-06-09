/**
 * 比對兩個 Firestore updatedAt（樂觀鎖基準版本）。undefined-safe。
 * - both 無 → true（legacy 無 marker，視為無衝突）
 * - 一有一無 → false
 * - 皆 Firestore Timestamp → isEqual（fallback toMillis）
 */
export function sameTimestamp(a, b) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  if (typeof a.isEqual === "function") return a.isEqual(b);
  if (typeof a.toMillis === "function" && typeof b.toMillis === "function")
    return a.toMillis() === b.toMillis();
  return a === b;
}
