import { HttpError } from "./httpError.mjs";

const GEMINI_MODEL = "gemini-2.5-flash";
const ENDPOINT = (model) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

/**
 * 單一 Gemini 呼叫點。集中 model 名、x-goog-api-key header、timeout、JSON 解析、錯誤格式。
 * @param {object} o
 * @param {string}  o.prompt
 * @param {boolean} [o.json=false]   true → responseMimeType json + 回 parse 過物件；false → 回 trimmed 字串
 * @param {number}  [o.temperature=0.7]
 * @param {number}  [o.maxOutputTokens]
 * @param {number}  [o.timeoutMs=20000]
 * @param {string}  [o.model=GEMINI_MODEL]
 * @param {Function}[o.fetchImpl=fetch]
 * @param {string}  [o.apiKey=process.env.GEMINI_API_KEY]
 * @returns {Promise<object|string>}
 * @throws  {HttpError} 500 未設 key / 502 上游失敗或壞 JSON / 504 timeout
 */
export async function callGemini({
  prompt,
  json = false,
  temperature = 0.7,
  maxOutputTokens,
  timeoutMs = 20000,
  model = GEMINI_MODEL,
  fetchImpl = fetch,
  apiKey = process.env.GEMINI_API_KEY,
} = {}) {
  if (!apiKey) throw new HttpError(500, "伺服器未設定 Gemini API Key");

  const generationConfig = { temperature };
  if (json) generationConfig.responseMimeType = "application/json";
  if (maxOutputTokens) generationConfig.maxOutputTokens = maxOutputTokens;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetchImpl(ENDPOINT(model), {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig,
      }),
      signal: controller.signal,
    });
  } catch (e) {
    if (e?.name === "AbortError")
      throw new HttpError(504, "AI 服務逾時，請稍後再試");
    throw e;
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const detail = (await res.text().catch(() => ""))
      .replace(/AIza[0-9A-Za-z_-]{35}/g, "AIza***")
      .slice(0, 500);
    console.error(`[callGemini] Gemini ${res.status}: ${detail}`);
    throw new HttpError(502, `AI 服務暫時無法使用 (${res.status})`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  if (!json) return text.trim();

  const raw = (text || "{}").replace(/```json\n?|\n?```/g, "").trim();
  try {
    return JSON.parse(raw);
  } catch {
    throw new HttpError(502, "AI 回傳格式無法解析，請重試");
  }
}
