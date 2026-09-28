import type { Metadata } from "next";
import "./globals.css";

const TITLE = "NodeGuard AI (Gemini Edition)";
const DESCRIPTION = "รีวิวโค้ด Node.js ด้วย Gemini — หา Event Loop Blocking, Memory Leak, N+1 Query และช่องโหว่";

export const metadata: Metadata = {
  // จำเป็นต้องมี เพื่อให้ path แบบ relative ของ app/opengraph-image.tsx (เช่น /opengraph-image)
  // ถูกแปลงเป็น absolute URL ใน og:image — โซเชียลมีเดียจะดึงรูปไม่ได้เลยถ้าเป็น relative path
  // ใช้ nodeguard.iamhong.me เพราะเป็นโดเมนที่มี DNS record จริงและใช้งานได้ — iamhong.me และ
  // www.iamhong.me ตอนนี้ไม่มี DNS record เลย (ต่อไม่ติด) ถ้าตั้งเป็นโดเมนนั้น Discord/social จะดึง
  // รูปไม่ได้ตลอดกาลไม่ว่าจะรอนานแค่ไหน
  metadataBase: new URL("https://nodeguard.iamhong.me"),
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: "https://nodeguard.iamhong.me",
    siteName: "NodeGuard AI",
    locale: "th_TH",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className="dark">
      <body>{children}</body>
    </html>
  );
}
