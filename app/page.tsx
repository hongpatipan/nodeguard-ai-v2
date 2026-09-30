"use client";

import { useEffect, useState } from "react";
import {
  AlertCircle,
  Code2,
  Database,
  Github,
  Loader2,
  MemoryStick,
  Play,
  ShieldAlert,
  Timer,
  Zap,
} from "lucide-react";

import { ApiKeySettings, loadStoredApiKey, persistApiKey } from "@/components/api-key-settings";
import { ModelSelector } from "@/components/model-selector";
import { PageNav } from "@/components/page-nav";
import { ReviewDashboard } from "@/components/review-dashboard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { DEFAULT_MODEL, type GeminiModelId } from "@/lib/gemini-models";
import { appendHistoryEntry } from "@/lib/history";
import type { ReviewResponse } from "@/lib/types";
import { cn } from "@/lib/utils";

// สีต่างกันต่อหมวด (ใช้แค่ chip เล็ก ๆ ตรงนี้ที่เดียว) ช่วยให้กวาดตาแยกหมวดได้เร็วขึ้น
// ไม่ใช่แค่กล่องเทาเหมือนกันหมดเหมือนก่อนหน้านี้
const CHECKLIST = [
  {
    title: "Event Loop Blocking",
    detail: "sync I/O, CPU หนักใน handler, ReDoS",
    icon: Timer,
    color: "text-primary bg-primary/10 border-primary/25",
  },
  {
    title: "Memory Leaks & Async",
    detail: "unhandled rejection, shared state, listener ค้าง",
    icon: MemoryStick,
    color: "text-violet-400 bg-violet-500/10 border-violet-500/25",
  },
  {
    title: "Database & I/O",
    detail: "N+1, ไม่มี pagination, pool/timeout",
    icon: Database,
    color: "text-sky-400 bg-sky-500/10 border-sky-500/25",
  },
  {
    title: "Security & Errors",
    detail: "unsanitized input, injection, log ข้อมูลอ่อนไหว",
    icon: ShieldAlert,
    color: "text-rose-400 bg-rose-500/10 border-rose-500/25",
  },
  {
    title: "Code Quality & Complexity",
    detail: "ฟังก์ชันซับซ้อนเกินไป, โค้ด/เงื่อนไขซ้ำซ้อน",
    icon: Code2,
    color: "text-amber-400 bg-amber-500/10 border-amber-500/25",
  },
];

export default function Home() {
  const [prUrl, setPrUrl] = useState(""); // ใช้ได้ทั้ง GitHub PR URL และ GitLab MR URL
  const [code, setCode] = useState("");
  const [tab, setTab] = useState<"url" | "paste">("url");
  const [model, setModel] = useState<GeminiModelId>(DEFAULT_MODEL);
  const [loadingAction, setLoadingAction] = useState<"review" | "quickscan" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReviewResponse | null>(null);
  const [apiKey, setApiKey] = useState("");

  // โหลด key ที่เคยบันทึกไว้หลัง mount เท่านั้น (localStorage ไม่มีบน server-render)
  useEffect(() => setApiKey(loadStoredApiKey()), []);

  function handleApiKeyChange(key: string) {
    setApiKey(key);
    persistApiKey(key);
  }

  const canSubmit = tab === "url" ? prUrl.trim().length > 0 : code.trim().length > 0;

  async function runReview() {
    setLoadingAction("review");
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/review", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // BYOK: แนบ key ส่วนตัวไปด้วยถ้าผู้ใช้ตั้งไว้ — ไม่งั้น server จะ fallback ไปใช้ key กลาง
          ...(apiKey ? { "X-Gemini-Api-Key": apiKey } : {}),
        },
        body: JSON.stringify({ ...(tab === "url" ? { url: prUrl } : { code }), model }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      const review = json as ReviewResponse;
      setResult(review);
      appendHistoryEntry(review); // เก็บลง localStorage เพื่อโชว์ในหน้า Dashboard
    } catch (e) {
      setError(e instanceof Error ? e.message : "review ล้มเหลว");
    } finally {
      setLoadingAction(null);
    }
  }

  async function runQuickScan() {
    setLoadingAction("quickscan");
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/quick-scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(tab === "url" ? { url: prUrl } : { code }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      const review = json as ReviewResponse;
      setResult(review);
      appendHistoryEntry(review);
    } catch (e) {
      setError(e instanceof Error ? e.message : "quick scan ล้มเหลว");
    } finally {
      setLoadingAction(null);
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-5 py-10">
      <PageNav />
      <header className="mb-10">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/60 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
          <Zap className="h-3 w-3 text-primary" />
          Internal tool · ขับเคลื่อนด้วย Gemini
        </span>
        <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          Node.js Code Reviewer
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          รีวิวเฉพาะปัญหาของ Node.js runtime ด้วย Gemini — กรองไฟล์ที่ไม่ใช่ logic ออก ส่งเฉพาะ diff
          เพื่อประหยัด token และใช้โควตา Free Tier ได้นานขึ้น
        </p>
        <div className="mt-5 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
          {CHECKLIST.map((c) => (
            <div
              key={c.title}
              className="group rounded-lg border border-border/80 bg-card/60 px-3 py-2.5 transition-colors hover:border-border"
            >
              <div className={cn("inline-flex h-6 w-6 items-center justify-center rounded-md border", c.color)}>
                <c.icon className="h-3.5 w-3.5" />
              </div>
              <div className="mt-2 font-display text-xs font-semibold">{c.title}</div>
              <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{c.detail}</div>
            </div>
          ))}
        </div>
      </header>

      <ApiKeySettings apiKey={apiKey} onChange={handleApiKeyChange} />

      <Card className="mb-6">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <StepBadge n={1} />
              <div>
                <CardTitle className="text-base">วางโค้ดที่จะรีวิว</CardTitle>
                <CardDescription>เลือกดึง diff จาก GitHub PR / GitLab MR หรือวางโค้ด/diff เอง</CardDescription>
              </div>
            </div>
            <ModelSelector value={model} onChange={setModel} />
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={tab} onValueChange={(v) => setTab(v as "url" | "paste")}>
            <TabsList>
              <TabsTrigger value="url">
                <Github className="mr-1.5 h-3.5 w-3.5" /> PR / MR URL
              </TabsTrigger>
              <TabsTrigger value="paste">วางโค้ด / diff</TabsTrigger>
            </TabsList>

            <TabsContent value="url">
              <Input
                value={prUrl}
                onChange={(e) => setPrUrl(e.target.value)}
                placeholder="https://github.com/owner/repo/pull/123 หรือ https://gitlab.com/group/project/-/merge_requests/45"
                spellCheck={false}
              />
              <p className="mt-2 text-xs text-muted-foreground">
                รองรับทั้ง GitHub PR และ GitLab MR (รวม self-hosted) — private repo/project ต้องตั้ง{" "}
                <code className="font-mono">GITHUB_TOKEN</code> หรือ <code className="font-mono">GITLAB_TOKEN</code>{" "}
                ใน .env.local ตามที่ใช้
              </p>
            </TabsContent>

            <TabsContent value="paste">
              <Textarea
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder={"วาง git diff (แนะนำ — ประหยัด token กว่า) หรือโค้ด Node.js ทั้งไฟล์"}
                spellCheck={false}
                className="min-h-[220px]"
              />
            </TabsContent>
          </Tabs>

          <div className="mt-6 border-t border-border/70 pt-4">
            <div className="mb-3 flex items-center gap-2.5">
              <StepBadge n={2} />
              <span className="font-display text-sm font-semibold">เลือกวิธีตรวจ แล้วกดเริ่ม</span>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={runReview} disabled={!canSubmit || loadingAction !== null}>
                {loadingAction === "review" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
                {loadingAction === "review" ? "กำลังรีวิว…" : "Review with AI"}
              </Button>
              <Button
                onClick={runQuickScan}
                disabled={!canSubmit || loadingAction !== null}
                variant="success"
              >
                {loadingAction === "quickscan" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Zap className="h-4 w-4" />
                )}
                {loadingAction === "quickscan" ? "กำลังสแกน…" : "Quick Scan (ฟรี, ไม่ใช้ AI)"}
              </Button>
            </div>
            <p className="mt-2.5 text-[11px] leading-relaxed text-muted-foreground">
              <span className="font-medium text-foreground">Review with AI</span> — วิเคราะห์ละเอียดด้วย Gemini
              ครบทั้ง 4 หมวด แต่ใช้โควตา (ปกติ 10–40 วินาที ถ้าโมเดลโหลดสูงระบบจะลองใหม่/สลับโมเดลให้อัตโนมัติ
              อาจนานถึง ~1-2 นาที) ·{" "}
              <span className="font-medium text-foreground">Quick Scan</span> — ตรวจด้วย ESLint ทันที ฟรี
              ไม่จำกัดจำนวนครั้ง แต่ครอบคลุมน้อยกว่า (เน้น sync I/O และ security pattern เท่านั้น)
            </p>
          </div>
          {tab === "paste" ? (
            <p className="mt-2 text-[11px] text-muted-foreground">
              Quick Scan ใช้ได้เฉพาะตอนวางโค้ดเต็มไฟล์ (ไม่ใช่ diff) เพราะต้อง parse syntax ให้ครบ —
              ถ้าวาง diff ไว้ ให้สลับไปแท็บ PR / MR URL แทน
            </p>
          ) : null}
        </CardContent>
      </Card>

      {error ? (
        <Card className="mb-6 border-destructive/40">
          <CardContent className="flex items-start gap-3 p-4">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <span className="text-sm">{error}</span>
          </CardContent>
        </Card>
      ) : null}

      {result ? <ReviewDashboard data={result} /> : null}

      <footer className="mt-12 border-t border-border pt-6 text-center text-xs text-muted-foreground">
        Built by <span className="font-medium text-foreground">Patipan Kaewunmuang</span>
      </footer>
    </main>
  );
}

/** เลขวงกลมบอกลำดับขั้นตอน (1, 2, ...) ใช้กับหัวข้อการ์ดเพื่อบอกคนใหม่ว่าต้องทำอะไรก่อน-หลัง */
function StepBadge({ n }: { n: number }) {
  return (
    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-semibold text-primary">
      {n}
    </span>
  );
}
