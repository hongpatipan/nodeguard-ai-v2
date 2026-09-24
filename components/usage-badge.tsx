"use client";

import { Coins, Database, Gauge, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatUsd, type UsageBreakdown } from "@/lib/gemini-pricing";
import type { FilterStats } from "@/lib/node-diff-filter";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="font-mono text-sm tabular-nums">{value}</span>
    </div>
  );
}

export function UsageBadge({ usage, filterStats }: { usage: UsageBreakdown; filterStats: FilterStats }) {
  const n = (v: number) => v.toLocaleString("en-US");

  return (
    <div className="flex flex-wrap items-center gap-x-8 gap-y-4 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <Coins className="h-4 w-4 text-primary" />
        <div className="flex flex-col">
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
            ค่าใช้จ่ายโดยประมาณ
          </span>
          <span className="font-mono text-lg font-semibold tabular-nums text-primary">
            {formatUsd(usage.estimatedCost)}
          </span>
        </div>
      </div>

      <Stat label="Prompt tokens" value={n(usage.promptTokens)} />
      <Stat label="Output tokens" value={n(usage.outputTokens)} />
      {usage.thoughtsTokens > 0 ? <Stat label="Thinking tokens" value={n(usage.thoughtsTokens)} /> : null}
      <Stat label="Total" value={n(usage.totalTokens)} />

      <div className="ml-auto flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="gap-1">
          <Sparkles className="h-3 w-3" /> {usage.modelLabel}
        </Badge>
        {usage.cacheHit ? (
          <Badge variant="default" className="gap-1">
            <Database className="h-3 w-3" /> implicit cache hit ({n(usage.cachedTokens)} token)
          </Badge>
        ) : null}
        <Badge variant="outline" className="gap-1">
          <Gauge className="h-3 w-3" />
          กรองไฟล์ทิ้ง {filterStats.skippedFiles.length}/{filterStats.totalFiles} · ลด input {filterStats.savedPercent}%
        </Badge>
        {filterStats.truncated ? <Badge variant="warning">diff ถูกตัดบางส่วน</Badge> : null}
      </div>
    </div>
  );
}
