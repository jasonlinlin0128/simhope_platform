import { NextResponse } from "next/server";
import { callGemini } from "@/lib/gemini.mjs";
import { HttpError, handleApiError } from "@/lib/apiError.mjs";
import { rateLimit, clientIp } from "@/lib/rateLimit.mjs";

const SYSTEM_PROMPT = `你是公司內部「需求收件」助理。使用者會用口語描述他工作上的痛點或想要的工具。
請做兩件事，並固定輸出純 JSON：
1. optimized：把他的描述改寫得更清楚具體（白話、保留原意、別誇大、別亂加他沒說的需求），約 40-120 字。
2. suggestions：列 1-3 個「他可能沒講清楚、補上會更好評估」的點（每點一句話、繁體中文）。若已很完整可給空陣列。

JSON Schema:
{ "optimized": "改寫後的需求描述", "suggestions": ["可補充的點1", "可補充的點2"] }`;

/**
 * POST /api/refine-request
 * 匿名提需求 AI 優化。per-IP 限流 → Gemini JSON（短 timeout）。
 */
export async function POST(request) {
  try {
    const ip = clientIp(request);
    if (!rateLimit(`refine:${ip}`, { limit: 5, windowMs: 60000 }).ok)
      throw new HttpError(429, "操作過於頻繁，請稍後再試");

    const body = await request.json().catch(() => ({}));
    const text = String(body.text || "")
      .slice(0, 1000)
      .trim();
    if (!text) throw new HttpError(400, "請先輸入需求內容");

    const parsed = await callGemini({
      prompt: SYSTEM_PROMPT + "\n使用者描述：" + text,
      json: true,
      temperature: 0.5,
      timeoutMs: 10000,
    });
    return NextResponse.json({
      optimized: String(parsed.optimized || ""),
      suggestions: Array.isArray(parsed.suggestions)
        ? parsed.suggestions.slice(0, 3)
        : [],
    });
  } catch (e) {
    return handleApiError(e, "/api/refine-request");
  }
}
