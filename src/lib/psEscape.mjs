// PowerShell 單引號字串字面跳脫。
// 在 PowerShell 的 '...' 字面字串裡，唯一的特殊字元是單引號本身，
// 跳脫方式是把它加倍（'' → 一個字面 '）。反斜線、$、` 等在單引號內都是字面。
// 用途：把可能含特殊字元（如 CJK 資料夾名、含 ' 的 slug）的字串安全嵌進
// 經 -EncodedCommand 執行的 PowerShell 腳本，避免命令注入。

/**
 * 把任意值包成安全的 PowerShell 單引號字串字面。
 * @param {unknown} value
 * @returns {string}  例如 psQuote("a'b") === "'a''b'"
 */
export function psQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}
