// scripts/import-local-resources.mjs
// 把本地可共用 skill / MCP 上架成 hub 的 pending tools 卡片。
// 用法：
//   node scripts/import-local-resources.mjs                    # dry-run（只印，不寫/不上傳）
//   IMPORT_AUTHOR_UID=<uid> node scripts/import-local-resources.mjs --apply           # 打包+上傳+寫 pending
//   IMPORT_AUTHOR_UID=<uid> node scripts/import-local-resources.mjs --apply --update   # 同步已存在的 import-* 草稿文案
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import {
  readFileSync,
  readdirSync,
  statSync,
  existsSync,
  mkdtempSync,
  copyFileSync,
  mkdirSync,
  rmSync,
} from "fs";
import { join, dirname } from "path";
import { homedir, tmpdir } from "os";
import { execFileSync } from "child_process";
import { shouldExcludePath, containsSecret } from "../src/lib/skillScrub.mjs";
import { callGemini } from "../src/lib/gemini.mjs";

const DRY_RUN = !process.argv.includes("--apply");
const UPDATE = process.argv.includes("--update");
const SKILLS_DIR = join(homedir(), ".claude", "skills");
const ADMIN_UID = process.env.IMPORT_AUTHOR_UID || "REPLACE_WITH_JASON_ADMIN_UID";
const BUCKET = "simhope-platform.firebasestorage.app";

// 分類 map：slug → "own" | "thirdparty" | "skip"。未列到預設 "skip"（保守，不誤上個人專屬）。
const CLASSIFY = {
  "security-audit": "own",
  批次excel轉word: "own",
  "progress-report": "own",
  "ai-collaboration-standards": "own",
  "logo-generator": "thirdparty",
  "agent-browser": "thirdparty",
  "agent-builder": "thirdparty",
  "mcp-builder": "thirdparty",
  ai: "skip",
  "ai-inbox": "skip",
  "coord-add": "skip",
  "daily-morning-briefing": "skip",
  "daily-stock-email-digest": "skip",
  "gb10-model-mgmt": "skip",
  "inbox-review": "skip",
  "update-project": "skip",
  "progress-report-workspace": "skip",
  "dot-skill": "skip",
  "vibe-to-agentic-framework": "skip",
};

// 🔵 第三方來源 repo（卡片連結用）。dry-run 後補齊。
const THIRDPARTY_REPO = {
  "logo-generator": "https://github.com/op7418/logo-generator-skill",
  "agent-browser": "",
  "agent-builder": "",
  "mcp-builder": "",
};

// curated 可共用 MCP（帳號綁定的 Gmail/Calendar/Drive/個人 Notion/exa 不列）。
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

// ── Admin SDK（沿用 seed-faqs 載入）──
const sa = JSON.parse(
  process.env.FIREBASE_SERVICE_ACCOUNT ||
    readFileSync(join(process.cwd(), "serviceAccountKey.json"), "utf8"),
);
initializeApp({ credential: cert(sa), storageBucket: BUCKET });
const db = getFirestore();

// ── skill 掃描 / frontmatter ──
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

// ── scrub / 打包 ──
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

async function packageSkill(slug, dir) {
  const { include, excluded } = scrubSkill(dir);
  const skillMd = readFileSync(join(dir, "SKILL.md"), "utf8");
  if (containsSecret(skillMd)) throw new Error(`${slug}/SKILL.md 含 secret`);
  if (DRY_RUN)
    return { skillZipUrl: "(dry-run 未上傳)", manifest: { include, excluded } };

  const stage = mkdtempSync(join(tmpdir(), `skill-${slug}-`));
  for (const rel of include) {
    const dst = join(stage, slug, rel);
    mkdirSync(dirname(dst), { recursive: true });
    copyFileSync(join(dir, rel), dst);
  }
  const zipPath = join(tmpdir(), `${slug}.zip`);
  rmSync(zipPath, { force: true });
  execFileSync("zip", ["-r", "-q", zipPath, slug], { cwd: stage });
  const dest = `skills/${slug}.zip`;
  await getStorage().bucket(BUCKET).upload(zipPath, { destination: dest });
  await getStorage().bucket(BUCKET).file(dest).makePublic();
  const skillZipUrl = `https://storage.googleapis.com/${BUCKET}/${dest}`;
  rmSync(stage, { recursive: true, force: true });
  rmSync(zipPath, { force: true });
  return { skillZipUrl, manifest: { include, excluded } };
}

// ── tool 文件組裝 ──
const SKILL_INSTALL = (slug) =>
  `\n\n## 安裝\n下載 zip 解壓到 \`~/.claude/skills/${slug}/\`（含 SKILL.md），重開 Claude Code 即生效。`;

function buildSkillDoc({ slug, name, tagline, desc, bucket, skillZipUrl, repoUrl }) {
  const typeData =
    bucket === "own"
      ? { skillZipUrl, installPath: `~/.claude/skills/${slug}/` }
      : { repoUrl, installPath: `~/.claude/skills/${slug}/` };
  const install =
    bucket === "own"
      ? SKILL_INSTALL(slug)
      : `\n\n## 安裝\n從原始 repo 取得：${repoUrl || "(待補)"}\n放到 \`~/.claude/skills/${slug}/\`。`;
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

function buildMcpDoc({ slug, name, tagline, desc, config, repoUrl, npmPackage }) {
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

// ── Gemini 文案改寫：一次呼叫改寫全部（避開 free-tier 5/min 限流）。失敗 → 退回原文。──
async function rewriteAll(items) {
  // key → { tagline, desc }；預設退回原文。
  const out = new Map(
    items.map((it) => [it.key, { tagline: it.name, desc: it.description }]),
  );
  if (!items.length) return out;
  const list = items
    .map((it) => `- key:${it.key}｜名稱:${it.name}｜原描述:${it.description}`)
    .join("\n");
  const prompt = `你是公司內部 AI 工具中心的文案編輯。把下面每個工具「給 AI 看的觸發描述」改寫成「給公司同仁看的工具卡」。
${list}

回 JSON array，每筆 {"key":"<原樣 key>","tagline":"一句話 ≤30 字、講它幫使用者做什麼","desc":"2-3 句白話說明，不要出現『Use when the user』這種 AI 口吻"}。`;
  try {
    const arr = await callGemini({
      prompt,
      json: true,
      temperature: 0.4,
      maxOutputTokens: 4096,
    });
    if (Array.isArray(arr)) {
      for (const r of arr) {
        if (r?.key && out.has(r.key)) {
          const cur = out.get(r.key);
          // Gemini 偶爾回佔位字串（如「(待補)」）→ 視為無效、退回原文
          const bad = (v) => !v || /待補|TODO|^\(.*\)$/.test(v.trim());
          out.set(r.key, {
            tagline: bad(r.tagline) ? cur.tagline : r.tagline,
            desc: bad(r.desc) ? cur.desc : r.desc,
          });
        }
      }
    }
  } catch (e) {
    console.warn(`  ⚠️ Gemini 批次改寫失敗，全用原文：${e.message}`);
  }
  return out;
}

// ── main ──
console.log(`=== import-local-resources（${DRY_RUN ? "DRY-RUN" : "APPLY"}）===\n`);
const skills = scanSkills();
console.log(`掃到 ${skills.length} 個 skill：`);
for (const s of skills) {
  const tag = { own: "🟢自己", thirdparty: "🔵第三方", skip: "⚪略過" }[s.bucket];
  console.log(`  ${tag}  ${s.slug} — ${s.name}`);
}
const willImport = skills.filter((s) => s.bucket !== "skip");
console.log(`\n會上架 ${willImport.length} skill + ${SHAREABLE_MCPS.length} MCP。\n`);

// 先一次 Gemini 改寫全部文案（避開 free-tier 限流）
const copy = await rewriteAll([
  ...willImport.map((s) => ({
    key: `skill:${s.slug}`,
    name: s.name,
    description: s.description,
  })),
  ...SHAREABLE_MCPS.map((m) => ({
    key: `mcp:${m.slug}`,
    name: m.name,
    description: m.description,
  })),
]);

const docs = [];
for (const s of willImport) {
  const { tagline, desc } = copy.get(`skill:${s.slug}`);
  let skillZipUrl = "";
  const repoUrl = THIRDPARTY_REPO[s.slug] || "";
  if (s.bucket === "own") {
    let manifest;
    try {
      ({ skillZipUrl, manifest } = await packageSkill(s.slug, s.dir));
    } catch (e) {
      console.warn(`  ⛔ 跳過 ${s.slug}：${e.message}`);
      continue;
    }
    console.log(
      `  📦 ${s.slug}：含 ${manifest.include.length} 檔` +
        (manifest.excluded.length
          ? `，排除 ${manifest.excluded.length}（${manifest.excluded.map((x) => `${x.path}:${x.reason}`).join("; ")}）`
          : ""),
    );
  }
  docs.push(buildSkillDoc({ ...s, tagline, desc, skillZipUrl, repoUrl }));
}
for (const m of SHAREABLE_MCPS) {
  const { tagline, desc } = copy.get(`mcp:${m.slug}`);
  docs.push(buildMcpDoc({ ...m, tagline, desc }));
}

console.log(`\n=== 會建 ${docs.length} 張卡片 ===`);
for (const d of docs) {
  console.log(`  [${d.data.type}] ${d.id} — ${d.data.title}`);
  console.log(`     tagline: ${d.data.tagline}`);
}

if (DRY_RUN) {
  console.log("\n>>> dry-run。確認分類/檔案清單/文案後加 --apply：");
  console.log("    IMPORT_AUTHOR_UID=<uid> node scripts/import-local-resources.mjs --apply");
  process.exit(0);
}

if (ADMIN_UID === "REPLACE_WITH_JASON_ADMIN_UID") {
  console.error("\n⛔ 請帶 IMPORT_AUTHOR_UID=<Jason admin uid> 再 --apply。");
  process.exit(1);
}

const batch = db.batch();
let written = 0;
for (const d of docs) {
  const ref = db.collection("tools").doc(d.id);
  const snap = await ref.get();
  if (snap.exists && !UPDATE) {
    console.log(`  跳過（已存在）：${d.id}`);
    continue;
  }
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
console.log(`\n✅ 完成。寫入/更新 ${written} 張卡片（status=pending，到 /admin 發布）。`);
process.exit(0);
