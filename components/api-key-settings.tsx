"use client";

import { useEffect, useState } from "react";
import { Check, Eye, EyeOff, KeyRound, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const STORAGE_KEY = "nodeguard-ai:gemini-api-key";

/** อ่าน key ที่ผู้ใช้เคยบันทึกไว้ในเบราว์เซอร์ตัวเอง (ไม่เกี่ยวกับ server) */
export function loadStoredApiKey(): string {
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    // private mode / storage ถูกบล็อก — ใช้ค่าว่างแทน ไม่ต้อง throw
    return "";
  }
}

export function persistApiKey(key: string) {
  try {
    if (key) window.localStorage.setItem(STORAGE_KEY, key);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

type Props = { apiKey: string; onChange: (key: string) => void };

/**
 * ช่องกรอก Gemini API Key ต่อผู้ใช้ (BYOK) — สำหรับเว็บตัวกลางที่ทีม dev แชร์กัน
 * แต่ละคนใส่ key ของตัวเองได้ (ฟรีจาก aistudio.google.com/apikey) เก็บเฉพาะใน localStorage
 * ของเบราว์เซอร์ตัวเอง ไม่เคยถูกส่งไปเก็บถาวรที่ server (แนบไปกับ request ตอน review เท่านั้น)
 */
export function ApiKeySettings({ apiKey, onChange }: Props) {
  const [draft, setDraft] = useState(apiKey);
  const [show, setShow] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => setDraft(apiKey), [apiKey]);

  function save() {
    const trimmed = draft.trim();
    onChange(trimmed);
    setDraft(trimmed);
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 1500);
  }

  function clear() {
    setDraft("");
    onChange("");
  }

  const dirty = draft.trim() !== apiKey;

  return (
    <Card className="mb-6">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <KeyRound className="h-4 w-4 text-primary" />
          <CardTitle className="text-base">Gemini API Key</CardTitle>
          {apiKey ? (
            <Badge variant="default">ใช้ key ส่วนตัวของคุณ</Badge>
          ) : (
            <Badge variant="secondary">ยังไม่ได้ตั้ง — จะใช้ key กลางของ server ถ้ามี</Badge>
          )}
        </div>
        <CardDescription>
          เก็บไว้ใน localStorage ของเบราว์เซอร์คุณเท่านั้น ไม่ถูกบันทึกที่ server — เหมาะกับทีมที่แชร์เว็บนี้
          ให้แต่ละคนใส่ key ของตัวเอง (ขอฟรีได้ที่ aistudio.google.com/apikey) ปล่อยว่างได้ถ้า admin ตั้ง{" "}
          <code className="font-mono">GEMINI_API_KEY</code> กลางไว้ที่ server แล้ว
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Input
            type={show ? "text" : "password"}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
            }}
            placeholder="AIzaSy..."
            spellCheck={false}
            autoComplete="off"
            className="pr-9 font-mono"
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            tabIndex={-1}
            aria-label={show ? "ซ่อน key" : "แสดง key"}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </button>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={save} disabled={!dirty}>
            {justSaved ? <Check className="h-3.5 w-3.5" /> : null}
            {justSaved ? "บันทึกแล้ว" : "บันทึก"}
          </Button>
          {apiKey ? (
            <Button size="sm" variant="outline" onClick={clear}>
              <Trash2 className="h-3.5 w-3.5" /> ล้าง
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
