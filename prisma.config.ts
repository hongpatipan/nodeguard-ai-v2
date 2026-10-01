// ตั้งค่าที่ Prisma CLI ใช้ (generate, migrate, studio) — คนละส่วนกับตอน app รันจริง
// (lib/prisma.ts) แต่ทั้งคู่อ่านค่าจาก DATABASE_URL ตัวเดียวกัน
// ใช้ .env.local ตามธรรมเนียมของ Next.js (dotenv เริ่มต้นอ่านแค่ .env เฉย ๆ เลยต้องระบุ path เอง)
import { config } from "dotenv";
config({ path: ".env.local" });
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: env("DATABASE_URL"),
  },
});
