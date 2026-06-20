// src/lib/notify.js — 伺服器端通知（可抽換 channel）。目前：Discord webhook。
// LINE 後補：屆時在此多接一個 channel（Messaging API push），不動 caller。
// 絕不可在 client import（讀 server env）。
import { buildNotifyPayload } from "./notifyPayload.mjs";
import { fetchWithTimeout } from "./fetchWithTimeout.mjs";

/** 發送通知。回傳是否成功。任何錯誤都吞掉（通知失敗不該擋主流程）。 */
export async function notify(text) {
  const url = process.env.DISCORD_WEBHOOK_URL;
  if (!url) {
    console.warn("notify: 未設定 DISCORD_WEBHOOK_URL，略過通知");
    return false;
  }
  try {
    // allowed_mentions.parse=[] → 內文即使含 @everyone 也不會真的 ping（見 notifyPayload）。
    // fetchWithTimeout：Discord 掛住時不拖垮整個 serverless invocation（5s 後 abort → 回 false）。
    const res = await fetchWithTimeout(
      url,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildNotifyPayload(text)),
      },
      { timeoutMs: 5000 },
    );
    return res.ok;
  } catch (e) {
    console.error("notify 失敗：", e);
    return false;
  }
}
