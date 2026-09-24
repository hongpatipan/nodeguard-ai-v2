import { z } from "zod";

export const SEVERITIES = ["critical", "warning", "optimization"] as const;
export const CATEGORIES = [
  "event-loop-blocking",
  "memory-leak-async",
  "database-io",
  "security-error-handling",
] as const;

export const IssueSchema = z.object({
  severity: z.enum(SEVERITIES),
  category: z.enum(CATEGORIES),
  file: z.string(),
  line: z.number().int(),
  title: z.string(),
  problem: z.string(),
  impact: z.string(),
  before: z.string(),
  after: z.string(),
});

export const ReviewSchema = z.object({
  summary: z.string(),
  verdict: z.enum(["block", "needs-work", "approve"]),
  issues: z.array(IssueSchema),
});

export type Issue = z.infer<typeof IssueSchema>;
export type Review = z.infer<typeof ReviewSchema>;

export type ReviewResponse = {
  review: Review;
  usage: import("./gemini-pricing").UsageBreakdown;
  filterStats: import("./node-diff-filter").FilterStats;
  source: { kind: "github" | "gitlab" | "paste"; label: string };
  /** โมเดลที่ใช้จริง (อาจไม่ตรงกับที่ผู้ใช้เลือกถ้าโดน fallback ตอนโมเดลหลักโหลดสูง) */
  model: string;
  /** โมเดลที่ผู้ใช้เลือกไว้ตอนแรก — ต่างจาก model เมื่อ fallbackUsed เป็น true เท่านั้น */
  requestedModel: string;
  fallbackUsed: boolean;
};

export const CATEGORY_LABELS: Record<(typeof CATEGORIES)[number], string> = {
  "event-loop-blocking": "Event Loop Blocking",
  "memory-leak-async": "Memory Leaks & Async",
  "database-io": "Database & I/O",
  "security-error-handling": "Security & Error Handling",
};
