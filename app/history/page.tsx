"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, History, Loader2, RotateCcw } from "lucide-react";

import { PageNav } from "@/components/page-nav";
import { Badge, type badgeVariants } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { VariantProps } from "class-variance-authority";

type LogStatus = "FLAGGED" | "RESOLVED" | "FAILED";
type LogSeverity = "critical" | "warning" | "optimization" | "passed";

type LogItem = {
  id: string;
  createdAt: string;
  updatedAt: string;
  sourceKind: string;
  sourceLabel: string;
  model: string;
  issuesFoundCount: number;
  severity: LogSeverity;
  status: LogStatus;
  errorMessage: string | null;
};

type ListResponse = { items: LogItem[]; total: number; page: number; pageSize: number; totalPages: number };

const STATUS_LABEL: Record<LogStatus, string> = {
  FLAGGED: "พบปัญหา",
  RESOLVED: "แก้ไขแล้ว",
  FAILED: "วิเคราะห์ล้มเหลว",
};

const STATUS_BADGE: Record<LogStatus, VariantProps<typeof badgeVariants>["variant"]> = {
  FLAGGED: "critical",
  RESOLVED: "success",
  FAILED: "muted",
};

const SEVERITY_LABEL: Record<LogSeverity, string> = {
  critical: "Critical",
  warning: "Warning",
  optimization: "Optimization",
  passed: "Passed",
};

const SEVERITY_BADGE: Record<LogSeverity, VariantProps<typeof badgeVariants>["variant"]> = {
  critical: "critical",
  warning: "warning",
  optimization: "optimization",
  passed: "success",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" });
}

export default function HistoryPage() {
  const [status, setStatus] = useState<"all" | LogStatus>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);

  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: "20" });
      if (status !== "all") params.set("status", status);
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const res = await fetch(`/api/history?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setData(json as ListResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : "โหลดประวัติไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [status, from, to, page]);

  useEffect(() => {
    load();
  }, [load]);

  // เปลี่ยน filter แล้วกลับไปหน้า 1 เสมอ กันเผลอค้างอยู่หน้าที่ไม่มีข้อมูลแล้ว
  function updateFilter(fn: () => void) {
    fn();
    setPage(1);
  }

  return (
    <main className="mx-auto max-w-5xl px-5 py-10">
      <PageNav />
      <header className="mb-8">
        <h1 className="font-display text-2xl font-semibold tracking-tight">History Log</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          ประวัติการ review ทุกครั้ง (ทั้ง AI Review และ Quick Scan) — filter ตามวันที่/สถานะได้
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          สถานะ <span className="font-medium text-foreground">แก้ไขแล้ว</span> เปลี่ยนให้อัตโนมัติ
          เฉพาะตอนรีวิว PR/MR เดิม (URL เดียวกัน) ซ้ำแล้วไม่พบปัญหาแล้วจริงเท่านั้น — กดเปลี่ยนเองไม่ได้
          เพื่อกันการมาร์กว่าแก้แล้วทั้งที่ยังไม่ได้ verify จริง (ใช้ได้เฉพาะรีวิวผ่าน PR/MR URL
          เท่านั้น การวางโค้ด/diff ตรงๆ ไม่มี URL ให้จับคู่จึงค้างเป็น "พบปัญหา" ตลอดไป)
        </p>
      </header>

      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filter</CardTitle>
          <CardDescription>กรองตามช่วงวันที่และสถานะ</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-muted-foreground">จากวันที่</label>
              <input
                type="date"
                value={from}
                onChange={(e) => updateFilter(() => setFrom(e.target.value))}
                className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-muted-foreground">ถึงวันที่</label>
              <input
                type="date"
                value={to}
                onChange={(e) => updateFilter(() => setTo(e.target.value))}
                className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-muted-foreground">สถานะ</label>
              <Select value={status} onValueChange={(v) => updateFilter(() => setStatus(v as typeof status))}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">ทั้งหมด</SelectItem>
                  <SelectItem value="FLAGGED">พบปัญหา</SelectItem>
                  <SelectItem value="RESOLVED">แก้ไขแล้ว</SelectItem>
                  <SelectItem value="FAILED">วิเคราะห์ล้มเหลว</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {from || to || status !== "all" ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  updateFilter(() => {
                    setFrom("");
                    setTo("");
                    setStatus("all");
                  })
                }
              >
                <RotateCcw className="h-3.5 w-3.5" /> ล้าง filter
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {error ? (
        <Card className="mb-6 border-destructive/40">
          <CardContent className="p-4 text-sm">{error}</CardContent>
        </Card>
      ) : null}

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> กำลังโหลด…
            </div>
          ) : error ? (
            // มี error banner อธิบายไว้ด้านบนแล้ว — ตรงนี้แค่บอกสั้น ๆ ไม่ซ้ำซ้อน และไม่ใช้ข้อความ
            // "ยังไม่มีประวัติ" ที่สื่อผิดว่าเช็คแล้วว่างจริง ทั้งที่จริง ๆ คือโหลดไม่สำเร็จ
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-sm text-muted-foreground">
              โหลดตารางไม่ได้ — ดูรายละเอียด error ด้านบน
            </div>
          ) : !data || data.items.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <History className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {status !== "all" || from || to ? "ไม่พบประวัติที่ตรงกับ filter นี้" : "ยังไม่มีประวัติ review เลย"}
              </p>
              <Button asChild size="sm">
                <a href="/">ไปรีวิวโค้ดครั้งแรก</a>
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>วันที่</TableHead>
                  <TableHead>ที่มา</TableHead>
                  <TableHead>โมเดล</TableHead>
                  <TableHead>จำนวนปัญหา</TableHead>
                  <TableHead>ความรุนแรง</TableHead>
                  <TableHead>สถานะ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {formatDate(item.createdAt)}
                    </TableCell>
                    <TableCell className="max-w-[220px] truncate text-xs" title={item.sourceLabel}>
                      {item.sourceLabel}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{item.model}</TableCell>
                    <TableCell className="text-xs">{item.issuesFoundCount}</TableCell>
                    <TableCell>
                      <Badge variant={SEVERITY_BADGE[item.severity]}>{SEVERITY_LABEL[item.severity]}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={STATUS_BADGE[item.status]}
                        title={
                          item.status === "FLAGGED" && item.sourceKind !== "paste"
                            ? "จะเปลี่ยนเป็นแก้ไขแล้วอัตโนมัติเมื่อรีวิว PR/MR นี้ซ้ำแล้วไม่พบปัญหา"
                            : undefined
                        }
                      >
                        {STATUS_LABEL[item.status]}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {data && data.totalPages > 1 ? (
        <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            หน้า {data.page} / {data.totalPages} — ทั้งหมด {data.total} รายการ
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className="h-3.5 w-3.5" /> ก่อนหน้า
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= data.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              ถัดไป <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      ) : null}
    </main>
  );
}
