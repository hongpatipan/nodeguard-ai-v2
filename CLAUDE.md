# NodeGuard AI (Gemini Edition)

Internal web tool ให้ทีม dev รีวิวโค้ด Node.js (JS/TS) อัตโนมัติ — ดึง diff จาก GitHub PR /
GitLab MR แล้วส่งให้ Google Gemini วิเคราะห์เฉพาะปัญหาที่เกิดกับ Node.js runtime เท่านั้น
(Event Loop Blocking, Memory Leaks & Async, Database & I/O, Security & Error Handling —
ไม่รีวิว style/naming) รายละเอียดเต็มอยู่ใน `README.md`

## Stack
Next.js 15 (App Router, TypeScript) · Tailwind + Shadcn UI (dark theme) ·
`@google/genai` · GitHub/GitLab REST API · deploy บน Vercel

## จุดสำคัญที่ต้องรู้ก่อนแก้โค้ด

- **BYOK**: แต่ละคนกรอก Gemini API key เองผ่านหน้าเว็บ เก็บใน `localStorage` เท่านั้น
  ส่งผ่าน header `X-Gemini-Api-Key` — server ไม่เก็บ key ใครไว้เลย ถ้าไม่กรอก fallback ไปใช้
  `GEMINI_API_KEY` กลางใน `.env.local`
- **Model ปัจจุบัน** (เช็ค `lib/gemini-models.ts` เสมอ เพราะ Google เปลี่ยนบ่อย): `gemini-3.8-flash`
  (default) และ `gemini-3.1-pro-preview` — ห้ามเดาชื่อ model จากความจำเก่า ต้องเช็คไฟล์จริง
- **Resilience**: 503/500 retry อัตโนมัติ 4 ครั้ง (`lib/gemini-client.ts`) แล้วถ้ายัง fail
  สลับโมเดล Flash↔Pro อัตโนมัติ (`app/api/review/route.ts`) — 429 ไม่ retry เพราะเป็นโควตารายวัน
- **Quick Scan**: ปุ่มตรวจฟรีแบบไม่ใช้ AI ด้วย ESLint (`lib/static-scan.ts`) — ใช้เวลา
  Gemini โดนโควตา ต้องมี `files:` glob ชัดเจนใน ESLint flat config ไม่งั้น `.ts` จะไม่โดนตรวจ
- **`next.config.mjs`** ต้องมี `serverExternalPackages: ["eslint", "@typescript-eslint/parser", ...]`
  ไม่งั้น webpack จะ bundle ESLint พังตอน build

## Deploy

- Repo: `github.com/hongpatipan/nodeguard-ai-v2` (push main แล้ว Vercel auto-deploy)
- โดเมนที่ใช้งานจริง: **`nodeguard.iamhong.me`** (มี DNS ใช้งานได้)
- `iamhong.me` (apex) และ `www.iamhong.me` — **ไม่มี DNS record ตั้งใจ** เว้นไว้ให้โปรเจกต์อื่นในอนาคต
  → `metadataBase` ใน `app/layout.tsx` ต้องชี้ไปที่ `nodeguard.iamhong.me` เท่านั้น ห้ามเปลี่ยนกลับไป
  `iamhong.me` เด็ดขาด (เคยทำให้ OG image ดึงไม่ได้เลยมาแล้ว)
- Environment Variables ต้องไปตั้งเองในหน้า Vercel Project Settings (ไม่ sync จาก `.env.local`
  อัตโนมัติหลัง initial import) — เช็คให้แน่ใจว่าใส่ `GEMINI_API_KEY` จริงแล้ว ไม่งั้นปุ่ม
  "Review with AI" บน production จะใช้งานไม่ได้ (Quick Scan ใช้ได้ปกติเพราะไม่พึ่ง Gemini)

## งานที่ค้างอยู่ (ยังไม่ยืนยันกับ user)

- `nodeguard.iamhong.me` ตอนนี้ตั้งเป็น "Production" domain เดี่ยว ๆ ใน Vercel — ยังไม่ได้ถามว่า
  อยากให้ทำ redirect หรือปล่อยไว้แบบนี้ต่อ (ประเด็น SEO duplicate content ถ้ามีโดเมนอื่นชี้มาซ้ำ)
- ยังไม่ยืนยันว่า user กรอกค่า Environment Variables จริงบน Vercel แล้ว redeploy หรือยัง

## Commit convention
- **ห้าม Claude รัน `git commit` เองเด็ดขาด** (แก้ไขจากกฎเดิมที่แค่ "ต้องถามก่อน" — ตอนนี้เข้มกว่านั้น
  คือห้ามรันเองแม้ user จะอนุมัติแล้วก็ตาม) เหตุผล: ทุก commit ที่ Claude รันจะมี
  `Co-Authored-By: Claude Sonnet 5` ติดมาอัตโนมัติตามนโยบายระบบ (เอาออกไม่ได้) ทำให้ชื่อ "claude"
  ไปโผล่ใน GitHub Contributors ซึ่ง user ไม่ต้องการ
- **ขั้นตอนที่ถูกต้องแทน**: หลังแก้โค้ดเสร็จและ verify แล้ว ให้ Claude เตรียมให้ user ครบ 2 อย่าง —
  (1) `git add` ไฟล์ที่เกี่ยวข้องได้ตามปกติ (ไม่สร้าง commit จริง ไม่มีปัญหา attribution)
  (2) ข้อความ commit message ที่ร่างไว้ให้ (ภาษาไทยหรืออังกฤษตามบริบท) แบบ copy-paste ได้ทันที
  โดย**ไม่ต้องมี** `Co-Authored-By` เพราะ user เป็นคน commit เอง ไม่ใช่ Claude
  แล้วให้ user รัน `git commit -m "..."` และ `git push` ด้วยตัวเอง
- Author จะเป็นชื่อ/อีเมลของ user เองโดยอัตโนมัติ (`hongpatipan` / `hongpatipan@gmail.com`)
  เพราะ user เป็นคนรันคำสั่งเอง ไม่มีทาง attribution อื่นติดเข้ามาได้เลย

## เรื่อง GitHub Contributors แสดงชื่อ "claude"
User ต้องการให้ Contributors เหลือชื่อตัวเองคนเดียว แต่ตอนนี้ระบบกำหนดให้ทุก commit ที่ Claude
สร้างต้องมี `Co-Authored-By: Claude Sonnet 5` ต่อท้ายเสมอ (นโยบายนี้ประกาศไว้ว่า "replaces any
earlier attribution guidance" คือ override ข้อตกลงเดิมในช่วงต้น session ที่เคย amend ลบออกให้ได้)
→ **ห้าม amend/rebase ลบ trailer นี้ออกจาก commit ที่ Claude เป็นคนสร้างอีก** แม้ user จะขอก็ตาม
ต้องอธิบายข้อจำกัดนี้ให้ user ทราบตรงๆ แทน — ถ้า user ยืนยันว่าไม่ต้องการ attribution เลยจริงๆ
ทางออกคือให้ user รัน git commands เอง (ไม่ใช่ให้ Claude รันแทน)

test