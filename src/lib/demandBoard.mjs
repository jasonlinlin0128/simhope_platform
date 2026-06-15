// src/lib/demandBoard.mjs
// 需求看板的純邏輯：組 Gemini 分群 prompt + 清理回傳。無 firebase/browser 依賴，可 node:test。

/**
 * 組「把待處理需求分群成主題」的 Gemini prompt。
 * @param {string[]} messages  待處理需求文字
 * @returns {string}
 */
export function buildDemandPrompt(messages) {
  const list = (messages || []).map((m, i) => `${i + 1}. ${m}`).join("\n");
  return `你是 SimHope 內部平台的需求分析助理。下面是同仁提出的「待處理需求」清單，請歸納成幾個主題（最多 6 個）。

規則：
- 只根據下面提供的需求內容歸納，不可編造沒提到的需求。
- 每個主題給：theme（主題短名）、count（屬於此主題的需求數，整數）、examples（1-2 句代表性原文）。
- 固定輸出純 JSON（不要 markdown code fence），schema：
{ "themes": [ { "theme": "主題名", "count": 3, "examples": ["原文1", "原文2"] } ] }

待處理需求：
${list}`;
}

/**
 * 清理 Gemini 回傳的主題：保留合法項、count 轉數字、examples 截 ≤2、themes 截 limit。
 * 壞輸入安全回 []。
 * @param {{themes?:unknown}|null|undefined} geminiResult
 * @param {number} [limit=6]
 * @returns {Array<{theme:string,count:number,examples:string[]}>}
 */
export function normalizeThemes(geminiResult, limit = 6) {
  const raw = Array.isArray(geminiResult?.themes) ? geminiResult.themes : [];
  const out = [];
  for (const t of raw) {
    if (out.length >= limit) break;
    if (!t || typeof t !== "object") continue;
    const theme = typeof t.theme === "string" ? t.theme.trim() : "";
    if (!theme) continue;
    const count = Number.isFinite(t.count) ? t.count : Number(t.count) || 0;
    const examples = Array.isArray(t.examples)
      ? t.examples.filter((e) => typeof e === "string" && e.trim()).slice(0, 2)
      : [];
    out.push({ theme, count, examples });
  }
  return out;
}
