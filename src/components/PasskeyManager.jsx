"use client";

import { useState, useEffect, useCallback } from "react";
import {
  passkeySupported,
  registerPasskey,
  listPasskeys,
  deletePasskey,
} from "@/lib/passkey";
import { DANGER_BTN } from "@/lib/uiClasses";

/**
 * passkey 管理區（dashboard「安全設定」用）：
 * 註冊這台裝置的 Face ID / 指紋、列出已註冊裝置、刪除。
 */
export default function PasskeyManager() {
  const [supported, setSupported] = useState(false);
  const [passkeys, setPasskeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const refresh = useCallback(async () => {
    try {
      setPasskeys(await listPasskeys());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const ok = passkeySupported();
    setSupported(ok);
    if (ok) refresh();
    else setLoading(false);
  }, [refresh]);

  const handleRegister = async () => {
    setMsg("");
    const deviceName = window.prompt(
      "幫這台裝置取個名字（例：我的 iPhone、公司筆電）",
      "我的裝置",
    );
    if (deviceName === null) return; // 取消
    setBusy(true);
    try {
      await registerPasskey(deviceName || "未命名裝置");
      setMsg("✅ 已註冊！下次登入可直接用 Face ID / 指紋。");
      await refresh();
    } catch (e) {
      setMsg(
        "註冊失敗：" +
          (e?.name === "NotAllowedError"
            ? "已取消或逾時"
            : e?.message || "未知錯誤"),
      );
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id) => {
    if (
      !window.confirm(
        "確定移除這個 passkey？移除後該裝置不能再用 Face ID / 指紋登入。",
      )
    )
      return;
    setBusy(true);
    setMsg("");
    try {
      await deletePasskey(id);
      await refresh();
    } catch (e) {
      setMsg("移除失敗：" + (e?.message || "未知錯誤"));
    } finally {
      setBusy(false);
    }
  };

  if (!supported) {
    return (
      <div className="bg-[var(--color-card-bg)] p-6 rounded-[24px] shadow-sm border border-[var(--color-card-border)]">
        <h3 className="font-extrabold text-lg mb-1 flex items-center gap-2">
          🔐 Face ID / 指紋登入
        </h3>
        <p className="text-sm text-[var(--color-text-mid)]">
          這個瀏覽器或裝置不支援 passkey，請改用 Google 或密碼登入。
        </p>
      </div>
    );
  }

  return (
    <div className="bg-[var(--color-card-bg)] p-6 rounded-[24px] shadow-sm border border-[var(--color-card-border)]">
      <h3 className="font-extrabold text-lg mb-1 flex items-center gap-2">
        🔐 Face ID / 指紋登入
      </h3>
      <p className="text-sm text-[var(--color-text-mid)] mb-4">
        在這台裝置註冊後，下次登入點「用 Face ID / 指紋登入」就能免密碼進來。
      </p>

      <button
        onClick={handleRegister}
        disabled={busy}
        className="px-5 py-2.5 rounded-xl bg-gradient-to-br from-[var(--color-clay-purple)] to-[var(--color-clay-blue)] text-white font-extrabold text-sm shadow hover:-translate-y-0.5 transition disabled:opacity-60"
      >
        {busy ? "處理中…" : "➕ 註冊這台裝置"}
      </button>

      {msg && (
        <p className="text-sm font-bold mt-3 text-[var(--color-text-dark)]">
          {msg}
        </p>
      )}

      <div className="mt-5">
        <h4 className="text-xs font-extrabold text-[var(--color-text-mid)] uppercase tracking-wider mb-2">
          已註冊的裝置（{passkeys.length}）
        </h4>
        {loading ? (
          <p className="text-sm text-gray-400">載入中…</p>
        ) : passkeys.length === 0 ? (
          <p className="text-sm text-gray-400 italic">尚未註冊任何裝置</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {passkeys.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-3 bg-gray-50 dark:bg-gray-800 rounded-xl px-4 py-2.5 border border-gray-100 dark:border-gray-700"
              >
                <div className="min-w-0">
                  <div className="font-bold text-sm text-[var(--color-text-dark)] truncate">
                    🔑 {p.deviceName}
                  </div>
                  <div className="text-xs text-gray-400">
                    {p.lastUsedAt
                      ? `最後使用：${new Date(p.lastUsedAt).toLocaleDateString()}`
                      : "尚未使用"}
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(p.id)}
                  disabled={busy}
                  className={`${DANGER_BTN} px-3 py-1.5 rounded-lg font-bold text-xs disabled:opacity-50 whitespace-nowrap`}
                >
                  移除
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
