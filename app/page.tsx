"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Github, Loader2, Play, Zap } from "lucide-react";

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

const CHECKLIST = [
  { title: "Event Loop Blocking", detail: "sync I/O, CPU หนักใน handler, ReDoS" },
  { title: "Memory Leaks & Async", detail: "unhandled rejection, shared state, listener ค้าง" },
  { title: "Database & I/O", detail: "N+1, ไม่มี pagination, pool/timeout" },
  { title: "Security & Errors", detail: "unsanitized input, injection, log ข้อมูลอ่อนไหว" },
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
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Node.js Code Reviewer</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          รีวิวเฉพาะปัญหาของ Node.js runtime ด้วย Gemini — กรองไฟล์ที่ไม่ใช่ logic ออก ส่งเฉพาะ diff
          เพื่อประหยัด token และใช้โควตา Free Tier ได้นานขึ้น
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {CHECKLIST.map((c) => (
            <div key={c.title} className="rounded-md border border-border bg-card px-3 py-2">
              <div className="text-xs font-medium">{c.title}</div>
              <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{c.detail}</div>
            </div>
          ))}
        </div>
      </header>

      <ApiKeySettings apiKey={apiKey} onChange={handleApiKeyChange} />

      <Card className="mb-6">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">Input</CardTitle>
              <CardDescription>เลือกดึง diff จาก GitHub PR / GitLab MR หรือวางโค้ด/diff เอง</CardDescription>
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

          <div className="mt-4 flex flex-wrap items-center gap-3">
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
              variant="outline"
              title="ตรวจด้วย ESLint rule ตายตัว ไม่ใช้ AI — ฟรี ไม่มี rate limit แต่ครอบคลุมน้อยกว่า (เน้น sync I/O และ security pattern)"
            >
              {loadingAction === "quickscan" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Zap className="h-4 w-4" />
              )}
              {loadingAction === "quickscan" ? "กำลังสแกน…" : "Quick Scan (ฟรี, ไม่ใช้ AI)"}
            </Button>
            {loadingAction === "review" ? (
              <span className="text-xs text-muted-foreground">
                ปกติ 10–40 วินาที แต่ถ้าโมเดลที่เลือกโหลดสูง ระบบจะลองใหม่แล้วสลับโมเดลสำรองให้อัตโนมัติ
                อาจนานถึง ~1-2 นาที
              </span>
            ) : null}
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
