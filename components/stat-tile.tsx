import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** เลขใหญ่ (สาม-สี่หลักขึ้นไป) ย่อเป็น 1.2K / 3.4M แบบ Intl — ตัวเลขเล็กแสดงเต็ม */
export function formatCompact(value: number): string {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

type Props = {
  label: string;
  value: string;
  hint?: string;
  icon?: LucideIcon;
  /** hero = ตัวเลขหลักของ view นี้ ใหญ่กว่า tile อื่น — ใช้ได้แค่ 1 อันต่อหน้า */
  hero?: boolean;
};

/**
 * Stat tile ตาม contract: label (sentence case ไม่มี : ท้าย) · value (semibold, proportional
 * figures — ไม่ใช้ tabular-nums เพราะนี่คือเลขเดี่ยวขนาดใหญ่ ไม่ใช่คอลัมน์ตาราง) · hint ระบุบริบทเสริม
 */
export function StatTile({ label, value, hint, icon: Icon, hero }: Props) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        {Icon ? <Icon className="h-3 w-3" /> : null}
        {label}
      </div>
      {/* proportional figures (Tailwind default) — tabular-nums เก็บไว้ใช้แค่ในคอลัมน์ตาราง ไม่ใช่ตัวเลขเดี่ยวแบบนี้ */}
      <div className={cn("mt-1 font-semibold", hero ? "text-3xl" : "text-xl")}>{value}</div>
      {hint ? <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div> : null}
    </div>
  );
}
