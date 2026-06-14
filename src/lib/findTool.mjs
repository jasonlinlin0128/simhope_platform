// src/lib/findTool.mjs
// 找工具助理的純邏輯：組 Gemini prompt + 驗證回傳。無 firebase/browser 依賴，可 node:test。

/**
 * 組「從目錄挑相符工具」的 Gemini prompt。
 * @param {string} query  使用者需求
 * @param {Array<{id:string,title:string,tagline?:string,scenarios?:string[],tags?:string[]}>} tools 精簡工具清單
 * @returns {string}
 */
export function buildFindToolPrompt(query, tools) {
  const list = (tools || [])
    .map((t) => {
      const scen = Array.isArray(t.scenarios) ? t.scenarios.join("、") : "";
      const tags = Array.isArray(t.tags) ? t.tags.join("、") : "";
      return `- id:${t.id} | ${t.title}：${t.tagline || ""}${scen ? `（場景：${scen}）` : ""}${tags ? `（關鍵字：${tags}）` : ""}`;
    })
    .join("\n");
  return `你是 SimHope 內部工具平台的「找工具助理」。使用者描述一個工作需求，請從下面「工具清單」挑出最相符的（最多 4 個）。

規則：
- 只能挑清單裡真實存在的工具，只回它們的 id；絕對不可編造不存在的 id。
- 依相符程度由高到低排序；沒有夠相符的就回空陣列。
- reply 用一句繁體中文：有結果時像「這幾個應該能幫到你」；沒結果時誠實說「目前沒有現成的工具完全符合」。
- 固定輸出純 JSON（不要 markdown code fence），schema：
{ "toolIds": ["id1", "id2"], "reply": "一句話" }

工具清單：
${list}

使用者需求：${query}`;
}

/**
 * 驗證 Gemini 回傳：只留「確實存在於 catalog」的 id、去重、截上限，帶出 reply。
 * 任何壞輸入都安全退化（tools=[]、reply 給通用字串）。
 * @param {{toolIds?:unknown, reply?:unknown}} geminiResult
 * @param {object[]} catalog  完整工具物件（需有 id）
 * @param {number} [limit=4]
 * @returns {{reply:string, tools:object[]}}
 */
export function validateToolMatches(geminiResult, catalog = [], limit = 4) {
  const byId = new Map((catalog || []).map((t) => [t.id, t]));
  const rawIds = Array.isArray(geminiResult?.toolIds) ? geminiResult.toolIds : [];
  const seen = new Set();
  const tools = [];
  for (const id of rawIds) {
    if (tools.length >= limit) break;
    if (byId.has(id) && !seen.has(id)) {
      seen.add(id);
      tools.push(byId.get(id));
    }
  }
  const rawReply = geminiResult?.reply;
  const reply =
    typeof rawReply === "string" && rawReply.trim()
      ? rawReply.trim()
      : tools.length
        ? "這幾個應該能幫到你："
        : "目前沒有現成的工具完全符合，要不要把需求告訴經企室？";
  return { reply, tools };
}
