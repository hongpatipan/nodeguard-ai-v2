/**
 * ราคา pay-as-you-go ของ Gemini API (ต่อ 1M token, USD) — ใช้ "ประมาณ" ค่าใช้จ่าย
 * เผื่อโควตา Free Tier หมด ไม่ใช่ตัวเลขบิลจริง ราคาจริงเช็คได้ที่ ai.google.dev/pricing
 *
 * Free Tier ของ Google AI Studio (ใช้ API key จาก aistudio.google.com) ไม่คิดเงินอยู่แล้ว
 * ตราบใดที่ไม่เกิน rate limit ต่อนาที — badge จึงโชว์ทั้ง token ที่ใช้และค่าประมาณควบกัน
 */
export type ModelPricing = { input: number; output: number; label: string };

export const GEMINI_PRICING: Record<string, ModelPricing> = {
  // ราคา intro ถึงสิ้นปี 2026 — ตั้งแต่ 1 ม.ค. 2027 ขึ้นเป็น $1.50 / $7.50 ต่อ 1M token
  "gemini-3.8-flash": { input: 0.75, output: 3.75, label: "Gemini 3.8 Flash" },
  // ราคาช่วง prompt <=200k token — เกินจากนี้ขึ้นเป็น $4.00 / $18.00
  "gemini-3.1-pro-preview": { input: 2.0, output: 12.0, label: "Gemini 3.1 Pro" },
  // รุ่นเก่าที่ถูกปิดสำหรับโปรเจกต์ใหม่แล้ว — เก็บไว้เผื่อ request เดิมยังส่ง id นี้มา
  "gemini-2.5-flash": { input: 0.3, output: 2.5, label: "Gemini 2.5 Flash (deprecated)" },
  "gemini-2.5-pro": { input: 1.25, output: 10.0, label: "Gemini 2.5 Pro (deprecated)" },
};

export type UsageMetadataLike = {
  promptTokenCount?: number | null;
  candidatesTokenCount?: number | null;
  totalTokenCount?: number | null;
  cachedContentTokenCount?: number | null;
  thoughtsTokenCount?: number | null;
};

export type UsageBreakdown = {
  model: string;
  modelLabel: string;
  promptTokens: number;
  outputTokens: number;
  thoughtsTokens: number;
  cachedTokens: number;
  totalTokens: number;
  estimatedCost: number;
  /** true เมื่อ prefix บางส่วนถูก implicit cache ของ Gemini 2.5 ดักไว้ (ลด token ที่คิดเงินจริง) */
  cacheHit: boolean;
};

export function estimateUsage(model: string, usage: UsageMetadataLike): UsageBreakdown {
  const pricing = GEMINI_PRICING[model] ?? GEMINI_PRICING["gemini-3.8-flash"];
  const promptTokens = usage.promptTokenCount ?? 0;
  const outputTokens = usage.candidatesTokenCount ?? 0;
  const thoughtsTokens = usage.thoughtsTokenCount ?? 0;
  const cachedTokens = usage.cachedContentTokenCount ?? 0;
  const totalTokens = usage.totalTokenCount ?? promptTokens + outputTokens + thoughtsTokens;

  const per = (tokens: number, rate: number) => (tokens / 1_000_000) * rate;
  const estimatedCost = per(promptTokens, pricing.input) + per(outputTokens + thoughtsTokens, pricing.output);

  return {
    model,
    modelLabel: pricing.label,
    promptTokens,
    outputTokens,
    thoughtsTokens,
    cachedTokens,
    totalTokens,
    estimatedCost,
    cacheHit: cachedTokens > 0,
  };
}

export function formatUsd(value: number): string {
  if (value === 0) return "$0.0000 (Free Tier)";
  if (value < 0.0001) return "<$0.0001";
  return `$${value.toFixed(4)}`;
}
