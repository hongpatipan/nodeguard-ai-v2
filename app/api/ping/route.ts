import { NextResponse } from "next/server";
import { ApiError, extractGeminiMessage, getGeminiClient } from "@/lib/gemini-client";
import { DEFAULT_MODEL, isValidModel } from "@/lib/gemini-models";

export const runtime = "nodejs";

type PingRequest = { model?: string };

/**
 * ทดสอบว่า Gemini API Key ที่ใช้อยู่ (BYOK หรือ key กลางของ server) เชื่อมต่อได้จริงไหม
 * ใช้ models.get() แทน generateContent() — เป็น metadata call ที่ "ไม่กิน token" และไม่นับ
 * โควตา generation จึงกดทดสอบซ้ำได้เรื่อย ๆ โดยไม่กระทบ Free Tier
 */
export async function POST(request: Request) {
  const userApiKey = request.headers.get("x-gemini-api-key")?.trim() || undefined;

  if (!userApiKey && !process.env.GEMINI_API_KEY?.trim()) {
    return NextResponse.json({ ok: false, error: "ไม่มี Gemini API Key ให้ทดสอบ" });
  }

  let body: PingRequest = {};
  try {
    body = (await request.json()) as PingRequest;
  } catch {
    // body ว่างก็ได้ — ใช้ default model
  }
  const model = isValidModel(body.model) ? body.model : DEFAULT_MODEL;

  const startedAt = Date.now();
  try {
    const info = await getGeminiClient(userApiKey).models.get({ model });
    return NextResponse.json({
      ok: true,
      model: info.name ?? model,
      displayName: info.displayName ?? null,
      inputTokenLimit: info.inputTokenLimit ?? null,
      outputTokenLimit: info.outputTokenLimit ?? null,
      latencyMs: Date.now() - startedAt,
      usedKey: userApiKey ? "byok" : "server",
    });
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json({ ok: false, error: extractGeminiMessage(error.message), status: error.status });
    }
    const message = error instanceof Error ? error.message : "ping ไม่สำเร็จ";
    return NextResponse.json({ ok: false, error: message });
  }
}
