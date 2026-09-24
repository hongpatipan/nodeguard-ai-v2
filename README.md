# NodeGuard AI (Gemini Edition)

Personal dashboard ที่ทำอย่างเดียว: **review โค้ด Node.js (JS/TS) หาปัญหาที่เกิดเฉพาะกับ Node.js runtime**
ขับเคลื่อนด้วย **Google Gemini** (Free Tier ผ่าน Google AI Studio — ไม่ต้องผูกบัตรเครดิต)

## ขอบเขตการรีวิว (4 หมวดเท่านั้น)

| หมวด | ตัวอย่างที่จับ |
|---|---|
| Event Loop Blocking | `fs.readFileSync`, `execSync`, CPU-heavy ใน handler, ReDoS, await ใน loop |
| Memory Leaks & Async | unhandled rejection, async ไม่มี try/catch, module-level shared state, listener/interval ค้าง, cache ไม่มี TTL |
| Database & I/O | N+1 query, ไม่มี pagination/LIMIT, โหลดทั้งตารางเข้า memory, ไม่มี pool/timeout/transaction |
| Security & Error Handling | unsanitized input, SQL/NoSQL/command injection, prototype pollution, log secret, ส่ง stack trace กลับ client |

เรื่อง style / naming / การเลือก library **ไม่อยู่ในขอบเขต** — system instruction สั่งห้ามไว้ชัดเจน

## Stack

Next.js 15 (App Router) · TypeScript · Tailwind CSS + Shadcn UI (dark) · `@google/genai` (structured JSON output) · GitHub REST API + GitLab REST API (v4)

## ติดตั้ง

```bash
npm install
cp .env.example .env.local   # ใส่ GEMINI_API_KEY — ขอฟรีได้ที่ aistudio.google.com/apikey
npm run dev
```

## API Key (BYOK) — สำหรับทีม

เว็บนี้ออกแบบให้เป็น **เว็บตัวกลาง (internal tool) ที่ทีม dev แชร์กัน** ทุกคนจึงกรอก
Gemini API Key ของตัวเองได้ที่ช่อง "Gemini API Key" บนหน้าเว็บ (ขอฟรีได้ที่ aistudio.google.com/apikey):

- key ถูกเก็บใน `localStorage` ของเบราว์เซอร์แต่ละคนเท่านั้น **ไม่เคยถูกบันทึกไว้ที่ server**
- ตอนกด Review จะแนบ key ไปกับ request ผ่าน header `X-Gemini-Api-Key` แล้ว server สร้าง
  Gemini client เฉพาะ request นั้น ๆ
- ถ้าใครไม่ได้กรอก key ของตัวเอง ระบบจะ fallback ไปใช้ `GEMINI_API_KEY` กลางที่ตั้งไว้ใน
  `.env.local` ของ server (ถ้ามี) — ใครใช้โควตา Free Tier ของ key ใครก็เห็นค่าใช้จ่ายของตัวเองใน usage badge
- ไม่ตั้งอะไรเลยทั้งสองทาง → API จะตอบ 401 พร้อมข้อความบอกให้กรอก key

> เพราะ key อยู่แค่ใน browser ของแต่ละคน ถ้าเปลี่ยนเครื่อง/ล้าง site data ต้องกรอกใหม่ —
> ตั้งใจให้เป็นแบบนี้เพื่อไม่ให้ต้องมี auth/database เพิ่มสำหรับ internal tool เล็ก ๆ

## Model ที่เลือกได้

Dropdown บนหน้า Input เลือกได้ 2 ตัว ค่าเริ่มต้นคุมด้วย `GEMINI_DEFAULT_MODEL` ใน `.env.local`:

| Model | ใช้เมื่อ |
|---|---|
| `gemini-3.8-flash` (default) | เร็ว เข้า Free Tier ได้ — โควตาจำกัดกว่ารุ่นก่อนมาก (หลักสิบ request/วัน ไม่ใช่ต่อนาที) |
| `gemini-3.1-pro-preview` | วิเคราะห์ลึกกว่า ราคา pay-as-you-go สูงกว่า Flash — เผื่อ diff ซับซ้อน |

> **Google เปลี่ยน/เลิกใช้โมเดล Gemini บ่อยกว่าที่คิด** — `gemini-2.5-flash`/`gemini-2.5-pro` ที่เคยเป็น
> ค่าเริ่มต้นถูกปิดสำหรับโปรเจกต์ใหม่ไปแล้ว ถ้าเจอ error `404 ... no longer available` ให้เช็ครายการ
> โมเดลปัจจุบันที่ [ai.google.dev/gemini-api/docs/models](https://ai.google.dev/gemini-api/docs/models)
> แล้วแก้ id ใน `lib/gemini-models.ts` (และ `lib/gemini-pricing.ts` ถ้าอยากได้ราคาประมาณที่ถูกต้อง)
> โควตา Free Tier เช็คล่าสุดที่ [ai.google.dev/gemini-api/docs/rate-limits](https://ai.google.dev/gemini-api/docs/rate-limits)
> — ถ้าชน rate limit เว็บนี้จะโชว์ error ชัดเจนให้รอแล้วลองใหม่

**เจอ error 503 "high demand" / 500 ไม่ใช่ปัญหาโควตาของคุณ** — เป็น error ฝั่ง Google เองตอนเซิร์ฟเวอร์โหลดสูง
(มักเกิดหนักกับโมเดลที่เพิ่งเปิดตัวใหม่ เพราะ Free Tier โดน deprioritize ก่อน paid traffic) มี 2 ชั้นรับมือ:

1. `lib/gemini-client.ts` retry บนโมเดลเดิมอัตโนมัติ 4 ครั้งแบบ backoff (2s, 4s, 8s, 16s — รวมสูงสุด ~30s)
2. ถ้า retry หมดแล้วยัง 503/500 อยู่ `app/api/review/route.ts` จะ **สลับไปลองอีกโมเดลในลิสต์ให้อัตโนมัติ**
   (Flash ↔ Pro ใช้ capacity pool คนละก้อนกัน มักไม่ล่มพร้อมกัน) พร้อม retry อีก 2 ครั้งบนโมเดลสำรอง —
   ถ้าสำเร็จ UI จะโชว์แถบแจ้งเตือนสีเหลืองบอกว่าโมเดลไหนถูกสลับไปใช้แทน (`fallbackUsed` ใน response)

ถ้าลองทั้งสองโมเดลแล้วยัง fail ทั้งคู่ ถึงจะโชว์ error สุดท้ายให้ผู้ใช้เห็น พร้อมข้อความบอกชัดว่าไม่เกี่ยวกับโควตา —
**ไม่ retry** สำหรับ 429 เพราะ Free Tier ส่วนใหญ่เป็นโควตา "ต่อวัน" ไม่ใช่ burst limit การ retry รัว ๆ จะไม่ช่วยและเสียเวลาเปล่า

## กลไกประหยัด Token

**1. กรองไฟล์ที่ไม่ใช่ Node.js logic — `lib/node-diff-filter.ts`**

ตัดทิ้งก่อนส่ง Gemini เสมอ: `package-lock.json` / `yarn.lock` / `pnpm-lock.yaml`, `*.md`, `*.svg` และ asset อื่น ๆ,
`*.css`, `*.d.ts`, `*.min.js`, `*.snap`, `*.yml`, และทุกอย่างใต้ `dist/` `build/` `.next/` `node_modules/` `coverage/`
เหลือเฉพาะ `.js .jsx .mjs .cjs .ts .tsx .mts .cts`

**2. ส่งเฉพาะส่วนต่าง**

`compactHunk()` เก็บเฉพาะบรรทัด `+`/`-` พร้อม context 3 บรรทัด ส่วนที่ตัดออกยุบเป็น `…`
ไฟล์เรียงตามจำนวนบรรทัดที่เปลี่ยน ถ้าชนเพดาน `MAX_DIFF_CHARS` จะตัดไฟล์ที่เปลี่ยนน้อยที่สุดก่อน —
ช่วยทั้งประหยัด token และลดโอกาสชน rate limit ของ Free Tier
ผู้ใช้ที่วางโค้ดเต็มไฟล์เองก็ยังทำงานได้ (`prepareReviewInput` ตรวจเองว่าเป็น diff หรือโค้ดดิบ)

**3. Implicit caching**

Gemini ไม่มี `cache_control` ให้ตั้งเองแบบ Claude — แต่โมเดลรุ่นใหม่ ๆ (ตั้งแต่ 2.5 เป็นต้นมา) ทำ
**implicit caching** อัตโนมัติเมื่อ prefix ของคำขอซ้ำกับคำขอก่อนหน้าเร็ว ๆ นี้ (system instruction ตัวเดียวกันทุกครั้ง)
`lib/prompts.ts` จึงเขียนให้นิ่งที่สุด ไม่มี timestamp/ตัวแปรปนอยู่เลย เพื่อเพิ่มโอกาสเข้า cache —
ถ้าเข้า cache จริง `usageMetadata.cachedContentTokenCount` จะไม่ใช่ 0 และ badge จะโชว์ "implicit cache hit"

## Structured Output

ใช้ `responseMimeType: "application/json"` + `responseSchema` (รูปแบบ Gemini schema จาก `lib/gemini-schema.ts`)
บังคับให้ Gemini ตอบเป็น JSON ตาม shape ที่กำหนดเสมอ แล้ว validate ซ้ำอีกชั้นด้วย zod (`lib/types.ts`)
ก่อนส่งกลับ frontend — กัน response ที่หลุด schema ไม่ให้ไปทำหน้าเว็บพัง

## Quick Scan — ตรวจโค้ดฟรี ไม่ใช้ AI เลย

ปุ่ม "⚡ Quick Scan (ฟรี, ไม่ใช้ AI)" ข้าง ๆ ปุ่ม Review — ใช้ ESLint rule ตายตัวสแกนแทน ไม่เรียก Gemini
เลยสักครั้งเดียว จึงไม่มี rate limit / โควตา / ค่าใช้จ่ายใด ๆ เหมาะเป็นทางเลือกตอน Gemini quota หมด
หรือแค่อยากได้ผลไว ๆ

**ครอบคลุม:** sync I/O ที่บล็อก event loop (`fs.readFileSync`, `execSync` ฯลฯ — ทั้งแบบ
`fs.readFileSync()` และ `import { readFileSync } from "fs"`), `eval()`/`setTimeout` ด้วย string,
unsafe regex (ReDoS), path/command injection ที่ไม่ใช่ literal (ผ่าน `eslint-plugin-security`)

**ไม่ครอบคลุม:** N+1 query, memory leak เชิง lifecycle, หรือปัญหาที่ต้องเข้าใจบริบทข้ามไฟล์ — จุดที่
AI review (`lib/prompts.ts`) ยังทำได้ดีกว่ามาก ผลลัพธ์จาก Quick Scan จะบอกไว้ตรง ๆ ในสรุปทุกครั้งว่า
ไม่ครอบคลุมแค่ไหน ไม่ได้แสร้งทำเป็นครบเหมือน AI review

**ข้อจำกัดของ input:** ESLint ต้อง parse syntax ให้ครบทั้งไฟล์ (diff hunk ที่มีแค่บรรทัด `+`/`-` พร้อม
`…` คั่น parse ไม่ผ่าน) ดังนั้น:
- แท็บ **PR / MR URL** ใช้ได้เต็มที่ — ระบบดึงเนื้อไฟล์เต็ม (ไม่ใช่แค่ diff) จาก GitHub Contents API /
  GitLab Repository Files API ให้อัตโนมัติ (`lib/vcs.ts` -> `fetchChangedFileContents`, สูงสุด 15 ไฟล์/ครั้ง)
- แท็บ **วางโค้ด/diff** ใช้ได้เฉพาะตอนวางโค้ดเต็มไฟล์ — ถ้าวาง diff ไว้ ระบบจะโชว์ error บอกให้เปลี่ยน
  ไปใช้ URL แทน หรือวางโค้ดเต็มไฟล์

โค้ดหลักอยู่ที่ `lib/static-scan.ts` — เพิ่ม/ปรับ rule หรือ severity/category ได้ที่นั่น ผลลัพธ์ประกอบ
ออกมาเป็น shape เดียวกับ `ReviewResponse` ของ AI review เป๊ะ (`model: "quick-scan"`, cost = $0 เสมอ)
จึง reuse `ReviewDashboard` component และเก็บลง Dashboard history ได้เหมือนกันทุกอย่าง

> **หมายเหตุสำหรับคน deploy เอง:** ต้องมี `serverExternalPackages: ["eslint", "@typescript-eslint/parser",
> "eslint-plugin-security"]` ใน `next.config.mjs` (ตั้งไว้แล้ว) ไม่งั้น Next.js server bundler จะทำให้
> `@typescript-eslint/parser` resolve เป็น `undefined` แบบเงียบ ๆ (ปัญหา ESM/CJS interop เฉพาะทาง) ทำให้
> ESLint fallback ไปใช้ parser พื้นฐานที่ไม่เข้าใจ syntax ของ TypeScript แล้ว parse ไฟล์ .ts ทุกไฟล์ไม่ผ่าน

## หน้า Dashboard

`/dashboard` (ลิงก์จาก nav บนสุดของทุกหน้า) รวม 3 อย่างไว้ในที่เดียว:

- **System Status** — เช็คว่า Gemini key (ทั้งของคุณเองและกลางของ server), `GITHUB_TOKEN`, `GITLAB_TOKEN`
  ตั้งไว้หรือยัง (boolean เท่านั้น ไม่มีค่าจริงหลุดออกมา) พร้อมปุ่ม **ทดสอบเชื่อมต่อ Gemini** ที่ใช้
  `models.get()` แทน `generateContent()` — เป็น metadata call ที่ไม่กิน token/โควตา กดทดสอบซ้ำได้เรื่อย ๆ
- **สรุปค่าใช้จ่าย** — stat tile รวมจำนวน review / token / ค่าใช้จ่ายประมาณ / critical ที่เจอ / cache hit rate
  พร้อม breakdown แยกตามโมเดล
- **ประวัติ Review** — คลิกแถวเพื่อดูรายละเอียดเต็ม (ใช้ `ReviewDashboard` component เดียวกับหน้า Review)
  ลบทีละรายการหรือล้างทั้งหมดได้

ทุกอย่างในหน้านี้ (ยกเว้น System Status ที่เช็คสดจาก server) **มาจาก `localStorage` ของเบราว์เซอร์คุณเอง**
ไม่มี database — ทุกครั้งที่ review สำเร็จจากหน้าแรก จะถูกเก็บลง `localStorage` อัตโนมัติ (เก็บ 25 รายการล่าสุด)
ดังนั้นประวัติจะเห็นเฉพาะในเบราว์เซอร์/เครื่องที่รัน review เท่านั้น

## โครงสร้างโปรเจกต์

```
node-code-reviewer/
├── app/
│   ├── api/
│   │   ├── review/route.ts      # Gemini API + structured JSON output + BYOK + retry
│   │   ├── diff-preview/route.ts # preview diff ที่กรองแล้ว (ยังไม่เรียก Gemini)
│   │   ├── status/route.ts      # boolean สถานะ key/token ฝั่ง server (ใช้โดยหน้า Dashboard)
│   │   ├── ping/route.ts        # ทดสอบเชื่อมต่อ Gemini แบบไม่กิน token (models.get)
│   │   └── quick-scan/route.ts  # ★ ตรวจโค้ดด้วย ESLint ฟรี ไม่ใช้ AI เลย
│   ├── dashboard/page.tsx       # System status + สรุปค่าใช้จ่าย + ประวัติ review
│   ├── globals.css              # dark theme tokens
│   ├── layout.tsx
│   └── page.tsx                 # input + model selector + dashboard ผลรีวิว
├── components/
│   ├── page-nav.tsx             # nav บาร์สลับ Review / Dashboard
│   ├── review-dashboard.tsx     # issue cards + before/after (reuse ในหน้า Dashboard ด้วย)
│   ├── usage-badge.tsx          # token usage & ค่าใช้จ่ายโดยประมาณ
│   ├── stat-tile.tsx            # stat tile ใช้ในหน้า Dashboard
│   ├── model-selector.tsx       # dropdown Flash / Pro
│   ├── api-key-settings.tsx     # ช่องกรอก Gemini API Key ส่วนตัว (BYOK)
│   └── ui/                      # shadcn primitives (รวม select)
├── lib/
│   ├── node-diff-filter.ts      # ★ กรองไฟล์ + ย่อย diff
│   ├── github.ts                # ดึง diff จาก GitHub PR
│   ├── gitlab.ts                # ดึง diff จาก GitLab MR (gitlab.com + self-hosted)
│   ├── vcs.ts                   # รวมจุดเข้า GitHub/GitLab เดียว + ดึงเนื้อไฟล์เต็มสำหรับ Quick Scan
│   ├── static-scan.ts           # ★ Quick Scan — ตรวจโค้ดด้วย ESLint ฟรี ไม่ใช้ AI
│   ├── gemini-client.ts         # client factory + retry + error-message extraction (ใช้ร่วม review/ping)
│   ├── gemini-schema.ts         # responseSchema แบบ Gemini native (ใช้ Type enum)
│   ├── gemini-pricing.ts        # ประมาณค่าใช้จ่าย pay-as-you-go
│   ├── gemini-models.ts         # รายการโมเดลที่เลือกได้ + default
│   ├── history.ts               # ประวัติ review ใน localStorage (ใช้โดยหน้า Dashboard)
│   ├── prompts.ts               # ★ system instruction (ต้องนิ่งเพื่อ implicit cache)
│   ├── types.ts                 # zod schema ของผลรีวิว
│   └── utils.ts
└── .env.example
```

## API

`POST /api/review` — body: `{ "url": "https://github.com/o/r/pull/1", "model": "gemini-3.8-flash" }`
(รองรับทั้ง GitHub PR และ GitLab MR URL) หรือ `{ "code": "<diff หรือโค้ด>", "model": "gemini-3.1-pro-preview" }`
(`model` ไม่ใส่ก็ได้ ใช้ default)

```jsonc
{
  "review": {
    "summary": "…",
    "verdict": "block | needs-work | approve",
    "issues": [{
      "severity": "critical", "category": "event-loop-blocking",
      "file": "src/api/report.ts", "line": 42,
      "title": "…", "problem": "…", "impact": "…",
      "before": "…", "after": "…"
    }]
  },
  "usage": { "promptTokens": 1820, "outputTokens": 640, "estimatedCost": 0.0007, "cacheHit": false, "…": "…" },
  "filterStats": { "totalFiles": 18, "keptFiles": 6, "savedPercent": 91, "skippedFiles": [] },
  "model": "gemini-3.8-flash"
}
```

`POST /api/diff-preview` — body: `{ "url": "…" }` (GitHub PR หรือ GitLab MR) คืน `filterStats` + ตัวอย่าง payload
โดยไม่เรียก Gemini

`POST /api/quick-scan` — body: `{ "url": "…" }` (GitHub PR/GitLab MR) หรือ `{ "code": "<โค้ดเต็มไฟล์>" }`
(ห้ามเป็น diff) คืน `ReviewResponse` shape เดียวกับ `/api/review` แต่ `model: "quick-scan"` และ
`usage.estimatedCost` เป็น 0 เสมอ — ไม่เรียก Gemini เลย

`GET /api/status` — คืน `{ hasServerKey, hasGithubToken, hasGitlabToken, defaultModel, maxDiffChars }`
(boolean/string ล้วน ไม่มีค่า key/token จริงหลุดออกมา)

`POST /api/ping` — body: `{ "model"?: "…" }` ทดสอบว่า key ที่ใช้ (BYOK header หรือ key กลางของ server)
เชื่อมต่อ Gemini ได้จริงไหม ผ่าน `models.get()` — ไม่กิน generation token

## ปรับแต่ง

| ต้องการ | แก้ที่ |
|---|---|
| เพิ่ม/ลดชนิดไฟล์ที่กรอง | `IGNORED_*` ใน `lib/node-diff-filter.ts` |
| เพิ่ม context รอบ diff | `contextLines` ใน `filterNodeDiff` (ค่าเริ่มต้น 3) |
| เพดานขนาด diff | `MAX_DIFF_CHARS` ใน `.env.local` |
| เพิ่ม/ลดโมเดลใน dropdown | `GEMINI_MODELS` ใน `lib/gemini-models.ts` |
| แก้ checklist การรีวิว | `NODE_REVIEW_SYSTEM_INSTRUCTION` ใน `lib/prompts.ts` |
