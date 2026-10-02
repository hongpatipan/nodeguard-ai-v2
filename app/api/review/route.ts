import { NextResponse, after } from "next/server";

import { ApiError, extractGeminiMessage, generateContentWithRetry, getGeminiClient } from "@/lib/gemini-client";
import { DEFAULT_MODEL, getFallbackModel, isValidModel, type GeminiModelId } from "@/lib/gemini-models";
import { fetchDiffFromUrl } from "@/lib/vcs";
import { REVIEW_RESPONSE_SCHEMA } from "@/lib/gemini-schema";
import { filterNodeDiff, prepareReviewInput, type FilterResult } from "@/lib/node-diff-filter";
import { estimateUsage } from "@/lib/gemini-pricing";
import { NODE_REVIEW_SYSTEM_INSTRUCTION, buildUserMessage } from "@/lib/prompts";
import { logReviewFailure, logReviewResult } from "@/lib/review-log";
import { ReviewSchema, type Review, type ReviewResponse } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_DIFF_CHARS = Number(process.env.MAX_DIFF_CHARS ?? 60_000);

type ReviewRequest = { url?: string; code?: string; model?: string };
type Source = { kind: "github" | "gitlab" | "paste"; label: string };
type GeminiResponse = Awaited<ReturnType<typeof generateContentWithRetry>>;

function isTransientApiError(error: unknown): error is ApiError {
  return error instanceof ApiError && (error.status === 503 || error.status === 500);
}

/** เช็คว่ามี Gemini API key ให้ใช้ไหม (BYOK หรือ key กลางของ server) — ไม่มีเลยคือ 401 ทันที */
function requireApiKey(request: Request): { userApiKey?: string } | NextResponse {
  const userApiKey = request.headers.get("x-gemini-api-key")?.trim() || undefined;
  if (!userApiKey && !process.env.GEMINI_API_KEY?.trim()) {
    return NextResponse.json(
      {
        error:
          "ยังไม่มี Gemini API Key — กรอกที่ช่อง API Key ด้านบน (ขอฟรีได้ที่ aistudio.google.com/apikey) หรือให้แอดมินตั้ง GEMINI_API_KEY กลางไว้ที่ server",
      },
      { status: 401 },
    );
  }
  return { userApiKey };
}

/** เตรียม input: ดึง diff จาก GitHub PR / GitLab MR หรือใช้โค้ดที่วางมาตรง ๆ */
async function prepareInput(
  body: ReviewRequest,
): Promise<{ prepared: FilterResult; source: Source; commitSha?: string } | NextResponse> {
  try {
    if (body.url?.trim()) {
      const result = await fetchDiffFromUrl(body.url);
      if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
      return {
        prepared: filterNodeDiff(result.diff, { maxChars: MAX_DIFF_CHARS }),
        source: result.source,
        commitSha: result.source.headSha || undefined,
      };
    }
    if (body.code?.trim()) {
      return {
        prepared: prepareReviewInput(body.code, { maxChars: MAX_DIFF_CHARS }),
        source: { kind: "paste", label: "pasted code / diff" },
      };
    }
    return NextResponse.json({ error: "ต้องส่ง url หรือ code อย่างใดอย่างหนึ่ง" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "เตรียม input ไม่สำเร็จ";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

/**
 * เรียก Gemini พร้อม fallback ไปโมเดลสำรองถ้าโมเดลหลักโหลดสูง (503/500) ต่อเนื่อง —
 * โยน error ต่อให้ caller จัดการถ้าไม่ใช่ transient error (เช่น key ผิด) หรือ fallback ไปแล้วยังพัง
 */
async function callGeminiWithFallback(params: {
  model: GeminiModelId;
  userApiKey?: string;
  prepared: FilterResult;
  source: Source;
}): Promise<{ response: GeminiResponse; usedModel: GeminiModelId; fallbackUsed: boolean } | NextResponse> {
  const { model, userApiKey, prepared, source } = params;
  const callModel = (m: GeminiModelId, retryOpts?: { retries?: number; baseDelayMs?: number }) =>
    generateContentWithRetry(
      getGeminiClient(userApiKey),
      {
        model: m,
        contents: buildUserMessage(prepared.content, source.label),
        config: {
          systemInstruction: NODE_REVIEW_SYSTEM_INSTRUCTION,
          responseMimeType: "application/json",
          responseSchema: REVIEW_RESPONSE_SCHEMA,
          temperature: 0.2,
        },
      },
      retryOpts,
    );

  try {
    const response = await callModel(model);
    return { response, usedModel: model, fallbackUsed: false };
  } catch (error) {
    // โมเดลหลัก retry ในตัวจนหมดแล้วยัง 503/500 (โหลดสูงต่อเนื่องจริง) — ลองสลับไปอีกโมเดลในลิสต์
    // ก่อนยอมแพ้ เพราะ Flash/Pro แยก capacity pool กันคนละก้อน มักไม่ล่มพร้อมกัน
    if (!isTransientApiError(error)) throw error;

    const fallbackModel = getFallbackModel(model);
    if (fallbackModel === model) throw error; // ไม่มีโมเดลอื่นให้ลอง

    try {
      const response = await callModel(fallbackModel, { retries: 2, baseDelayMs: 2000 });
      return { response, usedModel: fallbackModel, fallbackUsed: true };
    } catch (fallbackError) {
      if (isTransientApiError(fallbackError)) {
        const msg = `เซิร์ฟเวอร์ Gemini โหลดสูงทั้ง ${model} และ ${fallbackModel} — ลองทั้งสองโมเดลแล้วไม่สำเร็จ รอสักครู่แล้วลองใหม่`;
        after(() => logReviewFailure({ sourceKind: source.kind, sourceLabel: source.label, model, errorMessage: msg }));
        return NextResponse.json({ error: msg }, { status: 503 });
      }
      throw fallbackError; // error คนละแบบ (เช่น key ผิด) — ให้ catch ข้างนอกจัดการตามปกติ
    }
  }
}

/** parse ข้อความดิบจาก Gemini -> JSON -> validate schema -> เรียง severity ให้ UI ไม่ต้องเรียงเอง */
function parseGeminiReview(rawText: string | undefined, source: Source, usedModel: GeminiModelId): Review | NextResponse {
  if (!rawText) {
    const msg = "Gemini ไม่ตอบเนื้อหากลับมา (อาจโดน safety filter)";
    after(() => logReviewFailure({ sourceKind: source.kind, sourceLabel: source.label, model: usedModel, errorMessage: msg }));
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawText);
  } catch {
    const msg = "Gemini ตอบกลับไม่ใช่ JSON ที่ parse ได้";
    after(() => logReviewFailure({ sourceKind: source.kind, sourceLabel: source.label, model: usedModel, errorMessage: msg }));
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  const parsedReview = ReviewSchema.safeParse(parsedJson);
  if (!parsedReview.success) {
    const msg = "Gemini ตอบกลับในรูปแบบที่ไม่ตรง schema";
    after(() => logReviewFailure({ sourceKind: source.kind, sourceLabel: source.label, model: usedModel, errorMessage: msg }));
    return NextResponse.json({ error: msg, detail: parsedReview.error.flatten() }, { status: 502 });
  }

  const review = parsedReview.data;
  const order: Record<(typeof review.issues)[number]["severity"], number> = {
    critical: 0,
    warning: 1,
    optimization: 2,
  };
  review.issues.sort((a, b) => order[a.severity] - order[b.severity]);
  return review;
}

/** แปลง ApiError (จาก @google/genai) เป็น response ที่เหมาะสม — แยก retryable (429/5xx) จาก non-retryable (401/403) */
function buildApiErrorResponse(error: ApiError, params: { userApiKey?: string; source: Source; model: GeminiModelId }): NextResponse {
  const { userApiKey, source, model } = params;

  // Gemini ตอบ invalid key เป็น HTTP 400 + "API_KEY_INVALID" ในตัว message (ไม่ใช่ 401/403 ตรง ๆ
  // แบบผู้ให้บริการอื่น) จึงต้องเช็คข้อความประกอบ ไม่ใช่แค่ status code
  if (error.status === 401 || error.status === 403 || /API_KEY_INVALID|API key not valid/i.test(error.message)) {
    const msg = userApiKey
      ? "API Key ที่คุณกรอกไว้ไม่ถูกต้อง — ตรวจสอบอีกครั้งที่ช่อง API Key ด้านบน"
      : "GEMINI_API_KEY ของ server ไม่ถูกต้องหรือยังไม่ได้ตั้งค่า";
    return NextResponse.json({ error: msg }, { status: 401 });
  }
  if (error.status === 429) {
    return NextResponse.json(
      { error: "ชน rate limit / โควตา Free Tier ของ Gemini — รอสักครู่แล้วลองใหม่ หรือลดขนาด diff" },
      { status: 429 },
    );
  }
  if (error.status === 503 || error.status === 500) {
    // ไม่มีโมเดลสำรองให้ลอง (getFallbackModel คืนโมเดลเดิม) หรือ retry ในตัวหมดไปแล้ว
    const msg = `เซิร์ฟเวอร์ Gemini กำลังโหลดสูง (ไม่เกี่ยวกับโควตาของคุณ) — ${extractGeminiMessage(error.message)} ลองกด Review อีกครั้งใน 10-20 วินาที`;
    after(() => logReviewFailure({ sourceKind: source.kind, sourceLabel: source.label, model, errorMessage: msg }));
    return NextResponse.json({ error: msg }, { status: 503 });
  }
  // 401/403 (key ผิด) และ 429 (rate limit) ไม่นับเป็น "analysis failed" — เป็น request error
  // ของผู้ใช้ ไม่เกี่ยวกับการวิเคราะห์โค้ดจริง เลยไม่บันทึกลง history log
  return NextResponse.json(
    { error: `Gemini API error ${error.status}: ${extractGeminiMessage(error.message)}` },
    { status: error.status >= 500 ? 502 : 400 },
  );
}

export async function POST(request: Request) {
  const keyCheck = requireApiKey(request);
  if (keyCheck instanceof NextResponse) return keyCheck;
  const { userApiKey } = keyCheck;

  let body: ReviewRequest;
  try {
    body = (await request.json()) as ReviewRequest;
  } catch {
    return NextResponse.json({ error: "body ต้องเป็น JSON" }, { status: 400 });
  }

  const model = isValidModel(body.model) ? body.model : DEFAULT_MODEL;

  const inputResult = await prepareInput(body);
  if (inputResult instanceof NextResponse) return inputResult;
  const { prepared, source, commitSha } = inputResult;

  if (!prepared.content.trim()) {
    return NextResponse.json(
      {
        error:
          "ไม่มีไฟล์ Node.js ให้ review — ไฟล์ทั้งหมดถูกกรองออก (lockfile / docs / assets / build output)",
        filterStats: prepared.stats,
      },
      { status: 422 },
    );
  }

  try {
    const callOutcome = await callGeminiWithFallback({ model, userApiKey, prepared, source });
    if (callOutcome instanceof NextResponse) return callOutcome;
    const { response, usedModel, fallbackUsed } = callOutcome;

    const reviewResult = parseGeminiReview(response.text, source, usedModel);
    if (reviewResult instanceof NextResponse) return reviewResult;

    const result: ReviewResponse = {
      review: reviewResult,
      usage: estimateUsage(usedModel, response.usageMetadata ?? {}),
      filterStats: prepared.stats,
      source,
      model: usedModel,
      requestedModel: model,
      fallbackUsed,
    };

    // บันทึก history log หลังตอบ response แล้ว (ไม่ทำให้ user รอนานขึ้น, ไม่ทำให้ flow หลักพังถ้า log พลาด)
    after(() =>
      logReviewResult({
        sourceKind: source.kind,
        sourceLabel: source.label,
        model: usedModel,
        result,
        filesReviewed: prepared.files.map((f) => f.path),
        commitSha,
      }),
    );

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ApiError) return buildApiErrorResponse(error, { userApiKey, source, model });

    const message = error instanceof Error ? error.message : "review ล้มเหลว";
    after(() => logReviewFailure({ sourceKind: source.kind, sourceLabel: source.label, model, errorMessage: message }));
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
