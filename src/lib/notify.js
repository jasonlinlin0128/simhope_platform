// src/lib/notify.js — 伺服器端通知（可抽換 channel）。目前：Discord webhook。
// LINE 後補：屆時在此多接一個 channel（Messaging API push），不動 caller。
// 絕不可在 client import（讀 server env）。

/** 發送通知。回傳是否成功。任何錯誤都吞掉（通知失敗不該擋主流程）。 */
export async function notify(text) {
  const url = process.env.DISCORD_WEBHOOK_URL;
  if (!url) {
    console.warn("notify: 未設定 DISCORD_WEBHOOK_URL，略過通知");
    return false;
  }
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: text }),
    });
    return res.ok;
  } catch (e) {
    console.error("notify 失敗：", e);
    return false;
  }
}
