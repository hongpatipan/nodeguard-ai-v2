import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NodeGuard AI (Gemini Edition)",
  description: "รีวิวโค้ด Node.js ด้วย Gemini — หา Event Loop Blocking, Memory Leak, N+1 Query และช่องโหว่",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className="dark">
      <body>{children}</body>
    </html>
  );
}
