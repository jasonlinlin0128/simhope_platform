// src/lib/taxonomy.js
// 單一真相來源：category（給使用者看的目錄分類）+ type（技術交付格式）的顯示與行為。
// 加新 type/category 只改這裡。各 UI（ToolCard / 詳情頁 / dashboard / wizard / hub）一律 import。

// ─── 5 大類別（目錄分類；決定在 /hub 哪個 tab） ───
export const CATEGORIES = {
  platform: {
    key: "platform",
    label: "平臺",
    emoji: "🏢",
    desc: "大型多功能系統 / 應用",
    defaultType: "webapp",
  },
  tool: {
    key: "tool",
    label: "工具",
    emoji: "🧰",
    desc: "單點 AI 小工具，即開即用",
    defaultType: "webapp",
  },
  project: {
    key: "project",
    label: "專案",
    emoji: "📁",
    desc: "單一時限性的案子，展示進度與成果",
    defaultType: "webapp",
  },
  mcp: {
    key: "mcp",
    label: "MCP",
    emoji: "🔌",
    desc: "給 AI agent 串接的連接器",
    defaultType: "mcp",
  },
  skill: {
    key: "skill",
    label: "Skill",
    emoji: "🧠",
    desc: "Agent skill，下載裝到 ~/.claude/skills/",
    defaultType: "skill",
  },
};
export const CATEGORY_ORDER = ["platform", "tool", "project", "mcp", "skill"];

// ─── 7 種交付格式（決定 badge / CTA / 安裝 tab / typeData 欄位） ───
// badgeCls / label 逐字沿用原 ToolCard.TYPE_BADGES，避免視覺迴歸。
export const TYPES = {
  webapp: {
    key: "webapp",
    label: "🌐 網頁應用",
    badgeCls:
      "bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-700",
  },
  download: {
    key: "download",
    label: "⬇️ 軟體下載",
    badgeCls:
      "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-700",
  },
  doc: {
    key: "doc",
    label: "📄 文件 / 表單",
    badgeCls:
      "bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-700",
  },
  mcp: {
    key: "mcp",
    label: "🔌 AI 連接器",
    badgeCls:
      "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-700",
  },
  api: {
    key: "api",
    label: "🧩 API / SDK",
    badgeCls:
      "bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-700",
  },
  embedded: {
    key: "embedded",
    label: "📍 場域工具",
    badgeCls:
      "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-700",
  },
  // showcase 已廢除，但 Firestore 可能仍有舊資料（migration 前）。保留過渡定義，
  // 沿用原 ToolCard.TYPE_BADGES.showcase，避免 refactor 後視覺迴歸。migration 後可刪。
  showcase: {
    key: "showcase",
    label: "📺 展示",
    badgeCls:
      "bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-600",
  },
  skill: {
    key: "skill",
    label: "🧠 Agent Skill",
    badgeCls:
      "bg-fuchsia-50 dark:bg-fuchsia-900/30 text-fuchsia-700 dark:text-fuchsia-300 border-fuchsia-200 dark:border-fuchsia-700",
  },
};

export function typeBadge(type) {
  return TYPES[type] || TYPES.webapp;
}

// ─── 卡片「一鍵動作」CTA（沿用原 ToolCard.getCTA 邏輯，多加 skill） ───
// 回傳 { label, href, cls, disabled, external? }
export function getCTA(tool) {
  const { type = "webapp", status, url, id, typeData = {}, versions } = tool;
  const latestFileUrl =
    Array.isArray(versions) && versions.length
      ? versions[versions.length - 1].fileUrl
      : undefined;

  if (status === "terminated") {
    return {
      label: "⛔ 已終止維護",
      href: null,
      cls: "bg-red-100 text-red-600 cursor-not-allowed",
      disabled: true,
    };
  }
  if (status === "dev" || status === "pending") {
    return {
      label: "🚧 開發中，敬請期待",
      href: `/tool/${id}`,
      cls: "bg-gray-200 text-gray-500 hover:bg-gray-300",
      disabled: false,
    };
  }
  if (type === "embedded") {
    return {
      label: "📍 查看部署資訊 →",
      href: `/tool/${id}`,
      cls: "bg-indigo-500 text-white hover:bg-indigo-600",
      disabled: false,
    };
  }
  // skill：下載 zip（典型 href 來自 typeData.skillZipUrl）
  if (type === "skill") {
    const zip = latestFileUrl || typeData.skillZipUrl || url;
    if (!zip) {
      return {
        label: "👀 看詳情 →",
        href: `/tool/${id}`,
        cls: "bg-gray-300 text-gray-700 hover:bg-gray-400",
        disabled: false,
      };
    }
    return {
      label: "⬇️ 下載 SKILL →",
      href: zip,
      cls: "bg-fuchsia-500 text-white hover:bg-fuchsia-600",
      disabled: false,
      external: true,
    };
  }

  const ctaByType = {
    webapp: {
      label: "🌐 馬上打開 →",
      cls: "bg-gradient-to-r from-purple-500 to-blue-500 text-white hover:opacity-90",
    },
    download: {
      label: "⬇️ 下載安裝檔 →",
      cls: "bg-blue-500 text-white hover:bg-blue-600",
    },
    doc: {
      label: "⬇️ 下載 →",
      cls: "bg-orange-500 text-white hover:bg-orange-600",
    },
    mcp: {
      label: "📦 安裝到 Claude / Cursor →",
      cls: "bg-emerald-500 text-white hover:bg-emerald-600",
    },
    api: {
      label: "🔗 看 API 文件 →",
      cls: "bg-amber-500 text-white hover:bg-amber-600",
    },
    showcase: {
      label: "👀 看詳情 →",
      cls: "bg-gray-500 text-white hover:bg-gray-600",
    },
  };
  const base = ctaByType[type] || ctaByType.webapp;

  const dlUrl = latestFileUrl || url;
  if (!dlUrl) {
    return {
      label: "👀 看詳情 →",
      href: `/tool/${id}`,
      cls: "bg-gray-300 text-gray-700 hover:bg-gray-400",
      disabled: false,
    };
  }
  return {
    ...base,
    href: dlUrl,
    external: ["webapp", "download", "doc", "api"].includes(type),
    disabled: false,
  };
}

// ─── 詳情頁「一鍵動作」（sidebar / quick tab 用，沿用原 TYPE_ACTION + skill） ───
export const TYPE_ACTION = {
  webapp: {
    label: "🌐 前往網頁工具",
    cls: "text-white bg-gradient-to-r from-[var(--color-clay-purple)] to-[var(--color-clay-blue)]",
  },
  download: {
    label: "⬇️ 下載安裝檔",
    cls: "text-white bg-blue-500 hover:bg-blue-600",
  },
  doc: {
    label: "⬇️ 下載文件",
    cls: "text-white bg-orange-500 hover:bg-orange-600",
  },
  mcp: {
    label: "📦 安裝到 Claude/Cursor",
    cls: "text-white bg-emerald-500 hover:bg-emerald-600",
  },
  api: {
    label: "🔗 看 API 文件",
    cls: "text-white bg-amber-500 hover:bg-amber-600",
  },
  skill: {
    label: "⬇️ 下載 SKILL (.zip)",
    cls: "text-white bg-fuchsia-500 hover:bg-fuchsia-600",
  },
};

// ─── 詳情頁 tab 組成（依 type）。沿用原 DetailTabs 規則，skill = quick + detail ───
export function getTabsForType(type) {
  const tabs = [];
  if (type === "embedded") tabs.push({ key: "deploy", label: "📍 部署資訊" });
  if (["download", "doc", "mcp", "skill"].includes(type))
    tabs.push({ key: "quick", label: "🚀 快速安裝" });
  if (["mcp", "api"].includes(type))
    tabs.push({ key: "advanced", label: "🧰 進階設定" });
  tabs.push({ key: "detail", label: "📖 詳細說明" });
  return tabs;
}

// 詳情頁預設開哪個 tab
export function defaultTabForType(type) {
  if (type === "embedded") return "deploy";
  if (["download", "doc", "mcp", "skill"].includes(type)) return "quick";
  return "detail";
}

// ─── 各 type 在 wizard 要編輯的 typeData 欄位（資料字典） ───
// ⚠️ Phase 1：此常數「只定義、不消費」— 當作 wizard 欄位的單一文件來源。
//    Phase 1 的 TypeDataEditor 仍手刻各 type 的 JSX 分支（零遷移風險）；
//    Phase 2 才把 TypeDataEditor 改成迴圈讀此常數動態渲染。現在別在 Task 5 用它。
// 形狀：{ key, label, kind: 'text'|'textarea'|'select'|'upload', placeholder?, options?, uploadPrefix? }
export const TYPE_DATA_FIELDS = {
  webapp: [],
  download: [
    {
      key: "fileUrl",
      label: "fileUrl（檔案下載連結）",
      kind: "upload",
      uploadPrefix: "downloads",
    },
    {
      key: "platform",
      label: "platform",
      kind: "select",
      options: ["", "windows", "mac", "linux", "crossplatform"],
    },
    { key: "version", label: "version", kind: "text", placeholder: "v1.2.0" },
    {
      key: "fileName",
      label: "fileName",
      kind: "text",
      placeholder: "installer.exe",
    },
  ],
  doc: [
    { key: "fileUrl", label: "fileUrl", kind: "upload", uploadPrefix: "docs" },
    {
      key: "fileType",
      label: "fileType",
      kind: "select",
      options: ["", "pdf", "docx", "xlsx", "zip", "other"],
    },
    { key: "version", label: "version", kind: "text", placeholder: "v2026.05" },
    {
      key: "fileName",
      label: "fileName",
      kind: "text",
      placeholder: "表單名.docx",
    },
  ],
  mcp: [
    {
      key: "mcpbUrl",
      label: "mcpbUrl (.mcpb 一鍵安裝包)",
      kind: "text",
      placeholder: "https://.../x.mcpb",
    },
    {
      key: "npmPackage",
      label: "npmPackage",
      kind: "text",
      placeholder: "@simhope/x-mcp",
    },
    {
      key: "repoUrl",
      label: "repoUrl",
      kind: "text",
      placeholder: "https://github.com/...",
    },
    { key: "configSnippet", label: "configSnippet (JSON)", kind: "textarea" },
  ],
  api: [
    {
      key: "endpoint",
      label: "endpoint",
      kind: "text",
      placeholder: "https://api.simhope.local/...",
    },
    {
      key: "docsUrl",
      label: "docsUrl",
      kind: "text",
      placeholder: "https://docs.simhope.local/...",
    },
    {
      key: "sdkPackage",
      label: "sdkPackage",
      kind: "text",
      placeholder: "@simhope/x-sdk",
    },
  ],
  embedded: [
    { key: "location", label: "location（部署地點）", kind: "text" },
    {
      key: "accessNote",
      label: "accessNote（怎麼用 / 找誰開通）",
      kind: "textarea",
    },
    { key: "contact", label: "contact（負責窗口）", kind: "text" },
  ],
  skill: [
    {
      key: "skillZipUrl",
      label: "skillZipUrl（.zip 下載連結）",
      kind: "upload",
      uploadPrefix: "skills",
    },
    { key: "version", label: "version", kind: "text", placeholder: "v1.0.0" },
    {
      key: "installPath",
      label: "installPath",
      kind: "text",
      placeholder: "~/.claude/skills/",
    },
  ],
};

// ─── 依工具陣列算各 category 數量（首頁入口卡 / hub tab 用） ───
export function categoryCounts(tools) {
  const counts = { all: 0 };
  for (const k of CATEGORY_ORDER) counts[k] = 0;
  for (const t of tools) {
    if (t.status === "terminated") continue; // 計數只算 active（沿用首頁慣例）
    counts.all += 1;
    const c =
      t.category && counts[t.category] !== undefined ? t.category : "tool";
    counts[c] += 1;
  }
  return counts;
}
