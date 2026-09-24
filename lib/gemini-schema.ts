import { Type } from "@google/genai";
import { CATEGORIES, SEVERITIES } from "./types";

/**
 * Gemini responseSchema — รูปแบบ subset ของ OpenAPI schema ที่ SDK ต้องการ (ไม่ใช่ zod schema ตรง ๆ)
 * ใช้คู่กับ responseMimeType: "application/json" เพื่อบังคับให้ตอบเป็น JSON ตาม shape นี้เสมอ
 * ผลที่ได้ยัง validate ซ้ำด้วย zod (lib/types.ts) อีกชั้นก่อนส่งกลับ client
 */
const issueSchema = {
  type: Type.OBJECT,
  properties: {
    severity: { type: Type.STRING, enum: [...SEVERITIES] },
    category: { type: Type.STRING, enum: [...CATEGORIES] },
    file: { type: Type.STRING, description: "path ของไฟล์ตามที่ปรากฏใน diff (ตรงกับ '--- FILE:')" },
    line: { type: Type.INTEGER, description: "เลขบรรทัดฝั่งใหม่ที่พบปัญหา ใส่ 0 ถ้าไม่แน่ใจ" },
    title: { type: Type.STRING, description: "สรุปปัญหาสั้น ๆ ไม่เกิน 12 คำ" },
    problem: { type: Type.STRING, description: "อธิบายว่าทำไมโค้ดนี้เป็นปัญหาเฉพาะกับ Node.js runtime" },
    impact: { type: Type.STRING, description: "ผลกระทบตอน production" },
    before: { type: Type.STRING, description: "โค้ดเดิมที่มีปัญหา" },
    after: { type: Type.STRING, description: "โค้ดที่แก้แล้ว พร้อมใช้งานจริง" },
  },
  required: ["severity", "category", "file", "line", "title", "problem", "impact", "before", "after"],
  propertyOrdering: ["severity", "category", "file", "line", "title", "problem", "impact", "before", "after"],
};

export const REVIEW_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    summary: { type: Type.STRING, description: "สรุปภาพรวมของ diff นี้ 1-3 ประโยค" },
    verdict: { type: Type.STRING, enum: ["block", "needs-work", "approve"] },
    issues: { type: Type.ARRAY, items: issueSchema },
  },
  required: ["summary", "verdict", "issues"],
  propertyOrdering: ["summary", "verdict", "issues"],
};
