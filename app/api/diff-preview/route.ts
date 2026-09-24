import { NextResponse } from "next/server";
import { filterNodeDiff } from "@/lib/node-diff-filter";
import { fetchDiffFromUrl } from "@/lib/vcs";

export const runtime = "nodejs";

/** preview: ดึง diff + กรองไฟล์ ให้ผู้ใช้เห็นก่อนว่าจะส่งอะไรให้ AI (ยังไม่เรียก Gemini) — รองรับทั้ง GitHub PR และ GitLab MR */
export async function POST(request: Request) {
  try {
    const { url } = (await request.json()) as { url?: string };
    if (!url?.trim()) {
      return NextResponse.json({ error: "ต้องส่ง url" }, { status: 400 });
    }

    const result = await fetchDiffFromUrl(url);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    const maxChars = Number(process.env.MAX_DIFF_CHARS ?? 60_000);
    const filtered = filterNodeDiff(result.diff, { maxChars });

    return NextResponse.json({ label: result.source.label, stats: filtered.stats, preview: filtered.content.slice(0, 4000) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ดึง diff ไม่สำเร็จ";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
