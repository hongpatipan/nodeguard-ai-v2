/**
 * โมเดลที่เปิดให้เลือกในหน้าเว็บ — จำกัดเฉพาะ 2 ตัวตามที่ scope ต้องการ
 *
 * หมายเหตุ: Google เปลี่ยน/เลิกใช้โมเดล Gemini บ่อยกว่าที่คิด (gemini-2.5-flash ถูกปิดสำหรับ
 * โปรเจกต์ใหม่ไปแล้วตอนที่เขียนไฟล์นี้ — ถ้าเจอ error 404 "no longer available" ให้เช็ครายการ
 * โมเดลปัจจุบันที่ ai.google.dev/gemini-api/docs/models แล้วแก้ id ด้านล่างนี้ตรง ๆ)
 */
export type GeminiModelId = "gemini-3.8-flash" | "gemini-3.1-pro-preview";

export const GEMINI_MODELS: { id: GeminiModelId; label: string; hint: string }[] = [
  { id: "gemini-3.8-flash", label: "Gemini 3.8 Flash", hint: "เร็ว · เข้า Free Tier ได้ (โควตาจำกัด เช็คล่าสุดที่ ai.google.dev)" },
  { id: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro", hint: "วิเคราะห์ลึกกว่า · ราคา pay-as-you-go สูงกว่า Flash" },
];

export function isValidModel(id: unknown): id is GeminiModelId {
  return typeof id === "string" && GEMINI_MODELS.some((m) => m.id === id);
}

export const DEFAULT_MODEL: GeminiModelId =
  (process.env.GEMINI_DEFAULT_MODEL as GeminiModelId | undefined) &&
  isValidModel(process.env.GEMINI_DEFAULT_MODEL)
    ? (process.env.GEMINI_DEFAULT_MODEL as GeminiModelId)
    : "gemini-3.8-flash";

/**
 * โมเดลใหม่ (โดยเฉพาะ Flash รุ่นล่าสุด) มักโดน Free Tier จำกัด capacity หนักช่วงแรกหลังเปิดตัว
 * เพราะ Google ให้ priority กับ paid traffic ก่อนตอน demand สูง — ถ้า retry บนโมเดลเดิมแล้วยัง 503
 * ต่อเนื่อง ให้ลองสลับไปโมเดลอีกตัวในลิสต์แทน (Flash <-> Pro ใช้ capacity pool คนละก้อนกัน)
 */
export function getFallbackModel(model: GeminiModelId): GeminiModelId {
  const other = GEMINI_MODELS.find((m) => m.id !== model);
  return other?.id ?? model;
}
