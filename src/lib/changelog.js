// src/lib/changelog.js
// 解析 Keep-a-Changelog 格式的 CHANGELOG.md。純函式、無 I/O（讀檔在 server component 做）。

const USER_HEADINGS = ["新增", "變動", "移除"]; // 面向使用者；其餘視為技術段

/**
 * @param {string} md  CHANGELOG.md 全文
 * @returns {{version:string,date:string,summary:string,userSections:{heading:string,items:string[]}[],techSections:{heading:string,items:string[]}[]}[]}
 */
export function parseChangelog(md) {
  const lines = (md || "").split("\n");
  const versions = [];
  let cur = null;
  let curSection = null;

  const pushSection = () => {
    if (!cur || !curSection) return;
    const bucket = USER_HEADINGS.includes(curSection.heading)
      ? cur.userSections
      : cur.techSections;
    bucket.push(curSection);
    curSection = null;
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    // 版本標題：## [0.7] — 2026-05-29  （破折號可能是 — 或 -）
    const vMatch = line.match(/^##\s*\[([^\]]+)\]\s*[—\-–]\s*(.+)$/);
    if (vMatch) {
      pushSection();
      if (cur) versions.push(cur);
      cur = {
        version: vMatch[1].trim(),
        date: vMatch[2].trim(),
        summary: "",
        userSections: [],
        techSections: [],
      };
      continue;
    }
    if (!cur) continue;
    // 區段標題：### 新增
    const sMatch = line.match(/^###\s+(.+)$/);
    if (sMatch) {
      pushSection();
      curSection = { heading: sMatch[1].trim(), items: [] };
      continue;
    }
    // 條列：- xxx（只收一層；巢狀縮排併入上一條）
    const bullet = line.match(/^\s*-\s+(.+)$/);
    if (bullet && curSection) {
      curSection.items.push(bullet[1].trim());
      continue;
    }
    if (bullet && cur && !curSection) {
      // 摘要前的條列（少見）→ 併入 summary
      cur.summary += (cur.summary ? "\n" : "") + bullet[1].trim();
      continue;
    }
    // 其餘非空行、且還在「摘要區」（尚未進任何 ### section）→ 累加為 summary
    if (line && !curSection && !line.startsWith("#")) {
      cur.summary += (cur.summary ? " " : "") + line.trim();
    }
  }
  pushSection();
  if (cur) versions.push(cur);
  return versions;
}
