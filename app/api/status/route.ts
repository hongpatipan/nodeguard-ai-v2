import { NextResponse } from "next/server";
import { DEFAULT_MODEL } from "@/lib/gemini-models";

export const runtime = "nodejs";

/**
 * เช็คสถานะฝั่ง server สำหรับหน้า Dashboard — คืนแค่ boolean ว่ามีตัวแปรตั้งไว้หรือไม่ ไม่คืนค่าจริง
 * ของ token/key ใด ๆ ออกไปเด็ดขาด (แม้แต่บางส่วน) เพื่อไม่ให้หลุดไปฝั่ง client
 */
export async function GET() {
  return NextResponse.json({
    hasServerKey: Boolean(process.env.GEMINI_API_KEY?.trim()),
    hasGithubToken: Boolean(process.env.GITHUB_TOKEN?.trim()),
    hasGitlabToken: Boolean(process.env.GITLAB_TOKEN?.trim()),
    defaultModel: DEFAULT_MODEL,
    maxDiffChars: Number(process.env.MAX_DIFF_CHARS ?? 60_000),
  });
}
