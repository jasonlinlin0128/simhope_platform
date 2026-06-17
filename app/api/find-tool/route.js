import { NextResponse } from "next/server";
import { callGemini } from "@/lib/gemini.mjs";
import { HttpError, handleApiError } from "@/lib/apiError.mjs";
import { rateLimit, clientIp } from "@/lib/rateLimit.mjs";
import { getServerCatalog, getServerToolHelpful } from "@/lib/serverCatalog";
import { buildFindToolPrompt, validateToolMatches } from "@/lib/findTool.mjs";
import { attachHelpfulCounts } from "@/lib/helpfulBadge.mjs";

const FIND_STATUSES = ["live", "beta", "new"];

/**
 * POST /api/find-tool — 語意找工具（匿名）。
 * per-IP 限流 → 讀公開目錄(篩 live/beta/new) → Gemini JSON → 驗證 id grounding → {reply, tools}。
 */
export async function POST(request) {
  try {
    const ip = clientIp(request);
    if (!rateLimit(`find-tool:${ip}`, { limit: 10, windowMs: 60000 }).ok)
      throw new HttpError(429, "操作過於頻繁，請稍後再試");

    const body = await request.json().catch(() => ({}));
    const query = String(body.query || "")
      .slice(0, 500)
      .trim();
    if (!query) throw new HttpError(400, "請描述你想做的事");

    const catalog = (await getServerCatalog()).filter((t) =>
      FIND_STATUSES.includes(t.status),
    );
    const compact = catalog.map((t) => ({
      id: t.id,
      title: t.title,
      tagline: t.tagline,
      scenarios: t.scenarios,
      tags: t.tags,
    }));

    const parsed = await callGemini({
      prompt: buildFindToolPrompt(query, compact),
      json: true,
      temperature: 0.3,
      timeoutMs: 10000,
    });
    const { reply, tools } = validateToolMatches(parsed, catalog, 4);
    const helpfulMap = await getServerToolHelpful(); // fail-soft：catch→{}，讀失敗則無 badge
    return NextResponse.json({
      reply,
      tools: attachHelpfulCounts(tools, helpfulMap),
    });
  } catch (e) {
    return handleApiError(e, "/api/find-tool");
  }
}
