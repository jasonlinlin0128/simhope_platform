"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { db } from "@/lib/firebase";
import {
  collection,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  query,
  where,
} from "firebase/firestore";
import { createDeveloperAccount } from "@/lib/adminAuth";
import ReviewToolWizard from "@/components/ReviewToolWizard";
import FaqManager from "@/components/FaqManager";
import RequestInbox from "@/components/RequestInbox";
import { BEFORE_BOX, AFTER_BOX, DANGER_BTN } from "@/lib/uiClasses";

export default function AdminDashboard() {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const router = useRouter();

  const [tools, setTools] = useState([]);
  const [painCards, setPainCards] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("tools");
  const [wizardToolId, setWizardToolId] = useState(null);

  // Create developer form state
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newDisplayName, setNewDisplayName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [createSuccess, setCreateSuccess] = useState("");

  useEffect(() => {
    if (!authLoading && isAdmin) {
      fetchAdminData();
    }
  }, [user, isAdmin, authLoading]);

  const fetchAdminData = async () => {
    setLoading(true);
    try {
      const [toolsSnap, painSnap, usersSnap] = await Promise.all([
        getDocs(collection(db, "tools")),
        getDocs(collection(db, "painCards")),
        getDocs(collection(db, "users")),
      ]);
      setTools(toolsSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setPainCards(painSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setUsers(usersSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (error) {
      console.error("Fetch data failed", error);
    }
    setLoading(false);
  };

  const handleCreateDeveloper = async (e) => {
    e.preventDefault();
    if (!newEmail || !newPassword) return;
    setCreating(true);
    setCreateError("");
    setCreateSuccess("");
    try {
      await createDeveloperAccount({
        email: newEmail,
        password: newPassword,
        displayName: newDisplayName || newEmail.split("@")[0],
        createdByUid: user.uid,
      });
      setCreateSuccess(`✅ 帳號建立成功：${newEmail}`);
      setNewEmail("");
      setNewPassword("");
      setNewDisplayName("");
      fetchAdminData();
    } catch (err) {
      const msg =
        {
          "auth/email-already-in-use": "此電子郵件已被使用。",
          "auth/invalid-email": "電子郵件格式不正確。",
          "auth/weak-password": "密碼至少需要 6 個字元。",
        }[err.code] || `建立失敗：${err.message}`;
      setCreateError(msg);
    } finally {
      setCreating(false);
    }
  };

  const handleUpdateUserRole = async (uid, role) => {
    try {
      await updateDoc(doc(db, "users", uid), { role });
      fetchAdminData();
    } catch (err) {
      console.error(err);
      alert("更新失敗，請重新整理後再試");
    }
  };

  const handleRemoveUser = async (u) => {
    if (u.id === user.uid) return; // 不能移除自己
    if (
      !confirm(
        `確定移除 ${u.displayName || u.email || u.id} 的權限？\n該帳號會降回一般同仁（viewer），仍可瀏覽/使用工具。`,
      )
    )
      return;
    try {
      await deleteDoc(doc(db, "users", u.id));
      setUsers((prev) => prev.filter((x) => x.id !== u.id));
    } catch (e) {
      alert("移除失敗：" + (e.code || e.message));
    }
  };

  const handleUpdateToolStatus = async (id, status) => {
    try {
      await updateDoc(doc(db, "tools", id), { status });
      fetchAdminData();
    } catch (error) {
      console.error(error);
      alert("更新失敗，請重新整理後再試");
    }
  };

  const handleDeleteTool = async (id) => {
    if (!confirm("確定刪除此工具？")) return;
    try {
      await deleteDoc(doc(db, "tools", id));
      fetchAdminData();
    } catch (error) {
      console.error(error);
      alert("刪除失敗，請重新整理後再試");
    }
  };

  if (authLoading)
    return <p className="text-center py-20 text-gray-400">載入中，請稍候…</p>;
  if (!user || !isAdmin) {
    router.push("/");
    return null;
  }

  if (loading)
    return <p className="text-center py-20 text-gray-400">載入中，請稍候…</p>;

  return (
    <div className="flex gap-8 px-4 md:px-0">
      <aside className="w-64 flex-shrink-0 border-r border-[var(--color-card-border)] pr-6 min-h-[500px]">
        <h3 className="text-lg font-black text-[var(--color-clay-purple)] mb-6 flex items-center gap-2">
          <span className="text-2xl">🏭</span> Admin 後台
        </h3>
        <nav className="flex flex-col gap-2">
          <button
            onClick={() => setActiveTab("tools")}
            className={`w-full text-left px-4 py-3 rounded-xl font-bold transition-all ${activeTab === "tools" ? "bg-[var(--color-clay-purple)] text-white shadow-md" : "text-[var(--color-text-mid)] hover:bg-gray-100 dark:hover:bg-gray-700"}`}
          >
            🧰 工具管理{" "}
            <span className="float-right bg-white/20 px-2 rounded-full text-xs py-0.5">
              {tools.length}
            </span>
          </button>
          <button
            onClick={() => setActiveTab("pains")}
            className={`w-full text-left px-4 py-3 rounded-xl font-bold transition-all ${activeTab === "pains" ? "bg-[var(--color-clay-purple)] text-white shadow-md" : "text-[var(--color-text-mid)] hover:bg-gray-100 dark:hover:bg-gray-700"}`}
          >
            😤 痛點卡片管理{" "}
            <span className="float-right bg-white/20 px-2 rounded-full text-xs py-0.5">
              {painCards.length}
            </span>
          </button>
          <button
            onClick={() => setActiveTab("users")}
            className={`w-full text-left px-4 py-3 rounded-xl font-bold transition-all ${activeTab === "users" ? "bg-[var(--color-clay-purple)] text-white shadow-md" : "text-[var(--color-text-mid)] hover:bg-gray-100 dark:hover:bg-gray-700"}`}
          >
            👥 帳號管理{" "}
            <span className="float-right bg-white/20 px-2 rounded-full text-xs py-0.5">
              {users.length}
            </span>
          </button>
          <button
            onClick={() => setActiveTab("faqs")}
            className={`w-full text-left px-4 py-3 rounded-xl font-bold transition-all ${activeTab === "faqs" ? "bg-[var(--color-clay-purple)] text-white shadow-md" : "text-[var(--color-text-mid)] hover:bg-gray-100 dark:hover:bg-gray-700"}`}
          >
            ❓ FAQ
          </button>
          <button
            onClick={() => setActiveTab("inbox")}
            className={`w-full text-left px-4 py-3 rounded-xl font-bold transition-all ${activeTab === "inbox" ? "bg-[var(--color-clay-purple)] text-white shadow-md" : "text-[var(--color-text-mid)] hover:bg-gray-100 dark:hover:bg-gray-700"}`}
          >
            📥 申請 / 需求
          </button>
        </nav>
      </aside>

      <main className="flex-1">
        {activeTab === "tools" &&
          (() => {
            const wizardTool = wizardToolId
              ? tools.find((t) => t.id === wizardToolId)
              : null;
            if (wizardTool) {
              return (
                <ReviewToolWizard
                  tool={wizardTool}
                  onClose={() => setWizardToolId(null)}
                  onSaved={() => {
                    setWizardToolId(null);
                    fetchAdminData();
                  }}
                />
              );
            }

            const pendingTools = tools.filter((t) => t.status === "pending");
            const otherTools = tools
              .filter((t) => t.status !== "pending")
              .sort((a, b) => (a.title || "").localeCompare(b.title || ""));

            return (
              <div className="flex flex-col gap-8">
                {/* === 待審核工具區塊（pending） === */}
                <div className="bg-yellow-50/50 dark:bg-yellow-900/10 rounded-[24px] border-2 border-yellow-300 dark:border-yellow-700 p-8 shadow-sm">
                  <h2 className="text-2xl font-black mb-2 text-yellow-800 dark:text-yellow-200 flex items-center gap-2">
                    🟡 待審核工具{" "}
                    <span className="text-base">({pendingTools.length})</span>
                  </h2>
                  <p className="text-sm text-yellow-700 dark:text-yellow-300 mb-6">
                    開發者剛提交、等你補完細節 + 上架的工具。
                  </p>
                  {pendingTools.length === 0 ? (
                    <p className="text-yellow-700/70 dark:text-yellow-300/70 font-bold italic">
                      目前沒有待審核工具 ✨
                    </p>
                  ) : (
                    <div className="flex flex-col gap-3">
                      {pendingTools.map((tool) => (
                        <div
                          key={tool.id}
                          className="flex flex-col md:flex-row justify-between items-center bg-white dark:bg-gray-800 p-5 rounded-2xl border border-yellow-200 dark:border-yellow-700 gap-4 shadow"
                        >
                          <div className="flex items-center gap-4 flex-1 w-full">
                            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-yellow-100 to-yellow-200 flex items-center justify-center text-2xl">
                              {tool.icon || "📦"}
                            </div>
                            <div className="flex-1 min-w-0">
                              <h4 className="font-extrabold text-[var(--color-text-dark)] truncate">
                                {tool.title}
                              </h4>
                              <p className="text-xs text-gray-500 font-bold truncate">
                                {tool.tagline}
                              </p>
                              <p className="text-[0.65rem] text-gray-400 mt-0.5">
                                type: {tool.type || "?"} · url:{" "}
                                {tool.url
                                  ? tool.url.slice(0, 40) + "..."
                                  : "(無)"}
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={() => setWizardToolId(tool.id)}
                            className="px-5 py-3 rounded-xl bg-gradient-to-br from-[var(--color-clay-purple)] to-[var(--color-clay-blue)] text-white font-extrabold shadow hover:-translate-y-0.5 transition whitespace-nowrap"
                          >
                            🔍 進入審核
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* === 已上架的工具區塊 === */}
                <div className="bg-[var(--color-card-bg)] rounded-[24px] shadow-sm border border-[var(--color-card-border)] p-8">
                  <h2 className="text-2xl font-black mb-6 text-[var(--color-text-dark)]">
                    🧰 已上架工具 ({otherTools.length})
                  </h2>
                  <div className="flex flex-col gap-3">
                    {otherTools.map((tool) => (
                      <div
                        key={tool.id}
                        className="flex flex-col md:flex-row justify-between items-center bg-[var(--color-card-bg)]/60 p-4 rounded-2xl border border-[var(--color-card-border)] gap-3"
                      >
                        <div className="flex items-center gap-3 flex-1 w-full">
                          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-100 to-blue-200 flex items-center justify-center text-xl">
                            {tool.icon || "📦"}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="font-extrabold text-sm text-[var(--color-text-dark)] truncate">
                              {tool.title}
                            </h4>
                            <p className="text-[0.7rem] text-gray-500 font-bold truncate">
                              {tool.tagline}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 w-full md:w-auto flex-wrap">
                          <select
                            value={tool.status}
                            onChange={(e) =>
                              handleUpdateToolStatus(tool.id, e.target.value)
                            }
                            className="bg-[var(--color-card-bg)] text-[var(--color-text-dark)] border border-[var(--color-card-border)] text-xs font-bold p-2 rounded-lg outline-none focus:border-[var(--color-clay-purple)]"
                          >
                            <option value="pending">🟡 待驗收</option>
                            <option value="new">🌟 新上線</option>
                            <option value="live">🟢 使用中</option>
                            <option value="beta">🟠 測試中</option>
                            <option value="dev">🔨 開發中</option>
                            <option value="terminated">⚫ 已終止</option>
                          </select>
                          <button
                            onClick={() => setWizardToolId(tool.id)}
                            className="px-3 py-1.5 bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 hover:bg-purple-100 dark:hover:bg-purple-900/40 rounded-lg font-bold text-xs border border-purple-200 dark:border-purple-800"
                          >
                            🔍 wizard
                          </button>
                          <a
                            href={`/tool/${tool.id}`}
                            className="px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40 rounded-lg font-bold text-xs border border-blue-200 dark:border-blue-800"
                          >
                            ✏️ 編輯
                          </a>
                          <button
                            onClick={() => handleDeleteTool(tool.id)}
                            className={`${DANGER_BTN} px-3 py-1.5 rounded-lg font-bold text-xs`}
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    ))}
                    {otherTools.length === 0 && (
                      <p className="text-gray-400 font-bold">沒有已上架工具</p>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}

        {activeTab === "pains" && (
          <div className="bg-[var(--color-card-bg)] rounded-[24px] shadow-sm border border-[var(--color-card-border)] p-8">
            <h2 className="text-2xl font-black mb-6 text-[var(--color-text-dark)]">
              😤 痛點卡片管理
            </h2>

            <div className="flex flex-col gap-4">
              {painCards.map((card) => (
                <div
                  key={card.id}
                  className="bg-[var(--color-card-bg)]/60 p-5 rounded-2xl border border-[var(--color-card-border)] flex flex-col gap-2"
                >
                  <div
                    className={`${BEFORE_BOX} text-sm font-bold p-2 rounded relative`}
                  >
                    😓 {card.before}
                  </div>
                  <div className={`${AFTER_BOX} text-sm font-bold p-2 rounded`}>
                    ✅ {card.after}
                  </div>
                  <div className="flex justify-between items-center mt-2">
                    <div className="text-xs font-bold text-gray-500 dark:text-gray-400 bg-gray-200/50 dark:bg-gray-700/50 px-2 py-1 rounded">
                      狀態:{" "}
                      {card.approval === "approved" ? "🟢 已核准" : "🟡 待審核"}
                    </div>
                  </div>
                </div>
              ))}
              {painCards.length === 0 && (
                <p className="text-gray-400 font-bold">目前沒有痛點資料</p>
              )}
            </div>
          </div>
        )}
        {activeTab === "users" && (
          <div className="flex flex-col gap-6">
            {/* Create developer account */}
            <div className="bg-[var(--color-card-bg)] rounded-[24px] shadow-sm border border-[var(--color-card-border)] p-8">
              <h2 className="text-2xl font-black mb-6 text-[var(--color-text-dark)]">
                ➕ 新增開發者帳號
              </h2>
              <form
                onSubmit={handleCreateDeveloper}
                className="flex flex-col gap-4 max-w-md"
              >
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-extrabold text-[var(--color-text-mid)] uppercase tracking-wide">
                    顯示名稱（選填）
                  </label>
                  <input
                    type="text"
                    value={newDisplayName}
                    onChange={(e) => setNewDisplayName(e.target.value)}
                    placeholder="例：Jason Lin"
                    className="px-4 py-2.5 rounded-xl border border-[var(--color-card-border)] bg-[var(--color-card-bg)] text-[var(--color-text-dark)] font-semibold text-sm outline-none focus:border-[var(--color-clay-purple)] transition-colors"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-extrabold text-[var(--color-text-mid)] uppercase tracking-wide">
                    電子郵件 *
                  </label>
                  <input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="name@simhope.com.tw"
                    required
                    className="px-4 py-2.5 rounded-xl border border-[var(--color-card-border)] bg-[var(--color-card-bg)] text-[var(--color-text-dark)] font-semibold text-sm outline-none focus:border-[var(--color-clay-purple)] transition-colors"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-extrabold text-[var(--color-text-mid)] uppercase tracking-wide">
                    初始密碼 *（至少 6 碼）
                  </label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    minLength={6}
                    className="px-4 py-2.5 rounded-xl border border-[var(--color-card-border)] bg-[var(--color-card-bg)] text-[var(--color-text-dark)] font-semibold text-sm outline-none focus:border-[var(--color-clay-purple)] transition-colors"
                  />
                </div>
                {createError && (
                  <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl px-4 py-2.5 text-sm font-bold text-red-600 dark:text-red-400">
                    {createError}
                  </div>
                )}
                {createSuccess && (
                  <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl px-4 py-2.5 text-sm font-bold text-green-600 dark:text-green-400">
                    {createSuccess}
                  </div>
                )}
                <button
                  type="submit"
                  disabled={creating}
                  className="self-start px-6 py-2.5 rounded-xl bg-gradient-to-br from-[var(--color-clay-purple)] to-[var(--color-clay-blue)] text-white font-extrabold text-sm shadow-md hover:-translate-y-0.5 hover:shadow-lg transition-all disabled:opacity-60 disabled:translate-y-0"
                >
                  {creating ? "建立中..." : "➕ 建立帳號"}
                </button>
              </form>
            </div>

            {/* User list */}
            <div className="bg-[var(--color-card-bg)] rounded-[24px] shadow-sm border border-[var(--color-card-border)] p-8">
              <h2 className="text-2xl font-black mb-6 text-[var(--color-text-dark)]">
                👥 所有帳號
              </h2>
              <div className="flex flex-col gap-3">
                {users.map((u) => (
                  <div
                    key={u.id}
                    className="flex flex-col md:flex-row justify-between items-center bg-[var(--color-card-bg)]/60 p-4 rounded-2xl border border-[var(--color-card-border)] gap-3"
                  >
                    <div className="flex items-center gap-3 flex-1 w-full">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-400 to-blue-400 flex items-center justify-center text-white font-black text-sm flex-shrink-0">
                        {(u.displayName || u.email || "?")
                          .charAt(0)
                          .toUpperCase()}
                      </div>
                      <div>
                        <div className="font-extrabold text-sm text-[var(--color-text-dark)]">
                          {u.displayName || "(未設定名稱)"}
                        </div>
                        <div className="text-xs text-gray-500">{u.email}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 w-full md:w-auto">
                      <select
                        value={u.role || "developer"}
                        onChange={(e) =>
                          handleUpdateUserRole(u.id, e.target.value)
                        }
                        disabled={u.id === user.uid}
                        className="bg-[var(--color-card-bg)] text-[var(--color-text-dark)] border border-[var(--color-card-border)] text-sm font-bold p-2 rounded-lg outline-none focus:border-[var(--color-clay-purple)] disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <option value="developer">👨‍💻 開發者</option>
                        <option value="admin">🔑 管理員</option>
                      </select>
                      {u.id === user.uid && (
                        <span className="text-xs text-gray-400 font-bold">
                          (目前帳號)
                        </span>
                      )}
                      <button
                        onClick={() => handleRemoveUser(u)}
                        disabled={u.id === user.uid}
                        className="px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm font-bold hover:bg-red-100 dark:hover:bg-red-900/40 transition disabled:opacity-40 disabled:cursor-not-allowed"
                        title={
                          u.id === user.uid ? "不能移除自己" : "移除此帳號權限"
                        }
                      >
                        🗑 移除
                      </button>
                    </div>
                  </div>
                ))}
                {users.length === 0 && (
                  <p className="text-gray-400 font-bold">目前沒有開發者帳號</p>
                )}
              </div>
            </div>
          </div>
        )}
        {activeTab === "faqs" && (
          <div className="bg-[var(--color-card-bg)] rounded-[24px] shadow-sm border border-[var(--color-card-border)] p-8">
            <FaqManager />
          </div>
        )}
        {activeTab === "inbox" && (
          <div className="bg-[var(--color-card-bg)] rounded-[24px] shadow-sm border border-[var(--color-card-border)] p-8">
            <RequestInbox />
          </div>
        )}
      </main>
    </div>
  );
}
