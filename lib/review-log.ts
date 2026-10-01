import { Prisma, type LogSeverity, type LogStatus } from "@prisma/client";
import { prisma } from "./prisma";
import type { ReviewResponse } from "./types";

const SEVERITY_RANK: Record<"critical" | "warning" | "optimization", number> = {
  critical: 3,
  warning: 2,
  optimization: 1,
};

/** severity ของทั้ง log = severity สูงสุดในบรรดา issues ที่เจอ, "passed" ถ้าไม่เจอ issue เลย */
function overallSeverity(review: ReviewResponse["review"]): LogSeverity {
  if (review.issues.length === 0) return "passed";
  let worst: "critical" | "warning" | "optimization" = "optimization";
  for (const issue of review.issues) {
    if (SEVERITY_RANK[issue.severity] > SEVERITY_RANK[worst]) worst = issue.severity;
  }
  return worst;
}

/**
 * บันทึกผล review ลง history log — เรียกแบบ "fire and forget" หลังส่ง response ให้ user แล้ว
 * (ตาม constraint: ห้ามทำให้ flow การ review หลักช้าลงหรือพังเพราะ log พลาด)
 */
export async function logReviewResult(params: {
  sourceKind: string;
  sourceLabel: string;
  model: string;
  result: ReviewResponse;
}): Promise<void> {
  const { sourceKind, sourceLabel, model, result } = params;
  const severity = overallSeverity(result.review);
  const clean = result.review.issues.length === 0;
  try {
    await prisma.reviewLog.create({
      data: {
        sourceKind,
        sourceLabel,
        model,
        issuesFoundCount: result.review.issues.length,
        severity,
        // ไม่พบปัญหาเลย -> ถือว่า "แก้ไขแล้ว" ตั้งแต่ต้น ไม่มีอะไรต้องตามแก้
        status: clean ? "RESOLVED" : "FLAGGED",
        fullReviewOutput: result as unknown as Prisma.InputJsonValue,
      },
    });

    // auto-resolve: รีวิว PR/MR เดิม (sourceLabel ตรงกัน) ซ้ำแล้วรอบนี้ "ผ่าน" จริง (ไม่เจอปัญหาเลย)
    // -> ถือว่า log เก่าที่ยังเป็น FLAGGED ของ PR/MR เดียวกันถูกแก้ไขแล้วจริง เปลี่ยนเป็น RESOLVED ให้เอง
    // ไม่ทำกับ sourceKind "paste" เพราะ sourceLabel เป็นค่าคงที่ ("pasted code") ไม่ได้ระบุตัวตนโค้ด
    // จริง ๆ ได้ จับคู่กันไม่ได้ว่า "โค้ดเดิม" จริงไหม
    if (clean && sourceKind !== "paste") {
      await prisma.reviewLog.updateMany({
        where: { sourceKind, sourceLabel, status: "FLAGGED" },
        data: { status: "RESOLVED" },
      });
    }
  } catch (err) {
    // การบันทึก log ต้องไม่ทำให้ flow หลักพัง — log error ไว้เฉย ๆ พอ
    console.error("[review-log] บันทึก log ไม่สำเร็จ:", err);
  }
}

/** บันทึกกรณี Gemini error/timeout ระหว่างวิเคราะห์ — ไม่มีผลตรวจให้เก็บ */
export async function logReviewFailure(params: {
  sourceKind: string;
  sourceLabel: string;
  model: string;
  errorMessage: string;
}): Promise<void> {
  const { sourceKind, sourceLabel, model, errorMessage } = params;
  try {
    await prisma.reviewLog.create({
      data: {
        sourceKind,
        sourceLabel,
        model,
        issuesFoundCount: 0,
        severity: "passed", // ไม่มีความหมายตอน FAILED แต่ field เป็น required เลยใส่ค่ากลาง ๆ ไว้
        status: "FAILED",
        fullReviewOutput: Prisma.JsonNull,
        errorMessage: errorMessage.slice(0, 2000),
      },
    });
  } catch (err) {
    console.error("[review-log] บันทึก failure log ไม่สำเร็จ:", err);
  }
}

export type ListLogsFilter = {
  status?: LogStatus;
  from?: Date;
  to?: Date;
  page?: number;
  pageSize?: number;
};

export async function listReviewLogs(filter: ListLogsFilter) {
  const page = Math.max(1, filter.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filter.pageSize ?? 20));

  const where: Prisma.ReviewLogWhereInput = {
    ...(filter.status ? { status: filter.status } : {}),
    ...(filter.from || filter.to
      ? {
          createdAt: {
            ...(filter.from ? { gte: filter.from } : {}),
            ...(filter.to ? { lte: filter.to } : {}),
          },
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.reviewLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      // ไม่ดึง fullReviewOutput ในหน้ารายการ (อาจหนักหลาย KB ต่อแถว) — ดึงเฉพาะตอนเปิดดูรายละเอียด
      select: {
        id: true,
        createdAt: true,
        updatedAt: true,
        sourceKind: true,
        sourceLabel: true,
        model: true,
        issuesFoundCount: true,
        severity: true,
        status: true,
        errorMessage: true,
      },
    }),
    prisma.reviewLog.count({ where }),
  ]);

  return { items, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function getReviewLog(id: string) {
  return prisma.reviewLog.findUnique({ where: { id } });
}

// ตั้งใจไม่มีฟังก์ชันแก้ status เองแบบ manual (เช่น updateReviewLogStatus) แล้ว — สถานะ RESOLVED
// เปลี่ยนได้ทางเดียวคือรีวิว PR/MR เดิมซ้ำแล้วผ่านจริง (ดู auto-resolve ใน logReviewResult ด้านบน)
// กันคนกดมั่ว/มโนว่าแก้แล้วทั้งที่ไม่ได้ verify จริง
