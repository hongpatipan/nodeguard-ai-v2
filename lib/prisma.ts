import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

// Prisma 7 ต้องต่อ database ผ่าน driver adapter เสมอ (ไม่มี url ใน schema.prisma แล้ว)
// ดู prisma.config.ts สำหรับฝั่งที่ Prisma CLI (generate/migrate) ใช้ — คนละจุดกัน แต่อ่าน
// DATABASE_URL ตัวเดียวกัน
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

// Next.js dev mode reload โมดูลบ่อย — เก็บ instance ไว้ใน globalThis กัน "too many connections"
export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
