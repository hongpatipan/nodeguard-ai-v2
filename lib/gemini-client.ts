import { ApiError, GoogleGenAI } from "@google/genai";

export { ApiError };

// client เริ่มต้นจาก GEMINI_API_KEY ฝั่ง server — สร้างแบบ lazy ไม่งั้น `next build`
// จะพังถ้ายังไม่มี key ในเครื่องที่ build
let defaultClient: GoogleGenAI | null = null;

/**
 * เว็บนี้เป็นเว็บตัวกลางที่ทีมแชร์กัน แต่ละคนมี Gemini key ของตัวเอง (BYOK) — ถ้าผู้ใช้กรอก key
 * ไว้ในหน้าเว็บ (เก็บใน localStorage ฝั่ง browser) จะถูกส่งมาทาง header ต่อคำขอ ไม่ถูกเก็บถาวร
 * ที่ server ฝั่งนี้เลย ถ้าไม่ส่งมาจะ fallback ไปใช้ GEMINI_API_KEY กลางของ server
 */
export function getGeminiClient(userApiKey?: string): GoogleGenAI {
  if (userApiKey) return new GoogleGenAI({ apiKey: userApiKey });
  if (!defaultClient) defaultClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return defaultClient;
}

/**
 * ApiError.message จาก @google/genai คือ raw JSON body ทั้งก้อน (เช่น
 * `{"error":{"code":503,"message":"...","status":"UNAVAILABLE"}}`) ไม่ใช่แค่ข้อความล้วน —
 * ฟังก์ชันนี้พยายามดึงเฉพาะ .error.message ออกมาให้อ่านง่ายขึ้น ถ้า parse ไม่ได้ก็คืนของเดิม
 */
export function extractGeminiMessage(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as { error?: { message?: string } };
    return parsed.error?.message ?? raw;
  } catch {
    return raw;
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 503 (UNAVAILABLE) / 500 (INTERNAL) เป็น error ฝั่ง Google เอง ("high demand", "try again later")
 * ไม่เกี่ยวกับ quota ของผู้ใช้เลย — ลอง retry แบบ backoff สั้น ๆ ก่อนค่อยโยน error ให้ผู้ใช้เห็น
 * ไม่ retry 429 เพราะ Free Tier มักเป็นโควตา "ต่อวัน" ไม่ใช่ burst — retry รัว ๆ ไม่ช่วยและเสียเวลาเปล่า
 */
export async function generateContentWithRetry(
  client: GoogleGenAI,
  params: Parameters<GoogleGenAI["models"]["generateContent"]>[0],
  { retries = 4, baseDelayMs = 2000 } = {},
) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await client.models.generateContent(params);
    } catch (error) {
      const isTransient = error instanceof ApiError && (error.status === 503 || error.status === 500);
      if (!isTransient || attempt >= retries) throw error;
      await sleep(baseDelayMs * 2 ** attempt); // 2s, 4s, 8s, 16s (รวม ~30s) — ให้เวลา Google หายโหลดสูงมากขึ้น
    }
  }
}
