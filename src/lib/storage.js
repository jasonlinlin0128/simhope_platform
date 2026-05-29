import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "./firebase";

/**
 * Feature flag — Firebase Storage 上傳功能總開關。
 *
 * ⚠️ 目前 false：Firebase Console 還沒啟用 Storage。
 * 啟用步驟（之後做）：
 *   1. Firebase Console → Build → Storage → 開始使用（選地區）
 *   2. `firebase deploy --only storage`（部署 storage.rules）
 *   3. 把這個常數改成 true
 * 改 true 後，block editor 的圖片/語音、wizard 的下載檔欄位會出現「上傳檔案」按鈕。
 * false 時平台行為不變 — 一律貼 URL。
 */
export const STORAGE_ENABLED = false;

/**
 * 上傳檔案到 Firebase Storage 的 tool-files/ 底下，回傳可公開存取的下載 URL。
 * @param {File} file
 * @param {string} pathPrefix  例：'images' | 'audio' | 'downloads' | 'docs'
 * @returns {Promise<string>}  下載 URL
 */
export async function uploadToolFile(file, pathPrefix = "misc") {
  if (!STORAGE_ENABLED) {
    throw new Error(
      "Storage 上傳尚未啟用（請先在 Firebase Console 啟用 Storage）",
    );
  }
  // 檔名去掉危險字元 + 加時間前綴避免覆蓋（時間用 performance 取代 Date 以免 SSR 問題；client 端有 Date）
  const safeName = file.name.replace(/[^\w.\-]/g, "_");
  const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const objectRef = ref(
    storage,
    `tool-files/${pathPrefix}/${stamp}_${safeName}`,
  );
  await uploadBytes(objectRef, file);
  return await getDownloadURL(objectRef);
}
