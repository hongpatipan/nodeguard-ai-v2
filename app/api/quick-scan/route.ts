import { NextResponse } from "next/server";

import { looksLikeDiff } from "@/lib/node-diff-filter";
import { buildQuickScanResponse } from "@/lib/static-scan";
import { fetchChangedFileContents } from "@/lib/vcs";

export const runtime = "nodejs";
// ไม่มี AI call เลย (แค่ fetch ไฟล์ + ESLint) ควรจบไวกว่า /api/review มาก ไม่ต้องรอ retry/fallback
export const maxDuration = 30;

type QuickScanRequest = { url?: string; code?: string };

// กันโค้ดที่วางมาใหญ่เกินจำเป็นทำให้ ESLint parse ช้า/กิน memory
const MAX_CODE_CHARS = 200_000;

export async function POST(request: Request) {
  let body: QuickScanRequest;
  try {
    body = (await request.json()) as QuickScanRequest;
  } catch {
    return NextResponse.json({ error: "body ต้องเป็น JSON" }, { status: 400 });
  }

  try {
    if (body.url?.trim()) {
      const result = await fetchChangedFileContents(body.url);
      if ("error" in result) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      if (result.files.length === 0) {
        return NextResponse.json(
          {
            error: "ไม่มีไฟล์ Node.js ให้สแกน — ไฟล์ทั้งหมดถูกกรองออก หรือดึงเนื้อหาไฟล์ไม่สำเร็จ",
            filterStats: { skippedFiles: result.skippedFiles, totalFiles: result.totalFiles },
          },
          { status: 422 },
        );
      }
      const response = buildQuickScanResponse(result.files, result.skippedFiles, result.source, result.totalFiles);
      return NextResponse.json(response);
    }

    if (body.code?.trim()) {
      // ESLint ต้อง parse syntax ให้ครบทั้งไฟล์ — diff hunk (มีแค่บรรทัด +/- พร้อม "…" คั่น) parse ไม่ผ่านแน่นอน
      if (looksLikeDiff(body.code)) {
        return NextResponse.json(
          {
            error:
              'Quick Scan ต้องการโค้ดเต็มไฟล์ ไม่ใช่ diff (ESLint ต้อง parse syntax ให้ครบ) — วางโค้ดทั้งไฟล์แทน หรือใช้แท็บ "PR / MR URL" ซึ่งดึงไฟล์เต็มให้อัตโนมัติ',
          },
          { status: 400 },
        );
      }
      const code = body.code.slice(0, MAX_CODE_CHARS);
      const response = buildQuickScanResponse(
        [{ path: "pasted-code.ts", content: code }],
        [],
        { kind: "paste", label: "pasted code" },
        1,
      );
      return NextResponse.json(response);
    }

    return NextResponse.json({ error: "ต้องส่ง url หรือ code อย่างใดอย่างหนึ่ง" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "quick scan ล้มเหลว";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
