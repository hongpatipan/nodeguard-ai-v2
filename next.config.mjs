/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // eslint / @typescript-eslint/parser / eslint-plugin-security (ใช้ใน lib/static-scan.ts สำหรับ
  // Quick Scan) พึ่ง dynamic require() ภายในเยอะ — ถ้าปล่อยให้ webpack bundle เข้าไปใน server route
  // ตามปกติ จะพัง: โค้ดเดียวกันรันตรงๆ ด้วย node ผ่านฉลุย แต่พอรันผ่าน Next.js server route
  // จะ parse fail แบบเงียบ ๆ ทุกไฟล์ (ไม่มี error ชัดเจนให้เห็น) ต้องกันไว้ไม่ให้ bundle
  // แล้ว require() ตรงจาก node_modules ตอน runtime แทน
  serverExternalPackages: ["eslint", "@typescript-eslint/parser", "eslint-plugin-security"],
};

export default nextConfig;
