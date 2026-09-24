/**
 * Quick Scan — ตรวจโค้ดด้วย ESLint rule ตายตัว "ไม่ใช้ AI เลย" ฟรี 100% ไม่มี rate limit
 * ใช้เป็นทางเลือกตอน Gemini quota หมด หรือใครอยากได้ผลไวๆ โดยไม่เสีย token
 *
 * ข้อจำกัดที่ตั้งใจ: ครอบคลุมแค่ pattern ที่ตรวจจับได้แน่นอนด้วย AST (sync I/O, eval, unsafe regex,
 * path/command injection) — ไม่ครอบคลุม N+1 query, memory leak เชิง lifecycle, หรือปัญหาที่ต้องเข้าใจ
 * บริบทข้ามไฟล์ ซึ่งเป็นจุดที่ AI review (lib/prompts.ts) ยังทำได้ดีกว่ามาก
 *
 * หมายเหตุสำคัญ: ESLint flat config (v9+) จับคู่ config กับไฟล์ด้วย `files` glob — ถ้าไม่ระบุ
 * นามสกุล .ts/.tsx ไว้ใน `files` ตรงๆ ไฟล์ TypeScript จะไม่ถูกสแกนเลย (getConfig คืน null แบบเงียบๆ
 * ไม่มี error ให้เห็น) เจอปัญหานี้ตอนพัฒนาเลยกันไว้ด้วย FILE_GLOBS ด้านล่าง
 */
import { Linter } from "eslint";
import * as tsParserModule from "@typescript-eslint/parser";
import security from "eslint-plugin-security";

import type { FilterStats } from "./node-diff-filter";
import type { Issue, Review, ReviewResponse } from "./types";

const linter = new Linter();

/**
 * @typescript-eslint/parser คอมไพล์เป็น CJS แบบไม่มี `.default` property (module.exports คือตัว
 * parser เอง) — plain Node synthesize default export ให้อัตโนมัติจาก module.exports ทั้งก้อน แต่
 * Next.js server bundler (แม้ตั้ง serverExternalPackages ให้ไม่ bundle) resolve `import x from ...`
 * เป็น `x.default` ตรงๆ ซึ่งไม่มีจริง ได้ `undefined` แบบเงียบๆ (ESLint เห็น parser เป็น undefined
 * เลย fallback ไปใช้ default parser (espree) แทนแบบไม่มี error — TS syntax เลย parse fail ทั้งไฟล์)
 * แก้ด้วย namespace import + fallback กันสภาพแวดล้อมทั้งสองแบบ
 */
const tsParser = (tsParserModule as unknown as { default?: unknown }).default ?? tsParserModule;

const FILE_GLOBS = ["**/*.js", "**/*.jsx", "**/*.mjs", "**/*.cjs", "**/*.ts", "**/*.tsx", "**/*.mts", "**/*.cts"];

/**
 * sync method ทุกตัวที่ทำให้ Node.js event loop หยุดรอ I/O — บล็อก request อื่นทั้งหมดที่กำลังรออยู่
 * เก็บเป็น map เดียวแล้ว derive เป็น 2 rule ข้างล่าง เพราะโค้ดจริงเรียกได้ 2 แบบที่ AST ต่างกันสิ้นเชิง:
 *   1) import fs from "fs"; fs.readFileSync(...)        -> MemberExpression, จับด้วย no-restricted-properties
 *   2) import { readFileSync } from "fs"; readFileSync() -> bare identifier, จับด้วย no-restricted-imports แทน
 * (เจอช่องโหว่นี้ตอนทดสอบจริง — no-restricted-properties เดี่ยว ๆ พลาด named-import ทั้งหมด)
 */
const SYNC_METHODS_BY_MODULE: Record<string, Record<string, string>> = {
  fs: {
    readFileSync: "ใช้ fs.promises.readFile แทน",
    writeFileSync: "ใช้ fs.promises.writeFile แทน",
    existsSync: "ใช้ fs.promises.access หรือจับ error จาก readFile แทน",
    readdirSync: "ใช้ fs.promises.readdir แทน",
    statSync: "ใช้ fs.promises.stat แทน",
    appendFileSync: "ใช้ fs.promises.appendFile แทน",
    unlinkSync: "ใช้ fs.promises.unlink แทน",
    mkdirSync: "ใช้ fs.promises.mkdir แทน",
    copyFileSync: "ใช้ fs.promises.copyFile แทน",
  },
  child_process: {
    execSync: "ใช้ child_process.exec/execFile (callback/promise) แทน",
    spawnSync: "ใช้ child_process.spawn แทน",
    execFileSync: "ใช้ child_process.execFile (callback/promise) แทน",
  },
  zlib: {
    gzipSync: "ใช้ zlib.gzip (callback) หรือ stream แทน",
    gunzipSync: "ใช้ zlib.gunzip (callback) หรือ stream แทน",
  },
  crypto: {
    pbkdf2Sync: "ใช้ crypto.pbkdf2 (callback/promise) แทน",
    scryptSync: "ใช้ crypto.scrypt (callback/promise) แทน",
    randomFillSync: "ใช้ crypto.randomFill แทน",
  },
};

const RESTRICTED_SYNC_PROPERTIES = Object.entries(SYNC_METHODS_BY_MODULE).flatMap(([object, methods]) =>
  Object.entries(methods).map(([property, message]) => ({ object, property, message })),
);

const RESTRICTED_SYNC_IMPORTS = Object.entries(SYNC_METHODS_BY_MODULE).map(([name, methods]) => ({
  name,
  importNames: Object.keys(methods),
  message: "sync method บล็อก event loop — ใช้เวอร์ชัน async/promise ของโมดูลเดียวกันแทน",
}));

// ESLint's own TS types สำหรับ rule options เข้มงวดกว่าที่ flat config runtime ต้องการจริง (ทดสอบแล้วว่า
// รันได้ถูกต้องตาม probe ด้วยมือก่อนเขียนไฟล์นี้) — cast เป็น Linter.Config[] ตรง ๆ แทนการไล่ satisfy
// generic RulesConfig ของแต่ละ rule ซึ่งไม่คุ้มกับความซับซ้อนที่เพิ่มขึ้น
const CONFIG = [
  {
    files: FILE_GLOBS,
    languageOptions: {
      parser: tsParser,
      ecmaVersion: "latest" as const,
      sourceType: "module" as const,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { security },
    rules: {
      "no-restricted-properties": ["error", ...RESTRICTED_SYNC_PROPERTIES],
      "no-restricted-imports": ["error", { paths: RESTRICTED_SYNC_IMPORTS }],
      "no-eval": "error",
      "no-implied-eval": "error",
      "security/detect-eval-with-expression": "error",
      "security/detect-unsafe-regex": "error",
      "security/detect-non-literal-regexp": "warn",
      "security/detect-non-literal-fs-filename": "warn",
      "security/detect-child-process": "warn",
      "security/detect-possible-timing-attacks": "warn",
    },
  },
] as unknown as Linter.Config[];

type RuleMeta = {
  severity: Issue["severity"];
  category: Issue["category"];
  title: string;
  impact: string;
  fixHint: string;
};

const RULE_META: Record<string, RuleMeta> = {
  "no-restricted-properties": {
    severity: "critical",
    category: "event-loop-blocking",
    title: "Synchronous I/O บล็อก Event Loop",
    impact: "ทุก request อื่นที่กำลังรออยู่จะถูก block จนกว่า operation นี้จะเสร็จ",
    fixHint: "เปลี่ยนไปใช้เวอร์ชัน async (ดูรายละเอียดในข้อความด้านบน)",
  },
  "no-restricted-imports": {
    severity: "critical",
    category: "event-loop-blocking",
    title: "Import ฟังก์ชัน sync ที่บล็อก Event Loop",
    impact: "ทุก request อื่นที่กำลังรออยู่จะถูก block ตอนเรียกใช้ฟังก์ชันนี้",
    fixHint: "เปลี่ยนไปใช้เวอร์ชัน async/promise ของโมดูลเดียวกันแทน",
  },
  "no-eval": {
    severity: "critical",
    category: "security-error-handling",
    title: "ใช้ eval()",
    impact: "เสี่ยง remote code execution ถ้า input มาจากผู้ใช้",
    fixHint: "หลีกเลี่ยง eval() ทั้งหมด ใช้ JSON.parse หรือ parser เฉพาะทางแทน",
  },
  "no-implied-eval": {
    severity: "critical",
    category: "security-error-handling",
    title: "setTimeout/setInterval ด้วย string (เทียบเท่า eval)",
    impact: "เสี่ยง code injection เหมือน eval() โดยตรง",
    fixHint: "ส่ง function เข้า setTimeout/setInterval แทน string",
  },
  "security/detect-eval-with-expression": {
    severity: "critical",
    category: "security-error-handling",
    title: "eval() กับ expression ที่ไม่ใช่ literal",
    impact: "เสี่ยง remote code execution ถ้า expression มาจาก input ผู้ใช้",
    fixHint: "ตรวจสอบ/sanitize input ก่อน หรือหลีกเลี่ยง eval() ทั้งหมด",
  },
  "security/detect-unsafe-regex": {
    severity: "critical",
    category: "security-error-handling",
    title: "Regex เสี่ยง ReDoS (catastrophic backtracking)",
    impact: "input ที่ออกแบบมาเฉพาะทำให้ regex engine ค้าง บล็อก event loop ทั้ง process",
    fixHint: "ปรับ pattern ให้ไม่มี nested quantifier ซ้อนกัน หรือใช้ library ที่ป้องกัน ReDoS",
  },
  "security/detect-non-literal-regexp": {
    severity: "warning",
    category: "security-error-handling",
    title: "สร้าง RegExp จาก input ที่ไม่ใช่ literal",
    impact: "ผู้ใช้อาจส่ง pattern ที่ทำให้เกิด ReDoS ได้",
    fixHint: "validate/whitelist pattern ก่อนสร้าง RegExp หรือใช้ literal pattern แทน",
  },
  "security/detect-non-literal-fs-filename": {
    severity: "warning",
    category: "security-error-handling",
    title: "path ของไฟล์มาจาก input ที่ไม่ใช่ literal",
    impact: "เสี่ยง path traversal ถ้าไม่ sanitize path ก่อนใช้",
    fixHint: "ตรวจสอบ path ด้วย path.resolve + เช็คว่าอยู่ใน allowed directory ก่อนใช้งาน",
  },
  "security/detect-child-process": {
    severity: "warning",
    category: "security-error-handling",
    title: "เรียก child_process ด้วย argument ที่ไม่ใช่ literal",
    impact: "เสี่ยง command injection ถ้า argument มาจาก input ผู้ใช้",
    fixHint: "ใช้ execFile/spawn พร้อม array of arguments แทนการต่อ string เข้า shell",
  },
  "security/detect-possible-timing-attacks": {
    severity: "warning",
    category: "security-error-handling",
    title: "เปรียบเทียบค่า secret แบบ non-timing-safe",
    impact: "เสี่ยง timing attack ในการเดา token/password ทีละตัวอักษร",
    fixHint: "ใช้ crypto.timingSafeEqual แทนการเปรียบเทียบ string ตรงๆ",
  },
};

function extractLineSnippet(code: string, line: number): string {
  const lines = code.split("\n");
  const idx = line - 1;
  if (idx < 0 || idx >= lines.length) return "";
  return lines[idx].trim();
}

export type StaticScanFileResult = { issues: Issue[]; parseError?: string };

export function scanSource(path: string, code: string): StaticScanFileResult {
  let messages;
  try {
    messages = linter.verify(code, CONFIG, path);
  } catch (error) {
    return { issues: [], parseError: error instanceof Error ? error.message : "scan ล้มเหลว" };
  }

  const fatal = messages.find((m) => m.fatal);
  if (fatal) {
    return { issues: [], parseError: `parse โค้ดไม่สำเร็จ: ${fatal.message}` };
  }

  const issues: Issue[] = [];
  for (const m of messages) {
    if (!m.ruleId) continue; // message ที่ไม่มี ruleId คือ config/parse warning ไม่ใช่ finding
    const meta = RULE_META[m.ruleId];
    if (!meta) continue; // กันพังถ้ามี rule ที่ไม่ได้ map ไว้หลุดเข้ามา
    issues.push({
      severity: meta.severity,
      category: meta.category,
      file: path,
      line: m.line ?? 0,
      title: meta.title,
      problem: m.message,
      impact: meta.impact,
      before: extractLineSnippet(code, m.line ?? 0),
      after: `// ${meta.fixHint}`,
    });
  }
  return { issues };
}

export type QuickScanFile = { path: string; content: string };

/** ประกอบผล scan หลายไฟล์ให้อยู่ใน shape เดียวกับ ReviewResponse (ของ AI review) เป๊ะ — เพื่อ reuse
 * ReviewDashboard component ได้ทั้งดุ้นโดยไม่ต้องแก้ UI แม้แต่บรรทัดเดียว */
export function buildQuickScanResponse(
  files: QuickScanFile[],
  skippedFiles: FilterStats["skippedFiles"],
  source: ReviewResponse["source"],
  totalFilesOverride?: number,
): ReviewResponse {
  const allIssues: Issue[] = [];
  const parseErrors: { path: string; message: string }[] = [];

  for (const f of files) {
    const { issues, parseError } = scanSource(f.path, f.content);
    allIssues.push(...issues);
    if (parseError) parseErrors.push({ path: f.path, message: parseError });
  }

  const order: Record<Issue["severity"], number> = { critical: 0, warning: 1, optimization: 2 };
  allIssues.sort((a, b) => order[a.severity] - order[b.severity]);

  const critical = allIssues.filter((i) => i.severity === "critical").length;
  const warning = allIssues.filter((i) => i.severity === "warning").length;
  const verdict: Review["verdict"] = critical > 0 ? "block" : warning > 0 ? "needs-work" : "approve";

  const parseErrorNote =
    parseErrors.length > 0
      ? ` (ข้าม ${parseErrors.length} ไฟล์ที่ parse ไม่สำเร็จ: ${parseErrors.map((e) => e.path).join(", ")})`
      : "";

  const summary =
    `Quick Scan (ESLint, ไม่ใช้ AI) สแกน ${files.length} ไฟล์ พบ ${allIssues.length} ปัญหา — ` +
    `ครอบคลุมเฉพาะ pattern ที่ตรวจจับได้แน่นอน (sync I/O, eval, unsafe regex, path/command injection) ` +
    `ไม่ครอบคลุม N+1 query หรือปัญหาเชิงบริบทที่ต้องใช้ AI ช่วยวิเคราะห์ — กด "Review with AI" เพื่อผลที่ครอบคลุมกว่านี้${parseErrorNote}`;

  const totalChars = files.reduce((s, f) => s + f.content.length, 0);

  return {
    review: { summary, verdict, issues: allIssues },
    usage: {
      model: "quick-scan",
      modelLabel: "Quick Scan (ESLint, ไม่ใช้ AI)",
      promptTokens: 0,
      outputTokens: 0,
      thoughtsTokens: 0,
      cachedTokens: 0,
      totalTokens: 0,
      estimatedCost: 0,
      cacheHit: false,
    },
    filterStats: {
      totalFiles: totalFilesOverride ?? files.length + skippedFiles.length,
      keptFiles: files.length,
      skippedFiles,
      originalChars: totalChars,
      filteredChars: totalChars,
      savedPercent: 0,
      truncated: false,
    },
    source,
    model: "quick-scan",
    requestedModel: "quick-scan",
    fallbackUsed: false,
  };
}
