// src/lib/article.js
// 把 desc markdown 依 ## 標題切成 { lead, sections }。純函式、可 node 斷言。
// 限制（YAGNI）：不處理 code fence 內的 ##（desc 罕見含 code，naive 逐行掃即可）。

/**
 * @param {string} md
 * @returns {{ lead: string, sections: Array<{heading:string, body:string}> }}
 */
export function splitMarkdownSections(md) {
  const src = String(md || "").replace(/\r\n/g, "\n");
  const lines = src.split("\n");
  const lead = [];
  const sections = [];
  let cur = null; // { heading, bodyLines: [] }
  for (const line of lines) {
    // 精確錨定：行首兩個井號 + 空白 + 至少一個非空字元；### / #### 因 (?!#) 被排除
    const m = /^##(?!#)\s+(.+?)\s*$/.exec(line);
    if (m) {
      if (cur)
        sections.push({
          heading: cur.heading,
          body: cur.bodyLines.join("\n").trim(),
        });
      cur = { heading: m[1].trim(), bodyLines: [] };
    } else if (cur) {
      cur.bodyLines.push(line);
    } else {
      lead.push(line);
    }
  }
  if (cur)
    sections.push({
      heading: cur.heading,
      body: cur.bodyLines.join("\n").trim(),
    });
  return { lead: lead.join("\n").trim(), sections };
}
