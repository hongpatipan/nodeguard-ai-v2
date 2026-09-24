"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  CheckCircle2,
  Coins,
  Database,
  FileWarning,
  Github,
  KeyRound,
  Loader2,
  ShieldAlert,
  Trash2,
  XCircle,
} from "lucide-react";

import { loadStoredApiKey } from "@/components/api-key-settings";
import { PageNav } from "@/components/page-nav";
import { ReviewDashboard } from "@/components/review-dashboard";
import { formatCompact, StatTile } from "@/components/stat-tile";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { clearHistory, loadHistory, removeHistoryEntry, type HistoryEntry } from "@/lib/history";
import { formatUsd } from "@/lib/gemini-pricing";
import { cn } from "@/lib/utils";

type ServerStatus = {
  hasServerKey: boolean;
  hasGithubToken: boolean;
  hasGitlabToken: boolean;
  defaultModel: string;
  maxDiffChars: number;
};

type PingResult =
  | { ok: true; model: string; displayName: string | null; latencyMs: number; usedKey: "byok" | "server" }
  | { ok: false; error: string };

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" });
}

function StatusRow({ ok, label, okText, badText }: { ok: boolean; label: string; okText: string; badText: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {ok ? <CheckCircle2 className="h-3.5 w-3.5 text-primary" /> : <XCircle className="h-3.5 w-3.5 text-muted-foreground" />}
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("ml-auto text-xs", ok ? "text-primary" : "text-muted-foreground")}>{ok ? okText : badText}</span>
    </div>
  );
}

export default function DashboardPage() {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [apiKey, setApiKey] = useState("");
  const [serverStatus, setServerStatus] = useState<ServerStatus | null>(null);
  const [pinging, setPinging] = useState(false);
  const [pingResult, setPingResult] = useState<PingResult | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    setHistory(loadHistory());
    setApiKey(loadStoredApiKey());
    fetch("/api/status")
      .then((res) => res.json())
      .then((json: ServerStatus) => setServerStatus(json))
      .catch(() => setServerStatus(null));
  }, []);

  async function runPing() {
    setPinging(true);
    setPingResult(null);
    try {
      const res = await fetch("/api/ping", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(apiKey ? { "X-Gemini-Api-Key": apiKey } : {}),
        },
        body: JSON.stringify({}),
      });
      setPingResult((await res.json()) as PingResult);
    } catch (e) {
      setPingResult({ ok: false, error: e instanceof Error ? e.message : "ping ไม่สำเร็จ" });
    } finally {
      setPinging(false);
    }
  }

  function handleClearHistory() {
    clearHistory();
    setHistory([]);
    setExpandedId(null);
  }

  function handleRemove(id: string) {
    setHistory(removeHistoryEntry(id));
    if (expandedId === id) setExpandedId(null);
  }

  const stats = useMemo(() => {
    const totalReviews = history.length;
    const totalPromptTokens = history.reduce((s, h) => s + h.data.usage.promptTokens, 0);
    const totalOutputTokens = history.reduce((s, h) => s + h.data.usage.outputTokens, 0);
    const totalTokens = totalPromptTokens + totalOutputTokens;
    const totalCost = history.reduce((s, h) => s + h.data.usage.estimatedCost, 0);
    const totalIssues = history.reduce((s, h) => s + h.data.review.issues.length, 0);
    const criticalIssues = history.reduce(
      (s, h) => s + h.data.review.issues.filter((i) => i.severity === "critical").length,
      0,
    );
    const cacheHits = history.filter((h) => h.data.usage.cacheHit).length;
    const cacheHitRate = totalReviews > 0 ? Math.round((cacheHits / totalReviews) * 100) : 0;

    const byModel = new Map<string, { count: number; cost: number }>();
    for (const h of history) {
      const m = byModel.get(h.data.model) ?? { count: 0, cost: 0 };
      m.count += 1;
      m.cost += h.data.usage.estimatedCost;
      byModel.set(h.data.model, m);
    }

    return { totalReviews, totalTokens, totalCost, totalIssues, criticalIssues, cacheHitRate, byModel };
  }, [history]);

  return (
    <main className="mx-auto max-w-5xl px-5 py-10">
      <PageNav />
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          สถานะระบบ สรุปค่าใช้จ่าย และประวัติการ review — ข้อมูลทั้งหมดเก็บใน localStorage
          ของเบราว์เซอร์คุณเท่านั้น ไม่มี database ฝั่ง server
        </p>
      </header>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* ---- System status ---- */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              <CardTitle className="text-base">System Status</CardTitle>
            </div>
            <CardDescription>เช็คว่า key/token ที่จำเป็นตั้งไว้ครบไหม</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <StatusRow
              ok={Boolean(apiKey)}
              label="Gemini API Key (ของคุณ)"
              okText="ตั้งไว้แล้ว"
              badText="ยังไม่ได้ตั้ง"
            />
            <StatusRow
              ok={Boolean(serverStatus?.hasServerKey)}
              label="Gemini API Key (กลางของ server)"
              okText="ตั้งไว้แล้ว"
              badText="ยังไม่ได้ตั้ง"
            />
            <StatusRow
              ok={Boolean(serverStatus?.hasGithubToken)}
              label="GITHUB_TOKEN"
              okText="ตั้งไว้แล้ว"
              badText="ไม่ได้ตั้ง (public repo ยังใช้ได้)"
            />
            <StatusRow
              ok={Boolean(serverStatus?.hasGitlabToken)}
              label="GITLAB_TOKEN"
              okText="ตั้งไว้แล้ว"
              badText="ไม่ได้ตั้ง (public project ยังใช้ได้)"
            />
            {serverStatus ? (
              <div className="flex items-center gap-2 pt-1 text-xs text-muted-foreground">
                <span>Default model:</span>
                <Badge variant="outline">{serverStatus.defaultModel}</Badge>
              </div>
            ) : null}

            <div className="border-t border-border pt-3">
              <Button size="sm" variant="secondary" onClick={runPing} disabled={pinging || (!apiKey && !serverStatus?.hasServerKey)}>
                {pinging ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}
                ทดสอบเชื่อมต่อ Gemini
              </Button>
              <p className="mt-1 text-[11px] text-muted-foreground">
                ใช้ models.get() — ไม่กิน generation token / ไม่นับโควตา Free Tier
              </p>

              {pingResult ? (
                <div
                  className={cn(
                    "mt-3 rounded-md border p-3 text-xs",
                    pingResult.ok ? "border-primary/20 bg-primary/5" : "border-destructive/30 bg-destructive/5",
                  )}
                >
                  {pingResult.ok ? (
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 text-primary">
                        <CheckCircle2 className="h-3.5 w-3.5" /> เชื่อมต่อสำเร็จ ({pingResult.latencyMs}ms)
                      </div>
                      <div className="text-muted-foreground">
                        model: <span className="font-mono">{pingResult.model}</span>
                        {pingResult.displayName ? ` (${pingResult.displayName})` : ""}
                      </div>
                      <div className="text-muted-foreground">
                        key ที่ใช้: {pingResult.usedKey === "byok" ? "ของคุณ (BYOK)" : "กลางของ server"}
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-1.5 text-destructive">
                      <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>{pingResult.error}</span>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>

        {/* ---- Cost summary ---- */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Coins className="h-4 w-4 text-primary" />
              <CardTitle className="text-base">สรุปค่าใช้จ่าย</CardTitle>
            </div>
            <CardDescription>รวมจากประวัติ review ในเบราว์เซอร์นี้ ({stats.totalReviews} ครั้ง)</CardDescription>
          </CardHeader>
          <CardContent>
            {stats.totalReviews === 0 ? (
              <p className="text-sm text-muted-foreground">ยังไม่มีประวัติ review — ไปหน้า Review แล้วลองรันดูก่อน</p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <StatTile label="ค่าใช้จ่ายประมาณรวม" value={formatUsd(stats.totalCost)} icon={Coins} hero />
                  </div>
                  <StatTile label="จำนวน review" value={String(stats.totalReviews)} icon={FileWarning} />
                  <StatTile label="Token รวม" value={formatCompact(stats.totalTokens)} icon={Database} />
                  <StatTile label="Critical ที่เจอ" value={String(stats.criticalIssues)} icon={ShieldAlert} />
                  <StatTile label="Cache hit rate" value={`${stats.cacheHitRate}%`} icon={Database} />
                </div>

                {stats.byModel.size > 0 ? (
                  <div className="mt-4 border-t border-border pt-3">
                    <div className="mb-2 text-[11px] uppercase tracking-wide text-muted-foreground">แยกตามโมเดล</div>
                    <div className="space-y-1.5">
                      {[...stats.byModel.entries()]
                        .sort((a, b) => b[1].count - a[1].count)
                        .map(([modelId, m]) => (
                          <div key={modelId} className="flex items-center justify-between text-xs">
                            <span className="font-mono text-muted-foreground">{modelId}</span>
                            <span className="tabular-nums">
                              {m.count} ครั้ง · {formatUsd(m.cost)}
                            </span>
                          </div>
                        ))}
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ---- Review history ---- */}
      <Card className="mt-5">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">ประวัติ Review</CardTitle>
              <CardDescription>เก็บ {history.length} รายการล่าสุด (สูงสุด 25) — คลิกแถวเพื่อดูรายละเอียดเต็ม</CardDescription>
            </div>
            {history.length > 0 ? (
              <Button size="sm" variant="outline" onClick={handleClearHistory}>
                <Trash2 className="h-3.5 w-3.5" /> ล้างทั้งหมด
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">ยังไม่มีประวัติ — ผลการ review จากหน้า Review จะมาโผล่ที่นี่</p>
          ) : (
            history.map((entry) => {
              const isOpen = expandedId === entry.id;
              const counts = {
                critical: entry.data.review.issues.filter((i) => i.severity === "critical").length,
                warning: entry.data.review.issues.filter((i) => i.severity === "warning").length,
              };
              return (
                <div key={entry.id} className="rounded-md border border-border">
                  <button
                    type="button"
                    onClick={() => setExpandedId(isOpen ? null : entry.id)}
                    className="flex w-full flex-wrap items-center gap-2 p-3 text-left hover:bg-accent/40"
                  >
                    <Github className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate font-mono text-xs">{entry.data.source.label}</span>
                    {counts.critical > 0 ? <Badge variant="critical">critical {counts.critical}</Badge> : null}
                    {counts.warning > 0 ? <Badge variant="warning">warning {counts.warning}</Badge> : null}
                    <Badge variant="outline">{entry.data.model}</Badge>
                    <span className="text-xs tabular-nums text-muted-foreground">{formatUsd(entry.data.usage.estimatedCost)}</span>
                    <span className="text-xs text-muted-foreground">{formatTimestamp(entry.timestamp)}</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemove(entry.id);
                      }}
                      className="text-muted-foreground hover:text-destructive"
                      aria-label="ลบรายการนี้"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </button>
                  {isOpen ? (
                    <div className="border-t border-border p-3">
                      <ReviewDashboard data={entry.data} />
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <footer className="mt-12 border-t border-border pt-6 text-center text-xs text-muted-foreground">
        Built by <span className="font-medium text-foreground">Patipan Kaewunmuang</span>
      </footer>
    </main>
  );
}
