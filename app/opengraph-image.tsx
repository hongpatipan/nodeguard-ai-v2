import { ImageResponse } from "next/og";

// edge runtime คือค่ามาตรฐานสำหรับ next/og (คนละ runtime กับ API route อื่นในโปรเจกต์ที่ใช้ nodejs
// เพราะต้องพึ่ง ESLint/filesystem — แต่ไฟล์นี้ไม่เกี่ยวกัน ใช้ edge ได้ปกติ เร็วกว่า)
export const runtime = "edge";

export const alt = "NodeGuard AI — Node.js Code Reviewer (Gemini Edition)";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const TITLE = "NodeGuard AI";
const SUBTITLE = "Gemini Edition";
const TAGLINE = "รีวิวโค้ด Node.js อัตโนมัติด้วย Gemini";
const CHECKS = ["Event Loop Blocking", "Memory Leaks & Async", "Database & I/O", "Security & Errors"];
const DOMAIN = "iamhong.me";

/**
 * next/og (Satori) ไม่มีฟอนต์ไทยติดตั้งมาให้ default — ต้อง fetch เองจาก Google Fonts
 * ดึงเฉพาะตัวอักษรที่ใช้จริงในภาพ (ผ่าน query "text=") เพื่อให้ไฟล์ฟอนต์เล็กและโหลดไว
 */
async function loadGoogleFont(fontFamily: string, text: string) {
  // ห้าม encodeURIComponent(fontFamily) — Google Fonts CSS2 API ใช้ "+" แทนช่องว่างในชื่อฟอนต์
  // โดยเฉพาะ (เช่น "Noto+Sans+Thai:wght@600") การ encode จะเปลี่ยน "+" เป็น "%2B" แล้ว API จะไม่รู้จัก
  const url = `https://fonts.googleapis.com/css2?family=${fontFamily}&text=${encodeURIComponent(text)}`;
  // Google Fonts ตัดสินใจฟอร์แมตไฟล์ฟอนต์จาก User-Agent — เคยลองปลอมเป็น browser เก่า (Chrome 41)
  // แล้วได้ woff (ไม่ใช่ truetype) เพราะ Google ยังจำ UA นั้นได้ว่า "รองรับ woff" — ทางที่ได้ผลจริง
  // (ทดสอบแล้ว) คือส่ง UA ที่ Google "ไม่รู้จักเลย" (เหมือน curl) จะ fallback มาเป็น truetype ที่ทุก
  // client อ่านได้แน่นอน ซึ่งเป็นฟอร์แมตเดียวที่ Satori (ตัว render ของ next/og) รองรับ
  const css = await (
    await fetch(url, {
      headers: { "User-Agent": "font-loader/1.0" },
    })
  ).text();
  const match = css.match(/src: url\(([^)]+)\) format\('(?:opentype|truetype)'\)/);
  if (match?.[1]) {
    const res = await fetch(match[1]);
    if (res.ok) return res.arrayBuffer();
  }
  // แนบ response ดิบไว้ใน error message ด้วย จะได้ debug ง่ายถ้า Google เปลี่ยนรูปแบบ CSS ในอนาคต
  throw new Error(`โหลดฟอนต์ไม่สำเร็จ: ${fontFamily} — response: ${css.slice(0, 500)}`);
}

export default async function Image() {
  const allText = [TITLE, SUBTITLE, TAGLINE, ...CHECKS, DOMAIN].join(" ");
  const [interBold, notoSansThai] = await Promise.all([
    loadGoogleFont("Inter:wght@700", allText),
    loadGoogleFont("Noto+Sans+Thai:wght@600", allText),
  ]);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          // พื้นหลังเดิม #09090b (เกือบดำสนิท) ไปเบลนด์กับพื้นหลัง dark theme ของแอปแชท (เช่น Discord)
          // จนดูเหมือนไม่มีรูป — เปลี่ยนเป็นกราเดียนต์กรมท่า/น้ำเงินเข้มที่ยังพอมองเห็นขอบเขตภาพชัดเจน
          // แถมใส่กรอบขอบสีฟ้าจางๆ รอบภาพเพื่อให้เห็น boundary แน่นอนไม่ว่าพื้นหลัง client จะเป็นสีอะไร
          backgroundColor: "#0f172a",
          backgroundImage:
            "radial-gradient(circle at 50% 0%, rgba(59,130,246,0.35), transparent 62%), linear-gradient(160deg, #1e293b 0%, #0f172a 60%)",
          border: "2px solid #1e40af",
        }}
      >
        {/* โลโก้: กล่องมนสีน้ำเงิน + เครื่องหมายถูก (โทนเดียวกับ favicon) */}
        <div
          style={{
            display: "flex",
            width: 100,
            height: 100,
            borderRadius: 24,
            backgroundColor: "#3b82f6",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 32,
          }}
        >
          <div
            style={{
              width: 42,
              height: 24,
              borderLeft: "9px solid #09090b",
              borderBottom: "9px solid #09090b",
              transform: "rotate(-45deg) translate(3px, -6px)",
            }}
          />
        </div>

        <div style={{ display: "flex", alignItems: "baseline", gap: 18 }}>
          <div style={{ fontSize: 66, fontWeight: 700, color: "#ffffff", fontFamily: "Inter" }}>{TITLE}</div>
          <div style={{ fontSize: 30, fontWeight: 700, color: "#3b82f6", fontFamily: "Inter" }}>{SUBTITLE}</div>
        </div>

        <div style={{ display: "flex", fontSize: 28, color: "#a1a1aa", marginTop: 20, fontFamily: "Noto Sans Thai" }}>
          {TAGLINE}
        </div>

        <div style={{ display: "flex", gap: 14, marginTop: 46 }}>
          {CHECKS.map((c) => (
            <div
              key={c}
              style={{
                display: "flex",
                padding: "10px 20px",
                borderRadius: 10,
                border: "1px solid #27272a",
                backgroundColor: "#18181b",
                color: "#e4e4e7",
                fontSize: 19,
                fontFamily: "Inter",
              }}
            >
              {c}
            </div>
          ))}
        </div>

        <div style={{ display: "flex", position: "absolute", bottom: 38, fontSize: 22, color: "#52525b", fontFamily: "Inter" }}>
          {DOMAIN}
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Inter", data: interBold, weight: 700, style: "normal" },
        { name: "Noto Sans Thai", data: notoSansThai, weight: 600, style: "normal" },
      ],
    },
  );
}
