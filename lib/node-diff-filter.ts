/**
 * node-diff-filter
 * ----------------
 * กรอง "ไฟล์ที่ไม่ใช่ Node.js logic" ออกจาก git diff และย่อย hunk ให้เหลือเฉพาะ
 * บรรทัดที่เปลี่ยน + context สั้น ๆ ก่อนส่งให้ Claude — เป้าหมายคือลด input token
 * โดยไม่ทำให้ reviewer ขาดบริบทที่จำเป็น
 */

/** นามสกุลไฟล์ที่ถือว่าเป็น Node.js logic จริง ๆ */
const NODE_SOURCE_EXTENSIONS = new Set([
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
]);

/** โฟลเดอร์ที่เป็น build output / dependency — ไม่มีประโยชน์ต่อการ review */
const IGNORED_DIR_SEGMENTS = [
  "node_modules",
  "dist",
  "build",
  "out",
  ".next",
  ".turbo",
  ".vercel",
  ".nuxt",
  "coverage",
  ".git",
  "vendor",
  "public",
  "__snapshots__",
  ".yarn",
  ".pnpm-store",
];

/** ไฟล์เฉพาะเจาะจงที่กิน token มหาศาลแต่ไม่มี logic */
const IGNORED_FILENAMES = new Set([
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "bun.lockb",
  "npm-shrinkwrap.json",
  "composer.lock",
  "go.sum",
]);

/** pattern ของไฟล์ที่ไม่ใช่ logic (doc, asset, config ที่ไม่มี runtime behavior) */
const IGNORED_FILE_PATTERNS: RegExp[] = [
  /\.(md|mdx|txt|rst|adoc)$/i,
  /\.(svg|png|jpe?g|gif|webp|avif|ico|bmp|tiff?)$/i,
  /\.(woff2?|ttf|otf|eot)$/i,
  /\.(mp4|webm|mov|mp3|wav|ogg)$/i,
  /\.(css|scss|sass|less|styl)$/i,
  /\.(csv|tsv|xlsx?|pdf)$/i,
  /\.(zip|tar|gz|tgz|rar|7z)$/i,
  /\.(snap|map)$/i,
  /\.min\.js$/i,
  /\.d\.ts$/i, // type declaration — ไม่มี runtime logic
  /\.(yml|yaml|toml|ini)$/i,
  /^\.(env|gitignore|npmrc|nvmrc|editorconfig|prettierrc|eslintrc)/i,
  /(^|\/)(LICENSE|CHANGELOG|README)/i,
];

export type DiffFile = {
  /** path ของไฟล์ (ฝั่ง b/ เป็นหลัก) */
  path: string;
  /** hunk ที่ย่อยแล้ว */
  hunks: DiffHunk[];
  status: "added" | "modified" | "deleted" | "renamed";
  additions: number;
  deletions: number;
};

export type DiffHunk = {
  /** เลขบรรทัดเริ่มต้นฝั่งใหม่ (ใช้อ้าง line number ตอนรายงาน issue) */
  newStart: number;
  header: string;
  lines: string[];
};

export type FilterStats = {
  totalFiles: number;
  keptFiles: number;
  skippedFiles: { path: string; reason: string }[];
  originalChars: number;
  filteredChars: number;
  /** % ที่ประหยัดได้จากการกรอง */
  savedPercent: number;
  truncated: boolean;
};

export type FilterResult = {
  /** payload ที่พร้อมส่งให้ Claude */
  content: string;
  files: DiffFile[];
  stats: FilterStats;
};

/**
 * ตรวจว่าไฟล์นี้ควรถูกส่งให้ AI review หรือไม่
 * คืน null = ผ่าน, คืน string = เหตุผลที่ถูกกรองทิ้ง
 */
export function getSkipReason(filePath: string): string | null {
  const normalized = filePath.replace(/^[ab]\//, "").trim();
  if (!normalized) return "empty path";

  const segments = normalized.split("/");
  const filename = segments[segments.length - 1];

  for (const segment of segments.slice(0, -1)) {
    if (IGNORED_DIR_SEGMENTS.includes(segment)) return `build/vendor dir (${segment}/)`;
  }

  if (IGNORED_FILENAMES.has(filename)) return "lockfile";

  for (const pattern of IGNORED_FILE_PATTERNS) {
    if (pattern.test(normalized) || pattern.test(filename)) return "non-logic file";
  }

  const dot = filename.lastIndexOf(".");
  const ext = dot === -1 ? "" : filename.slice(dot).toLowerCase();
  if (!NODE_SOURCE_EXTENSIONS.has(ext)) return `not a Node.js source file (${ext || "no ext"})`;

  return null;
}

export function isNodeReviewableFile(filePath: string): boolean {
  return getSkipReason(filePath) === null;
}

/** แยก unified diff ออกเป็นรายไฟล์ */
export function parseUnifiedDiff(rawDiff: string): DiffFile[] {
  const files: DiffFile[] = [];
  // แยกที่ "diff --git" โดยยังเก็บ header ไว้กับ block ของตัวเอง
  const blocks = rawDiff.split(/^diff --git /m).filter((b) => b.trim().length > 0);
  const chunks = blocks.length > 1 || /^diff --git /m.test(rawDiff) ? blocks : [rawDiff];

  for (const block of chunks) {
    const lines = block.split("\n");
    let path = "";
    let status: DiffFile["status"] = "modified";
    const hunks: DiffHunk[] = [];
    let current: DiffHunk | null = null;
    let additions = 0;
    let deletions = 0;

    for (const line of lines) {
      if (line.startsWith("+++ ")) {
        const p = line.slice(4).trim();
        if (p !== "/dev/null") path = p.replace(/^b\//, "");
        else status = "deleted";
        continue;
      }
      if (line.startsWith("--- ")) {
        const p = line.slice(4).trim();
        if (p === "/dev/null") status = "added";
        if (!path && p !== "/dev/null") path = p.replace(/^a\//, "");
        continue;
      }
      if (line.startsWith("rename to ")) {
        status = "renamed";
        path = line.slice("rename to ".length).trim();
        continue;
      }
      if (line.startsWith("Binary files")) {
        current = null;
        continue;
      }
      if (line.startsWith("@@")) {
        const match = /@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)/.exec(line);
        current = {
          newStart: match ? parseInt(match[1], 10) : 1,
          header: match?.[2]?.trim() ?? "",
          lines: [],
        };
        hunks.push(current);
        continue;
      }
      if (current) {
        if (line.startsWith("+")) additions++;
        else if (line.startsWith("-")) deletions++;
        current.lines.push(line);
      }
    }

    // fallback: header บรรทัดแรก "a/path b/path"
    if (!path) {
      const m = /^"?a\/(.+?)"? "?b\/(.+?)"?$/.exec(lines[0]?.trim() ?? "");
      if (m) path = m[2];
    }

    if (path && hunks.length > 0) {
      files.push({ path, hunks, status, additions, deletions });
    }
  }

  return files;
}

/**
 * ย่อย hunk: เก็บเฉพาะบรรทัดที่เปลี่ยน + context รอบ ๆ ไม่เกิน `contextLines`
 * บรรทัด context ที่ถูกตัดจะยุบเป็น "…" เพื่อบอก AI ว่ามีช่องว่าง
 */
export function compactHunk(hunk: DiffHunk, contextLines = 3): DiffHunk {
  const keep = new Set<number>();
  hunk.lines.forEach((line, i) => {
    if (line.startsWith("+") || line.startsWith("-")) {
      for (let j = Math.max(0, i - contextLines); j <= Math.min(hunk.lines.length - 1, i + contextLines); j++) {
        keep.add(j);
      }
    }
  });

  const out: string[] = [];
  let gap = false;
  hunk.lines.forEach((line, i) => {
    if (keep.has(i)) {
      out.push(line);
      gap = false;
    } else if (!gap) {
      out.push("…");
      gap = true;
    }
  });

  return { ...hunk, lines: out };
}

export type BuildOptions = {
  /** จำนวนบรรทัด context รอบการเปลี่ยนแปลง */
  contextLines?: number;
  /** เพดานตัวอักษรของ payload ทั้งหมด */
  maxChars?: number;
};

/**
 * จุดเข้าหลัก: รับ raw git diff → คืน payload ที่กรองและย่อแล้ว พร้อมสถิติการประหยัด
 */
export function filterNodeDiff(rawDiff: string, options: BuildOptions = {}): FilterResult {
  const { contextLines = 3, maxChars = 60_000 } = options;
  const originalChars = rawDiff.length;

  const parsed = parseUnifiedDiff(rawDiff);
  const skipped: { path: string; reason: string }[] = [];
  const kept: DiffFile[] = [];

  for (const file of parsed) {
    const reason = getSkipReason(file.path);
    if (reason) {
      skipped.push({ path: file.path, reason });
      continue;
    }
    kept.push({ ...file, hunks: file.hunks.map((h) => compactHunk(h, contextLines)) });
  }

  // เรียงไฟล์ที่เปลี่ยนเยอะสุดก่อน — ถ้าโดน truncate จะได้ตัดไฟล์ที่สำคัญน้อยกว่าออก
  kept.sort((a, b) => b.additions + b.deletions - (a.additions + a.deletions));

  const parts: string[] = [];
  let used = 0;
  let truncated = false;

  for (const file of kept) {
    const body = file.hunks
      .map((h) => `@@ line ${h.newStart} @@${h.header ? ` ${h.header}` : ""}\n${h.lines.join("\n")}`)
      .join("\n");
    const section = `--- FILE: ${file.path} (${file.status}, +${file.additions}/-${file.deletions})\n${body}\n`;

    if (used + section.length > maxChars) {
      truncated = true;
      continue;
    }
    parts.push(section);
    used += section.length;
  }

  const content = parts.join("\n");

  return {
    content,
    files: kept,
    stats: {
      totalFiles: parsed.length,
      keptFiles: parts.length,
      skippedFiles: skipped,
      originalChars,
      filteredChars: content.length,
      savedPercent:
        originalChars > 0 ? Math.max(0, Math.round((1 - content.length / originalChars) * 100)) : 0,
      truncated,
    },
  };
}

/** เดาว่า input ที่ผู้ใช้วางมาเป็น git diff หรือโค้ดดิบ */
export function looksLikeDiff(input: string): boolean {
  return /^diff --git /m.test(input) || (/^@@ -\d+/m.test(input) && /^[+-]/m.test(input));
}

/**
 * ใช้กับ input ที่ผู้ใช้วางเอง: ถ้าเป็น diff → กรองตามปกติ,
 * ถ้าเป็นโค้ดดิบ → ส่งผ่าน (แต่ยัง cap ความยาว)
 */
export function prepareReviewInput(input: string, options: BuildOptions = {}): FilterResult {
  const { maxChars = 60_000 } = options;

  if (looksLikeDiff(input)) return filterNodeDiff(input, options);

  const truncated = input.length > maxChars;
  const content = truncated ? input.slice(0, maxChars) : input;
  return {
    content,
    files: [],
    stats: {
      totalFiles: 1,
      keptFiles: 1,
      skippedFiles: [],
      originalChars: input.length,
      filteredChars: content.length,
      savedPercent: truncated ? Math.round((1 - content.length / input.length) * 100) : 0,
      truncated,
    },
  };
}
