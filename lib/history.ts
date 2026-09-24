/**
 * ประวัติการ review เก็บฝั่ง client เท่านั้น (localStorage) — ไม่มี database ฝั่ง server
 * เพราะเว็บนี้เป็น internal tool เล็ก ๆ ที่ไม่อยากผูก infra เพิ่ม ประวัติจึงเห็นเฉพาะในเบราว์เซอร์
 * ของแต่ละคน เหมือนกับ Gemini API Key (BYOK)
 */
import type { ReviewResponse } from "./types";

const HISTORY_KEY = "nodeguard-ai:review-history";
/** เก็บแค่ N รายการล่าสุด กัน localStorage บวม (แต่ละ entry มี issues เต็มด้วย อาจหนักหลาย KB) */
const MAX_HISTORY = 25;

export type HistoryEntry = {
  id: string;
  timestamp: number;
  data: ReviewResponse;
};

export function loadHistory(): HistoryEntry[] {
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as HistoryEntry[]) : [];
  } catch {
    // private mode / storage ถูกบล็อก / JSON เพี้ยน — ถือว่าไม่มีประวัติแทนการ throw
    return [];
  }
}

function persist(entries: HistoryEntry[]): void {
  try {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(entries));
  } catch {
    // localStorage เต็ม/ถูกบล็อก — ปล่อยผ่าน ไม่ทำให้ flow การ review ที่เพิ่งเสร็จพัง
  }
}

export function appendHistoryEntry(data: ReviewResponse): HistoryEntry[] {
  const entry: HistoryEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: Date.now(),
    data,
  };
  const next = [entry, ...loadHistory()].slice(0, MAX_HISTORY);
  persist(next);
  return next;
}

export function removeHistoryEntry(id: string): HistoryEntry[] {
  const next = loadHistory().filter((e) => e.id !== id);
  persist(next);
  return next;
}

export function clearHistory(): void {
  try {
    window.localStorage.removeItem(HISTORY_KEY);
  } catch {
    // ignore
  }
}
