// src/lib/track.js
// client 端使用追蹤：fire-and-forget POST /api/track。
// 不 await、吞錯、絕不擋 UI；tool_open / tool_view 同 session 去重。
import { shouldTrack } from "@/lib/trackEvents.mjs";

// sessionStorage-backed 去重 Set。任何存取失敗（無痕/停用）皆退化為「不去重」。
function sessionSeen() {
  return {
    has: (k) => {
      try {
        return sessionStorage.getItem("trk:" + k) === "1";
      } catch {
        return false;
      }
    },
    add: (k) => {
      try {
        sessionStorage.setItem("trk:" + k, "1");
      } catch {
        /* 忽略 */
      }
    },
  };
}

/**
 * 送一筆使用事件。
 * @param {"tool_open"|"tool_view"|"tool_helpful"|"search"|"request_submit"} event
 * @param {{toolId?: string}} [payload]
 */
export function track(event, payload = {}) {
  if (typeof window === "undefined") return; // SSR 保險
  // 只對 tool_open / tool_view / tool_helpful 去重（同一工具重整 / 來回 / 重複按不重複計）。
  // search 與 request_submit 每次都是真事件 → 不去重（同 session 兩筆需求都要算）。
  const dedup =
    event === "tool_open" || event === "tool_view" || event === "tool_helpful";
  const dedupKey = dedup ? `${event}:${payload.toolId || ""}` : null;
  if (!shouldTrack(event, dedupKey, sessionSeen())) return;
  try {
    fetch("/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, toolId: payload.toolId }),
      keepalive: true, // 點外連即離開頁面時仍送得出去
    }).catch(() => {});
  } catch {
    /* fire-and-forget */
  }
}
