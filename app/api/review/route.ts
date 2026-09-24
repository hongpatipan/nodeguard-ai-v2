import { NextResponse } from "next/server";

import { ApiError, extractGeminiMessage, generateContentWithRetry, getGeminiClient } from "@/lib/gemini-client";
import { DEFAULT_MODEL, getFallbackModel, isValidModel, type GeminiModelId } from "@/lib/gemini-models";
import { fetchDiffFromUrl } from "@/lib/vcs";
import { REVIEW_RESPONSE_SCHEMA } from "@/lib/gemini-schema";
import { filterNodeDiff, prepareReviewInput, type FilterResult } from "@/lib/node-diff-filter";
import { estimateUsage } from "@/lib/gemini-pricing";
import { NODE_REVIEW_SYSTEM_INSTRUCTION, buildUserMessage } from "@/lib/prompts";
import { ReviewSchema } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_DIFF_CHARS = Number(process.env.MAX_DIFF_CHARS ?? 60_000);

type ReviewRequest = { url?: string; code?: string; model?: string };

function isTransientApiError(error: unknown): error is ApiError {
  return error instanceof ApiError && (error.status === 503 || error.status === 500);
}

export async function POST(request: Request) {
  // key ส่วนตัวจากหน้าเว็บ (BYOK) มาก่อนเสมอ ถ้าไม่มีค่อย fallback ไป key กลางของ server
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

  let body: ReviewRequest;
  try {
    body = (await request.json()) as ReviewRequest;
  } catch {
    return NextResponse.json({ error: "body ต้องเป็น JSON" }, { status: 400 });
  }

  const model = isValidModel(body.model) ? body.model : DEFAULT_MODEL;

  // ---- 1. เตรียม input: GitHub PR หรือโค้ดที่วางมา ----
  let prepared: FilterResult;
  let source: { kind: "github" | "gitlab" | "paste"; label: string };

  try {
    if (body.url?.trim()) {
      const result = await fetchDiffFromUrl(body.url);
      if ("error" in result) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      prepared = filterNodeDiff(result.diff, { maxChars: MAX_DIFF_CHARS });
      source = result.source;
    } else if (body.code?.trim()) {
      prepared = prepareReviewInput(body.code, { maxChars: MAX_DIFF_CHARS });
      source = { kind: "paste", label: "pasted code / diff" };
    } else {
      return NextResponse.json({ error: "ต้องส่ง url หรือ code อย่างใดอย่างหนึ่ง" }, { status: 400 });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "เตรียม input ไม่สำเร็จ";
    return NextResponse.json({ error: message }, { status: 502 });
  }

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

  // ---- 2. เรียก Gemini พร้อม structured JSON output ----
  let usedModel: GeminiModelId = model;
  let fallbackUsed = false;

  try {
    let response;
    try {
      response = await callModel(model);
    } catch (error) {
      // โมเดลหลัก retry ในตัวจนหมดแล้วยัง 503/500 (โหลดสูงต่อเนื่องจริง) — ลองสลับไปอีกโมเดลในลิสต์
      // ก่อนยอมแพ้ เพราะ Flash/Pro แยก capacity pool กันคนละก้อน มักไม่ล่มพร้อมกัน
      if (!isTransientApiError(error)) throw error;

      const fallbackModel = getFallbackModel(model);
      if (fallbackModel === model) throw error; // ไม่มีโมเดลอื่นให้ลอง

      try {
        response = await callModel(fallbackModel, { retries: 2, baseDelayMs: 2000 });
        usedModel = fallbackModel;
        fallbackUsed = true;
      } catch (fallbackError) {
        if (isTransientApiError(fallbackError)) {
          return NextResponse.json(
            {
              error: `เซิร์ฟเวอร์ Gemini โหลดสูงทั้ง ${model} และ ${fallbackModel} — ลองทั้งสองโมเดลแล้วไม่สำเร็จ รอสักครู่แล้วลองใหม่`,
            },
            { status: 503 },
          );
        }
        throw fallbackError; // error คนละแบบ (เช่น key ผิด) — ให้ catch ข้างนอกจัดการตามปกติ
      }
    }

    const rawText = response.text;
    if (!rawText) {
      return NextResponse.json({ error: "Gemini ไม่ตอบเนื้อหากลับมา (อาจโดน safety filter)" }, { status: 502 });
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(rawText);
    } catch {
      return NextResponse.json({ error: "Gemini ตอบกลับไม่ใช่ JSON ที่ parse ได้" }, { status: 502 });
    }

    const parsedReview = ReviewSchema.safeParse(parsedJson);
    if (!parsedReview.success) {
      return NextResponse.json(
        { error: "Gemini ตอบกลับในรูปแบบที่ไม่ตรง schema", detail: parsedReview.error.flatten() },
        { status: 502 },
      );
    }

    const review = parsedReview.data;
    // จัดลำดับความรุนแรงให้ UI ไม่ต้องเรียงเอง
    const order: Record<(typeof review.issues)[number]["severity"], number> = {
      critical: 0,
      warning: 1,
      optimization: 2,
    };
    review.issues.sort((a, b) => order[a.severity] - order[b.severity]);

    return NextResponse.json({
      review,
      usage: estimateUsage(usedModel, response.usageMetadata ?? {}),
      filterStats: prepared.stats,
      source,
      model: usedModel,
      requestedModel: model,
      fallbackUsed,
    });
  } catch (error) {
    // ApiError (จาก @google/genai) มี .status ให้แยก retryable (429/5xx) ออกจาก non-retryable (401/403) ได้ตรง ๆ
    if (error instanceof ApiError) {
      // Gemini ตอบ invalid key เป็น HTTP 400 + "API_KEY_INVALID" ในตัว message (ไม่ใช่ 401/403
      // ตรง ๆ แบบผู้ให้บริการอื่น) จึงต้องเช็คข้อความประกอบ ไม่ใช่แค่ status code
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
        return NextResponse.json(
          {
            error: `เซิร์ฟเวอร์ Gemini กำลังโหลดสูง (ไม่เกี่ยวกับโควตาของคุณ) — ${extractGeminiMessage(error.message)} ลองกด Review อีกครั้งใน 10-20 วินาที`,
          },
          { status: 503 },
        );
      }
      return NextResponse.json(
        { error: `Gemini API error ${error.status}: ${extractGeminiMessage(error.message)}` },
        { status: error.status >= 500 ? 502 : 400 },
      );
    }

    const message = error instanceof Error ? error.message : "review ล้มเหลว";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
