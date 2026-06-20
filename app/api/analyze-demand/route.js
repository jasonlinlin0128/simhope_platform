import { NextResponse } from "next/server";
import { requireRole } from "@/lib/apiAuth.mjs";
import { callGemini } from "@/lib/gemini.mjs";
import { handleApiError } from "@/lib/apiError.mjs";
import { enforceRateLimit } from "@/lib/rateLimit.mjs";
import { getAdmin } from "@/lib/firebaseAdmin";
import { buildDemandPrompt, normalizeThemes } from "@/lib/demandBoard.mjs";

const MAX_REQUESTS = 100; // 送 Gemini 的需求上限（避免 prompt 過長）
const MSG_MAX = 500; // 每筆 message 截斷長度

/**
 * POST /api/analyze-demand — admin-only。讀待處理 feature 需求 → Gemini 主題分群。
 * IP 前置限流 → auth(admin, Admin SDK) → 讀 requests → Gemini JSON → normalize。
 */
export async function POST(request) {
  try {
    enforceRateLimit(request, "analyze-demand", { limit: 10, windowMs: 60000 });

    await requireRole(request, ["admin"], {
      forbiddenMessage: "需要管理員權限",
    });

    const { adminDb } = getAdmin();
    const snap = await adminDb
      .collection("requests")
      .where("status", "==", "pending")
      .get();
    const messages = [];
    snap.forEach((d) => {
      const data = d.data();
      if (data.type === "feature" && data.message) {
        messages.push(String(data.message).slice(0, MSG_MAX));
      }
    });
    const total = messages.length;
    if (total === 0) return NextResponse.json({ themes: [], total: 0 });

    const parsed = await callGemini({
      prompt: buildDemandPrompt(messages.slice(0, MAX_REQUESTS)),
      json: true,
      temperature: 0.3,
      timeoutMs: 15000,
    });
    const themes = normalizeThemes(parsed, 6);
    return NextResponse.json({ themes, total });
  } catch (e) {
    return handleApiError(e, "/api/analyze-demand");
  }
}
