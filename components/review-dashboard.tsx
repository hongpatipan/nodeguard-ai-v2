"use client";

import { useMemo, useState } from "react";
import { ChevronDown, FileCode2, ShieldAlert, Timer, Database, Bug, CheckCircle2, RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UsageBadge } from "@/components/usage-badge";
import { cn } from "@/lib/utils";
import { CATEGORY_LABELS, type Issue, type ReviewResponse } from "@/lib/types";

const SEVERITY_META = {
  critical: { label: "Critical", variant: "critical" as const, icon: ShieldAlert },
  warning: { label: "Warning", variant: "warning" as const, icon: Bug },
  optimization: { label: "Optimization", variant: "optimization" as const, icon: Timer },
};

const CATEGORY_ICONS = {
  "event-loop-blocking": Timer,
  "memory-leak-async": Bug,
  "database-io": Database,
  "security-error-handling": ShieldAlert,
};

function CodeBlock({ title, code, tone }: { title: string; code: string; tone: "before" | "after" }) {
  return (
    <div className="min-w-0 flex-1">
      <div
        className={cn(
          "mb-1 text-[11px] font-medium uppercase tracking-wide",
          tone === "before" ? "text-red-400" : "text-primary",
        )}
      >
        {title}
      </div>
      <pre
        className={cn(
          "overflow-x-auto rounded-md border p-3 font-mono text-xs leading-relaxed",
          tone === "before" ? "border-red-500/20 bg-red-500/5" : "border-primary/20 bg-primary/5",
        )}
      >
        <code>{code}</code>
      </pre>
    </div>
  );
}

function IssueCard({ issue, index }: { issue: Issue; index: number }) {
  const [open, setOpen] = useState(index === 0);
  const meta = SEVERITY_META[issue.severity];
  const CategoryIcon = CATEGORY_ICONS[issue.category];

  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start gap-3 p-4 text-left hover:bg-accent/40"
      >
        <meta.icon
          className={cn(
            "mt-0.5 h-4 w-4 shrink-0",
            issue.severity === "critical" && "text-red-400",
            issue.severity === "warning" && "text-amber-400",
            issue.severity === "optimization" && "text-sky-400",
          )}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={meta.variant}>{meta.label}</Badge>
            <Badge variant="outline" className="gap-1">
              <CategoryIcon className="h-3 w-3" />
              {CATEGORY_LABELS[issue.category]}
            </Badge>
            <span className="font-mono text-xs text-muted-foreground">
              <FileCode2 className="mr-1 inline h-3 w-3" />
              {issue.file}
              {issue.line > 0 ? `:${issue.line}` : ""}
            </span>
          </div>
          <div className="mt-2 font-medium">{issue.title}</div>
        </div>
        <ChevronDown
          className={cn("mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
        />
      </button>

      {open ? (
        <CardContent className="space-y-4 border-t border-border pt-4">
          <div>
            <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              ปัญหาเฉพาะ Node.js
            </div>
            <p className="text-sm leading-relaxed">{issue.problem}</p>
          </div>
          <div>
            <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              ผลกระทบตอน production
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">{issue.impact}</p>
          </div>
          <div className="flex flex-col gap-3 lg:flex-row">
            <CodeBlock title="Before" code={issue.before} tone="before" />
            <CodeBlock title="After" code={issue.after} tone="after" />
          </div>
        </CardContent>
      ) : null}
    </Card>
  );
}

export function ReviewDashboard({ data }: { data: ReviewResponse }) {
  const { review, usage, filterStats, source, fallbackUsed, requestedModel, model } = data;

  const counts = useMemo(
    () => ({
      critical: review.issues.filter((i) => i.severity === "critical").length,
      warning: review.issues.filter((i) => i.severity === "warning").length,
      optimization: review.issues.filter((i) => i.severity === "optimization").length,
    }),
    [review.issues],
  );

  const verdictMeta = {
    block: { text: "ยังไม่ควร merge", variant: "critical" as const },
    "needs-work": { text: "ต้องแก้ก่อน merge", variant: "warning" as const },
    approve: { text: "ผ่าน", variant: "default" as const },
  }[review.verdict];

  return (
    <div className="space-y-5">
      {fallbackUsed ? (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-400">
          <RefreshCw className="h-4 w-4 shrink-0" />
          <span>
            <span className="font-mono">{requestedModel}</span> โหลดสูง ระบบเลยสลับไปใช้{" "}
            <span className="font-mono">{model}</span> แทนให้อัตโนมัติ — ผลรีวิวด้านล่างมาจากโมเดลนี้
          </span>
        </div>
      ) : null}
      <UsageBadge usage={usage} filterStats={filterStats} />

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={verdictMeta.variant}>{verdictMeta.text}</Badge>
            <Badge variant="critical">Critical {counts.critical}</Badge>
            <Badge variant="warning">Warning {counts.warning}</Badge>
            <Badge variant="optimization">Optimization {counts.optimization}</Badge>
            <span className="ml-auto truncate font-mono text-xs text-muted-foreground">{source.label}</span>
          </div>
          <CardTitle className="pt-2 text-base font-normal leading-relaxed">{review.summary}</CardTitle>
        </CardHeader>
        {filterStats.skippedFiles.length > 0 ? (
          <CardContent className="pt-0">
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer select-none">
                ไฟล์ที่ไม่ได้ส่งให้ AI ({filterStats.skippedFiles.length})
              </summary>
              <ul className="mt-2 space-y-1 font-mono">
                {filterStats.skippedFiles.map((f) => (
                  <li key={f.path}>
                    {f.path} <span className="text-muted-foreground/60">— {f.reason}</span>
                  </li>
                ))}
              </ul>
            </details>
          </CardContent>
        ) : null}
      </Card>

      {review.issues.length === 0 ? (
        <Card>
          <CardContent className="flex items-center gap-3 p-6">
            <CheckCircle2 className="h-5 w-5 text-primary" />
            <span className="text-sm">ไม่พบปัญหาในขอบเขต Node.js ทั้ง 4 หมวดจาก diff นี้</span>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {review.issues.map((issue, i) => (
            <IssueCard key={`${issue.file}-${issue.line}-${i}`} issue={issue} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}
