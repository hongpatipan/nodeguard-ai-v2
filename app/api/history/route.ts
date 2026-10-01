import { NextResponse } from "next/server";
import type { LogStatus } from "@prisma/client";

import { listReviewLogs } from "@/lib/review-log";

export const runtime = "nodejs";

const VALID_STATUSES: LogStatus[] = ["FLAGGED", "RESOLVED", "FAILED"];

function isValidStatus(v: string | null): v is LogStatus {
  return v !== null && (VALID_STATUSES as string[]).includes(v);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const statusParam = searchParams.get("status");
  const status = isValidStatus(statusParam) ? statusParam : undefined;

  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");
  const from = fromParam ? new Date(fromParam) : undefined;
  const to = toParam ? new Date(toParam) : undefined;
  if ((fromParam && Number.isNaN(from?.getTime())) || (toParam && Number.isNaN(to?.getTime()))) {
    return NextResponse.json({ error: "from/to ต้องเป็นวันที่ที่ถูกต้อง (YYYY-MM-DD)" }, { status: 400 });
  }
  // "to" เป็น date เฉยๆ (ไม่มีเวลา) — ขยายให้ครอบคลุมทั้งวันนั้น ไม่ใช่แค่เที่ยงคืนเป๊ะ
  if (to) to.setHours(23, 59, 59, 999);

  const page = Number(searchParams.get("page") ?? "1");
  const pageSize = Number(searchParams.get("pageSize") ?? "20");

  try {
    const result = await listReviewLogs({
      status,
      from,
      to,
      page: Number.isFinite(page) ? page : 1,
      pageSize: Number.isFinite(pageSize) ? pageSize : 20,
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "โหลดประวัติไม่สำเร็จ";
    return NextResponse.json(
      { error: `โหลดประวัติไม่สำเร็จ — เช็คว่าตั้งค่า DATABASE_URL และรัน migration แล้ว (${message})` },
      { status: 500 },
    );
  }
}
