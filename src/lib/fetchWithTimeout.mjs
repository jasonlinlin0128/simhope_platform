/**
 * fetch + AbortController 逾時保護。逾時或網路錯誤會 throw（呼叫端自行 try/catch）。
 * 給 API route 抓外部資源（GitHub README、使用者提供的來源 URL）用，避免上游掛住
 * 而拖垮整個 serverless function（callGemini 已有同款保護，這裡補上其餘 fetch）。
 * @param {string} url
 * @param {object} [options]   傳給 fetch 的 options（會注入/覆寫 signal）
 * @param {object} [cfg]
 * @param {number} [cfg.timeoutMs=8000]
 * @param {Function} [cfg.fetchImpl=fetch]  注入點，方便測試
 * @returns {Promise<Response>}
 */
export async function fetchWithTimeout(
  url,
  options = {},
  { timeoutMs = 8000, fetchImpl = fetch } = {},
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
