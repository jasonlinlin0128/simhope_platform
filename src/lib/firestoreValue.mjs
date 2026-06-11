// src/lib/firestoreValue.mjs
// Firestore REST API 回傳的是 typed value（{stringValue}/{integerValue}/...）。
// 這裡轉成一般 JS 值。純函式、無 I/O，node:test 可測。

/**
 * @param {object} v  Firestore REST typed value，例如 { stringValue: "x" }
 * @returns {*} 對應的 JS 值（未知型別 → undefined）
 */
export function fromFirestoreValue(v) {
  if (v == null) return undefined;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue); // REST 以字串給整數
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("nullValue" in v) return null;
  if ("timestampValue" in v) return v.timestampValue; // 保留 ISO 字串
  if ("arrayValue" in v)
    return (v.arrayValue.values || []).map(fromFirestoreValue);
  if ("mapValue" in v) return fromFirestoreFields(v.mapValue.fields || {});
  return undefined;
}

/**
 * REST 的 fields 物件（{ key: typedValue }）→ 一般物件。
 * @param {object} [fields]
 * @returns {object}
 */
export function fromFirestoreFields(fields = {}) {
  const out = {};
  for (const [k, v] of Object.entries(fields)) out[k] = fromFirestoreValue(v);
  return out;
}

/**
 * REST document（有 name + fields）→ { id, ...fields }。id = name 路徑末段。
 * @param {{name?: string, fields?: object}} doc
 * @returns {object}
 */
export function docToObject(doc) {
  const id = doc.name ? doc.name.split("/").pop() : undefined;
  return { id, ...fromFirestoreFields(doc.fields || {}) };
}
