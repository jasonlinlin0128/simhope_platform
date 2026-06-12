# 本地 skill / MCP 大量上架 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 一支 idempotent import 腳本，把 Jason 本地可共用的 Agent skill 與 MCP 做成 hub 的 pending `tools` 卡片（🟢自己的打包 zip 上 Storage 供下載、🔵第三方連結、MCP config 卡），文案經 Gemini 改寫成人話。

**Architecture:** `scripts/import-local-resources.mjs`（沿用 `seed-faqs.mjs` 的 Admin SDK + dry-run/--apply 範式）orchestrate；純邏輯「敏感檔/secret 判定」抽到 `scripts/lib/skillScrub.mjs`（TDD）。skill 打包＝「只複製 include 檔到 staging → zip → 上傳 → makePublic」。

**Tech Stack:** Node ESM / firebase-admin（firestore + storage）/ `src/lib/gemini.mjs` callGemini / git-bash `zip` / node:test。

**慣例：** commit 結尾必加 `Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>`。

---

### Task 1: `skillScrub.mjs` — 敏感檔 / secret 判定（TDD）

**Files:**

- Create: `scripts/lib/skillScrub.mjs`
- Test: `scripts/lib/skillScrub.test.mjs`

- [ ] **Step 1: 寫失敗測試**

Create `scripts/lib/skillScrub.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { shouldExcludePath, containsSecret } from "./skillScrub.mjs";

test("路徑排除：.env / .git / node_modules / log / __pycache__", () => {
  assert.equal(shouldExcludePath(".env"), true);
  assert.equal(shouldExcludePath("sub/.env.local"), true);
  assert.equal(shouldExcludePath(".env.example"), false); // 範例保留
  assert.equal(shouldExcludePath(".git/config"), true);
  assert.equal(shouldExcludePath("node_modules/x/index.js"), true);
  assert.equal(shouldExcludePath("scripts/__pycache__/a.pyc"), true);
  assert.equal(shouldExcludePath("debug.log"), true);
  assert.equal(shouldExcludePath("SKILL.md"), false);
  assert.equal(shouldExcludePath("references/design.md"), false);
});

test("secret 樣式偵測", () => {
  assert.equal(containsSecret("api_key = sk-ant-abcdefghij1234567890"), true);
  assert.equal(
    containsSecret("AIzaSyAbc123_def456-ghi789jkl012mno345pqr"),
    true,
  );
  assert.equal(
    containsSecret("token: ghp_0123456789abcdefghijabcdef0123456789"),
    true,
  );
  assert.equal(containsSecret("xoxb-123-456-abcDEF"), true);
  assert.equal(containsSecret("-----BEGIN PRIVATE KEY-----"), true);
  assert.equal(containsSecret('"FIREBASE_SERVICE_ACCOUNT": "{...}"'), true);
  assert.equal(containsSecret("這是一段普通說明，沒有任何密鑰。"), false);
  assert.equal(containsSecret("GEMINI_API_KEY=your-key-here"), false); // 範例佔位不算
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npm run test:unit`
Expected: FAIL — `Cannot find module './skillScrub.mjs'`

- [ ] **Step 3: 寫實作**

Create `scripts/lib/skillScrub.mjs`:

```js
// scripts/lib/skillScrub.mjs
// 打包 skill 前的「該不該收進 zip」判定。純函式、無 I/O，node:test 可測。

// 路徑（相對 skill 根）命中即排除。.env.example 例外保留。
const EXCLUDE_DIRS = ["node_modules", ".git", "__pycache__", ".venv", "dist"];
export function shouldExcludePath(relPath) {
  const p = relPath.replace(/\\/g, "/");
  const base = p.split("/").pop();
  if (EXCLUDE_DIRS.some((d) => p.split("/").includes(d))) return true;
  if (/\.log$/i.test(base)) return true;
  if (base === ".env.example") return false; // 範例保留
  if (/^\.env(\.|$)/.test(base)) return true; // .env / .env.local / .env.*
  return false;
}

// 內容含 secret 樣式（排掉明顯的佔位字串如 your-key-here）。
const SECRET_PATTERNS = [
  /sk-[A-Za-z0-9_-]{16,}/, // OpenAI/Anthropic key
  /AIza[0-9A-Za-z_-]{35}/, // Google API key
  /ghp_[0-9A-Za-z]{36}/, // GitHub PAT
  /xox[baprs]-[0-9A-Za-z-]{10,}/, // Slack token
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/, // PEM 私鑰
  /"?FIREBASE_SERVICE_ACCOUNT"?\s*[:=]\s*["{]/, // SA JSON
];
export function containsSecret(content) {
  if (!content) return false;
  return SECRET_PATTERNS.some((re) => re.test(content));
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npm run test:unit`
Expected: PASS（既有 + 新 2 tests 全過）

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/skillScrub.mjs scripts/lib/skillScrub.test.mjs
git commit -m "feat(import): skillScrub — 敏感檔/secret 判定（純，TDD）

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

### Task 2: import 腳本骨架 — Admin SDK + 分類 map + 掃描 + dry-run 印分類

**Files:**

- Create: `scripts/import-local-resources.mjs`

先做「掃 skills + 套分類 + dry-run 印出」，還不打包/不寫入。SA 載入 + dry-run 旗標沿用 `seed-faqs.mjs`。

- [ ] **Step 1: 寫骨架**

Create `scripts/import-local-resources.mjs`:

```js
// scripts/import-local-resources.mjs
// 把本地可共用 skill / MCP 上架成 hub 的 pending tools 卡片。
// 用法：
//   node scripts/import-local-resources.mjs            # dry-run（只印，不寫/不上傳）
//   node scripts/import-local-resources.mjs --apply    # 打包+上傳+寫 pending
//   node scripts/import-local-resources.mjs --apply --update  # 同步已存在的 import-* 草稿
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const DRY_RUN = !process.argv.includes("--apply");
const UPDATE = process.argv.includes("--update");
const SKILLS_DIR = join(homedir(), ".claude", "skills");
const ADMIN_UID =
  process.env.IMPORT_AUTHOR_UID || "REPLACE_WITH_JASON_ADMIN_UID";
const BUCKET = "simhope-platform.firebasestorage.app";

// 分類 map：slug → "own" | "thirdparty" | "skip"。實作時逐個讀 SKILL.md 定案、
// dry-run 給 Jason 過。未列到的預設 "skip"（保守，不誤上個人專屬）。
const CLASSIFY = {
  "security-audit": "own",
  批次excel轉word: "own",
  "progress-report": "own",
  "ai-collaboration-standards": "own",
  "logo-generator": "thirdparty",
  "agent-browser": "thirdparty",
  "agent-builder": "thirdparty",
  "mcp-builder": "thirdparty",
  // ⚪ 個人專屬 → skip（明列以利 dry-run 顯示理由）
  ai: "skip",
  "ai-inbox": "skip",
  "coord-add": "skip",
  "daily-morning-briefing": "skip",
  "daily-stock-email-digest": "skip",
  "gb10-model-mgmt": "skip",
  "inbox-review": "skip",
  "update-project": "skip",
  "progress-report-workspace": "skip",
  // ❓ 待 Jason 定（先 skip）
  "dot-skill": "skip",
  "vibe-to-agentic-framework": "skip",
};

// 🔵 第三方來源 repo（卡片連結用）。實作時補齊。
const THIRDPARTY_REPO = {
  "logo-generator": "https://github.com/op7418/logo-generator-skill",
  "agent-browser": "",
  "agent-builder": "",
  "mcp-builder": "",
};

// 解析 SKILL.md 的 YAML-ish frontmatter（只取 name/description）。
function parseFrontmatter(md) {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return {};
  const out = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z_-]+):\s*(.*)$/);
    if (kv) out[kv[1]] = kv[2].trim();
  }
  return out;
}

// 掃所有 skill 資料夾 → { slug, dir, name, description, bucket: own|thirdparty|skip }
function scanSkills() {
  if (!existsSync(SKILLS_DIR)) return [];
  return readdirSync(SKILLS_DIR)
    .filter((slug) => {
      const d = join(SKILLS_DIR, slug);
      return (
        statSync(d).isDirectory() &&
        slug !== "_archive" &&
        existsSync(join(d, "SKILL.md"))
      );
    })
    .map((slug) => {
      const dir = join(SKILLS_DIR, slug);
      const fm = parseFrontmatter(readFileSync(join(dir, "SKILL.md"), "utf8"));
      return {
        slug,
        dir,
        name: fm.name || slug,
        description: fm.description || "",
        bucket: CLASSIFY[slug] || "skip",
      };
    });
}

// ── main ──
const skills = scanSkills();
console.log(
  `=== import-local-resources（${DRY_RUN ? "DRY-RUN" : "APPLY"}）===\n`,
);
console.log(`掃到 ${skills.length} 個 skill：`);
for (const s of skills) {
  const tag = { own: "🟢自己", thirdparty: "🔵第三方", skip: "⚪略過" }[
    s.bucket
  ];
  console.log(`  ${tag}  ${s.slug} — ${s.name}`);
}
const willImport = skills.filter((s) => s.bucket !== "skip");
console.log(`\n會上架 ${willImport.length} 個 skill（🟢打包 / 🔵連結）。`);

if (DRY_RUN) {
  console.log("\n>>> dry-run，確認分類後加 --apply。");
}
```

> 註：`ADMIN_UID` 實作時用 `IMPORT_AUTHOR_UID` env 帶入 Jason 的 admin uid（從 users collection 撈）。SA 載入下一步補。

- [ ] **Step 2: 補 SA 載入（沿用 seed-faqs 寫法）**

在 import 區之後、`scanSkills()` 之前加（與 `scripts/seed-faqs.mjs` 完全一致的載入；實作時開 seed-faqs 對照貼上）：

```js
const sa = JSON.parse(
  process.env.FIREBASE_SERVICE_ACCOUNT ||
    readFileSync(join(process.cwd(), "serviceAccountKey.json"), "utf8"),
);
initializeApp({ credential: cert(sa), storageBucket: BUCKET });
const db = getFirestore();
```

- [ ] **Step 3: dry-run 跑跑看分類**

Run: `node scripts/import-local-resources.mjs`
Expected: 印出每個 skill 的 🟢/🔵/⚪ 分類 + 「會上架 N 個」。

- [ ] **Step 4: Commit**

```bash
git add scripts/import-local-resources.mjs
git commit -m "feat(import): 腳本骨架 — 掃 skills + 分類 + dry-run 印出

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

### Task 3: 🟢 skill 打包（scrub→staging→zip→Storage→公開讀 URL）

**Files:**

- Modify: `scripts/import-local-resources.mjs`（加 `packageSkill()`）

- [ ] **Step 1: 加打包函式**

在 import 區加 `import { execFileSync } from "child_process";`、`import { mkdtempSync, copyFileSync, mkdirSync, rmSync } from "fs";`、`import { tmpdir } from "os";`、`import { relative, dirname } from "path";`、`import { shouldExcludePath, containsSecret } from "./lib/skillScrub.mjs";`。

加函式：

```js
// 遞迴列出 skill 內所有檔（相對路徑）。
function listFiles(root, sub = "") {
  const out = [];
  for (const name of readdirSync(join(root, sub))) {
    const rel = sub ? `${sub}/${name}` : name;
    if (statSync(join(root, rel)).isDirectory())
      out.push(...listFiles(root, rel));
    else out.push(rel);
  }
  return out;
}

// scrub：回傳 { include:[], excluded:[{path,reason}] }。
function scrubSkill(dir) {
  const include = [];
  const excluded = [];
  for (const rel of listFiles(dir)) {
    if (shouldExcludePath(rel)) {
      excluded.push({ path: rel, reason: "路徑規則" });
      continue;
    }
    if (statSync(join(dir, rel)).size > 5 * 1024 * 1024) {
      excluded.push({ path: rel, reason: ">5MB" });
      continue;
    }
    // 文字檔內容掃 secret（二進位略過）
    let content = "";
    try {
      content = readFileSync(join(dir, rel), "utf8");
    } catch {
      /* 二進位 */
    }
    if (content && containsSecret(content)) {
      excluded.push({ path: rel, reason: "含 secret 樣式" });
      continue;
    }
    include.push(rel);
  }
  return { include, excluded };
}

// 打包 + 上傳；回傳 { skillZipUrl, manifest }。SKILL.md 本體含 secret → 丟錯（呼叫端跳過該 skill）。
async function packageSkill(slug, dir) {
  const { include, excluded } = scrubSkill(dir);
  const skillMd = readFileSync(join(dir, "SKILL.md"), "utf8");
  if (containsSecret(skillMd))
    throw new Error(`${slug}/SKILL.md 含 secret，跳過`);

  if (DRY_RUN)
    return { skillZipUrl: "(dry-run 未上傳)", manifest: { include, excluded } };

  // 1. 複製 include 檔到 staging
  const stage = mkdtempSync(join(tmpdir(), `skill-${slug}-`));
  for (const rel of include) {
    const dst = join(stage, slug, rel);
    mkdirSync(dirname(dst), { recursive: true });
    copyFileSync(join(dir, rel), dst);
  }
  // 2. zip staging（git-bash 有 zip）
  const zipPath = join(tmpdir(), `${slug}.zip`);
  rmSync(zipPath, { force: true });
  execFileSync("zip", ["-r", "-q", zipPath, slug], { cwd: stage });
  // 3. 上傳 + 公開讀
  const dest = `skills/${slug}.zip`;
  await getStorage().bucket(BUCKET).upload(zipPath, { destination: dest });
  const file = getStorage().bucket(BUCKET).file(dest);
  await file.makePublic();
  const skillZipUrl = `https://storage.googleapis.com/${BUCKET}/${dest}`;
  // 4. 清理
  rmSync(stage, { recursive: true, force: true });
  rmSync(zipPath, { force: true });
  return { skillZipUrl, manifest: { include, excluded } };
}
```

- [ ] **Step 2: dry-run 印每個 🟢 skill 的檔案清單**

在 main 的 skill 迴圈裡，對 `bucket==="own"` 呼叫 `scrubSkill(s.dir)` 並印 include/excluded（讓 Jason 過目）。（實作時把這段加進現有列印迴圈。）

Run: `node scripts/import-local-resources.mjs`
Expected: 每個 🟢 skill 下印「含 N 檔 / 排除 M 檔（理由）」。

- [ ] **Step 3: Commit**

```bash
git add scripts/import-local-resources.mjs
git commit -m "feat(import): 🟢 skill scrub + zip + Storage 上傳（公開讀）

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

### Task 4: MCP manifest + mcp/skill tool 文件組裝

**Files:**

- Modify: `scripts/import-local-resources.mjs`（加 `SHAREABLE_MCPS` + `buildSkillDoc` + `buildMcpDoc`）

- [ ] **Step 1: 加 MCP manifest（curated，只通用非帳號綁定）**

```js
// curated 可共用 MCP（帳號綁定的 Gmail/Calendar/Drive/個人 Notion/exa 不列）。
// dry-run 印出給 Jason 確認/增減。
const SHAREABLE_MCPS = [
  {
    slug: "context7",
    name: "Context7 文件查詢",
    description: "查 library / 框架最新 API 文件（React/Next/Prisma 等）。",
    config: "claude mcp add context7 -- npx -y @upstash/context7-mcp",
    repoUrl: "https://github.com/upstash/context7",
    npmPackage: "@upstash/context7-mcp",
  },
  {
    slug: "chart",
    name: "圖表產生器",
    description: "用自然語言產長條圖/折線圖/流程圖等（AntV）。",
    config: "claude mcp add chart -- npx -y @antv/mcp-server-chart",
    repoUrl: "https://github.com/antvis/mcp-server-chart",
    npmPackage: "@antv/mcp-server-chart",
  },
  {
    slug: "playwright",
    name: "Playwright 瀏覽器自動化",
    description: "讓 AI 開網頁、填表單、截圖、抓資料。",
    config:
      "claude mcp add playwright -- npx -y @playwright/mcp@latest --headless",
    repoUrl: "https://github.com/microsoft/playwright-mcp",
    npmPackage: "@playwright/mcp",
  },
];
```

- [ ] **Step 2: 加 tool 文件組裝函式**

```js
const SKILL_INSTALL = (slug) =>
  `\n\n## 安裝\n下載 zip 解壓到 \`~/.claude/skills/${slug}/\`（含 SKILL.md），重開 Claude Code 即生效。`;

function buildSkillDoc({
  slug,
  name,
  tagline,
  desc,
  bucket,
  skillZipUrl,
  repoUrl,
}) {
  const typeData =
    bucket === "own"
      ? { skillZipUrl, installPath: `~/.claude/skills/${slug}/` }
      : { repoUrl, installPath: `~/.claude/skills/${slug}/` };
  const install =
    bucket === "own"
      ? SKILL_INSTALL(slug)
      : `\n\n## 安裝\n從原始 repo 取得：${repoUrl}\n放到 \`~/.claude/skills/${slug}/\`。`;
  return {
    id: `import-skill-${slug}`,
    data: {
      type: "skill",
      category: "skill",
      status: "pending",
      title: name,
      tagline: tagline || "",
      desc: (desc || "") + install,
      tags: ["skill", bucket === "own" ? "自製" : "第三方"],
      authorUid: ADMIN_UID,
      source: "import-script",
      typeData,
      createdAt: FieldValue.serverTimestamp(),
    },
  };
}

function buildMcpDoc({
  slug,
  name,
  tagline,
  desc,
  config,
  repoUrl,
  npmPackage,
}) {
  return {
    id: `import-mcp-${slug}`,
    data: {
      type: "mcp",
      category: "mcp",
      status: "pending",
      title: name,
      tagline: tagline || "",
      desc: `${desc || ""}\n\n## 安裝\n\`\`\`\n${config}\n\`\`\``,
      tags: ["mcp"],
      authorUid: ADMIN_UID,
      source: "import-script",
      url: repoUrl || "",
      typeData: { configSnippet: config, repoUrl, npmPackage },
      createdAt: FieldValue.serverTimestamp(),
    },
  };
}
```

- [ ] **Step 3: Commit**

```bash
git add scripts/import-local-resources.mjs
git commit -m "feat(import): MCP manifest + skill/mcp tool 文件組裝

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

### Task 5: Gemini 文案改寫 + batch 寫入（dry-run/--apply）

**Files:**

- Modify: `scripts/import-local-resources.mjs`（加 `rewriteCopy` + 主流程組裝/寫入）

- [ ] **Step 1: 加 Gemini 改寫**

加 `import { callGemini } from "../src/lib/gemini.mjs";`。

```js
// 把 AI 觸發口吻 description 改寫成給同仁看的卡片文案。失敗退回原文。
async function rewriteCopy(name, description) {
  if (!description) return { tagline: name, desc: "" };
  const prompt = `你是公司內部 AI 工具中心的文案。把下面這個 ${"工具"}的「給 AI 看的觸發描述」改寫成「給公司同仁看的工具卡」。
名稱：${name}
原描述：${description}
要求：回 JSON {"tagline":"一句話 ≤30 字、講它幫使用者做什麼","desc":"2-3 句白話說明，不要出現『Use when the user』這種 AI 口吻"}`;
  try {
    const r = await callGemini({ prompt, json: true, temperature: 0.4 });
    return { tagline: r.tagline || name, desc: r.desc || description };
  } catch (e) {
    console.warn(`  ⚠️ Gemini 改寫失敗（${name}），用原文：${e.message}`);
    return { tagline: name, desc: description };
  }
}
```

- [ ] **Step 2: 主流程組裝所有 doc + dry-run 印 + --apply 寫**

把 main 末段（dry-run 區）換成：組 docs → 印 → 寫。

```js
const docs = [];
// skills（🟢🔵）
for (const s of willImport) {
  const { tagline, desc } = await rewriteCopy(s.name, s.description);
  let skillZipUrl = "",
    repoUrl = THIRDPARTY_REPO[s.slug] || "";
  if (s.bucket === "own") {
    try {
      ({ skillZipUrl } = await packageSkill(s.slug, s.dir));
    } catch (e) {
      console.warn(`  ⛔ 跳過 ${s.slug}：${e.message}`);
      continue;
    }
  }
  docs.push(buildSkillDoc({ ...s, tagline, desc, skillZipUrl, repoUrl }));
}
// mcps
for (const m of SHAREABLE_MCPS) {
  const { tagline, desc } = await rewriteCopy(m.name, m.description);
  docs.push(buildMcpDoc({ ...m, tagline, desc }));
}

console.log(`\n=== 會建 ${docs.length} 張卡片 ===`);
for (const d of docs) {
  console.log(`  [${d.data.type}] ${d.id} — ${d.data.title}`);
  console.log(`     tagline: ${d.data.tagline}`);
}

if (DRY_RUN) {
  console.log("\n>>> dry-run。確認後加 --apply 寫入 pending + 上傳 zip：");
  console.log("    node scripts/import-local-resources.mjs --apply");
  process.exit(0);
}

// --apply：跳過已存在（除非 --update）
const batch = db.batch();
let written = 0;
for (const d of docs) {
  const ref = db.collection("tools").doc(d.id);
  const snap = await ref.get();
  if (snap.exists && !UPDATE) {
    console.log(`  跳過（已存在）：${d.id}`);
    continue;
  }
  // 已存在 + --update：只更新文案/typeData，不覆寫 status（Jason 可能已發布）
  const payload = snap.exists
    ? {
        title: d.data.title,
        tagline: d.data.tagline,
        desc: d.data.desc,
        typeData: d.data.typeData,
      }
    : d.data;
  batch.set(ref, payload, { merge: snap.exists });
  written++;
}
await batch.commit();
console.log(
  `\n✅ 完成。寫入/更新 ${written} 張卡片（status=pending，到 /admin 發布）。`,
);
```

- [ ] **Step 3: Commit**

```bash
git add scripts/import-local-resources.mjs
git commit -m "feat(import): Gemini 文案改寫 + batch 寫 pending tools

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

### Task 6: 跑 dry-run → Jason 過 → --apply → 驗證

**Files:** 無（執行 + 驗證）

- [ ] **Step 1: 取 Jason admin uid**

```bash
node -e "const a=JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT||require('fs').readFileSync('serviceAccountKey.json','utf8'));const{initializeApp,cert}=require('firebase-admin/app');const{getFirestore}=require('firebase-admin/firestore');initializeApp({credential:cert(a)});getFirestore().collection('users').where('role','==','admin').get().then(s=>{s.forEach(d=>console.log(d.id, d.data().email));process.exit(0)})"
```

記下 admin uid，之後跑腳本帶 `IMPORT_AUTHOR_UID=<uid>`。

- [ ] **Step 2: dry-run，逐個讀有疑慮的 SKILL.md 定案分類**

Run: `node scripts/import-local-resources.mjs`
逐個確認：🟢 的 scrub 檔案清單無敏感檔、🔵 repo 連結正確、MCP manifest 合理、Gemini 文案通順。**把判定結果 + 檔案清單貼給 Jason 過目**（含 ❓dot-skill/vibe 怎麼處理）。**Jason 同意才往下。**

- [ ] **Step 3: --apply（Jason 同意後）**

```bash
IMPORT_AUTHOR_UID=<uid> node scripts/import-local-resources.mjs --apply
```

Expected: 打包上傳 + 寫入 N 張 pending 卡。

- [ ] **Step 4: 驗證**

```bash
# Firestore：import-* pending docs 在
node -e "...(query where source==import-script)..."   # 或 REST
# Storage：zip 可公開下載
curl -sI "https://storage.googleapis.com/simhope-platform.firebasestorage.app/skills/security-audit.zip" | head -1   # 200
```

- Jason 在 /admin 看 pending 卡 → 發布幾個 → live /hub 的 Skill / MCP 分類看到、CTA（下載 zip / 安裝 config）正確。

* [ ] **Step 5: Commit（若 dry-run 後微調分類/manifest）**

```bash
git add scripts/import-local-resources.mjs
git commit -m "chore(import): dry-run 後定案分類/manifest 微調

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

## 完成後

- 獨立 reviewer 審腳本（scrub 正確沒漏密鑰、idempotent、doc 結構合 schema、Gemini 失敗有退路）。
- 開 PR 等 Jason merge。腳本是資料 import（不改 app）；pending 對同仁隱形，Jason 發布才公開。
