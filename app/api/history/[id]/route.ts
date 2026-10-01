import { NextResponse } from "next/server";

import { getReviewLog } from "@/lib/review-log";

export const runtime = "nodejs";

// อ่านอย่างเดียว — ไม่มี PATCH แล้ว เพราะสถานะ RESOLVED เปลี่ยนได้ทางเดียวคือรีวิว PR/MR เดิม
// ซ้ำแล้วผ่านจริงเท่านั้น (ดู auto-resolve ใน lib/review-log.ts) ไม่เปิดให้แก้ status เองผ่าน API
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const log = await getReviewLog(id);
    if (!log) return NextResponse.json({ error: "ไม่พบ log นี้" }, { status: 404 });
    return NextResponse.json(log);
  } catch (error) {
    const message = error instanceof Error ? error.message : "โหลดรายละเอียดไม่สำเร็จ";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
