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
 * ตัด "#123" (github) หรือ "!45" (gitlab) ออกจาก sourceLabel เหลือแค่ตัวตน repo
 * ("owner/repo" / "group/project") — ใช้จับคู่ auto-resolve ข้าม PR/MR คนละใบได้ (เช่น PR เก่า
 * merge ไปแล้ว แต่แก้จริงใน PR ใหม่) คืน null ถ้าเป็น "paste" หรือ parse ไม่ได้ (ไม่มี repo ให้จับคู่)
 */
function extractRepoKey(sourceKind: string, sourceLabel: string): string | null {
  const sep = sourceKind === "github" ? "#" : sourceKind === "gitlab" ? "!" : null;
  if (!sep) return null;
  const idx = sourceLabel.indexOf(sep);
  return idx === -1 ? null : sourceLabel.slice(0, idx);
}

/**
 * บันทึกผล review ลง history log — เรียกแบบ "fire and forget" หลังส่ง response ให้ user แล้ว
 * (ตาม constraint: ห้ามทำให้ flow การ review หลักช้าลงหรือพังเพราะ log พลาด)
 *
 * filesReviewed = ไฟล์ทั้งหมดที่ถูกสแกนรอบนี้ (ไม่ใช่แค่ไฟล์ที่เจอปัญหา) จำเป็นสำหรับ auto-resolve
 * เพราะต้องรู้ว่าไฟล์ไหน "ถูกตรวจซ้ำแล้วจริง" ไม่ใช่แค่ไม่ได้อยู่ใน diff รอบนี้เฉย ๆ
 */
export async function logReviewResult(params: {
  sourceKind: string;
  sourceLabel: string;
  model: string;
  result: ReviewResponse;
  filesReviewed: string[];
  /** commit SHA ของโค้ดที่ตรวจ (PR/MR เท่านั้น) — ใช้กันซ้ำตอนสแกนรัว ๆ บนโค้ดชุดเดียวกัน */
  commitSha?: string;
}): Promise<void> {
  const { sourceKind, sourceLabel, model, result, filesReviewed, commitSha } = params;
  const severity = overallSeverity(result.review);
  const clean = result.review.issues.length === 0;
  const flaggedFiles = [...new Set(result.review.issues.map((i) => i.file))];
  const repoKey = extractRepoKey(sourceKind, sourceLabel);

  try {
    // กันซ้ำ: ถ้าเคยสแกน repo+PR+commit+model ชุดนี้เป๊ะมาก่อนแล้ว (กดซ้ำโดยโค้ดไม่เปลี่ยนเลย)
    // ไม่สร้างแถวใหม่ แค่นับเพิ่มในแถวเดิม — แม่นยำ 100% เพราะเทียบ commit SHA ตรง ๆ ไม่ใช่เทียบว่า
    // "ปัญหาหน้าตาเหมือนกันไหม" ซึ่งกำกวมกว่า ไม่ทำกับ paste เพราะไม่มี commit SHA ให้เทียบ
    if (repoKey && commitSha) {
      const existing = await prisma.reviewLog.findFirst({
        where: { repoKey, sourceLabel, commitSha, model },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });
      if (existing) {
        await prisma.reviewLog.update({
          where: { id: existing.id },
          data: { scanCount: { increment: 1 }, updatedAt: new Date() },
        });
        return; // โค้ดชุดนี้เคย resolve ไปแล้วหรือยัง ก็ตัดสินใจไปแล้วตอนสแกนครั้งแรก ไม่ต้องทำซ้ำ
      }
    }

    await prisma.reviewLog.create({
      data: {
        sourceKind,
        sourceLabel,
        repoKey,
        commitSha,
        model,
        issuesFoundCount: result.review.issues.length,
        severity,
        // ไม่พบปัญหาเลย -> ถือว่า "แก้ไขแล้ว" ตั้งแต่ต้น ไม่มีอะไรต้องตามแก้
        status: clean ? "RESOLVED" : "FLAGGED",
        filesReviewed,
        flaggedFiles,
        fullReviewOutput: result as unknown as Prisma.InputJsonValue,
      },
    });

    // auto-resolve ระดับไฟล์: ไม่สนใจว่าเป็น PR/MR ใบเดิมหรือเปล่า จับคู่ด้วย "repo เดียวกัน +
    // ไฟล์ที่เคยมีปัญหา ถูกรีวิวซ้ำรอบนี้แล้วไม่มีปัญหาแล้วจริง" เท่านั้น — แก้ปัญหา PR เก่าที่ merge
    // ไปแล้ว (แก้จริงใน PR ใหม่คนละใบ) ให้ resolve ได้ด้วย ไม่ต้องรีวิว URL เดิมซ้ำอีกต่อไป
    if (repoKey) {
      const cleanFilesThisRun = filesReviewed.filter((f) => !flaggedFiles.includes(f));
      if (cleanFilesThisRun.length > 0) {
        const candidates = await prisma.reviewLog.findMany({
          where: { repoKey, status: "FLAGGED" },
          select: { id: true, flaggedFiles: true },
        });
        // resolve ได้ก็ต่อเมื่อ "ทุกไฟล์" ที่เคยมีปัญหาในแถวนั้นถูกยืนยันว่าสะอาดแล้วทั้งหมด
        // (ไม่ใช่แค่บางไฟล์ — กันการ resolve ทั้งก้อนทั้งที่ยังมีไฟล์อื่นในแถวเดียวกันไม่ได้แก้)
        const idsToResolve = candidates
          .filter((c) => c.flaggedFiles.length > 0 && c.flaggedFiles.every((f) => cleanFilesThisRun.includes(f)))
          .map((c) => c.id);
        if (idsToResolve.length > 0) {
          await prisma.reviewLog.updateMany({ where: { id: { in: idsToResolve } }, data: { status: "RESOLVED" } });
        }
      }
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
        repoKey: extractRepoKey(sourceKind, sourceLabel),
        model,
        issuesFoundCount: 0,
        severity: "passed", // ไม่มีความหมายตอน FAILED แต่ field เป็น required เลยใส่ค่ากลาง ๆ ไว้
        status: "FAILED",
        filesReviewed: [],
        flaggedFiles: [],
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
        flaggedFiles: true,
        scanCount: true,
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
// เปลี่ยนได้ทางเดียวคือรีวิวไฟล์เดิม (repo เดียวกัน) ซ้ำแล้วผ่านจริง (ดู auto-resolve ด้านบน)
// กันคนกดมั่ว/มโนว่าแก้แล้วทั้งที่ไม่ได้ verify จริง
