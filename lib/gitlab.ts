/** ดึง unified diff และเนื้อไฟล์เต็มของ Merge Request ผ่าน GitLab REST API (v4) — รองรับทั้ง gitlab.com และ self-hosted */

export type MergeRequestRef = { origin: string; projectPath: string; iid: number };

// จับทั้ง gitlab.com และ self-hosted instance เพราะ URL shape "/-/merge_requests/{n}" เป็นของ GitLab
// โดยเฉพาะ ไม่ชนกับ path ของ GitHub PR (/pull/{n}) อยู่แล้ว
const MR_URL_PATTERN = /^(https?:\/\/[^/\s]+)\/(.+?)\/-\/merge_requests\/(\d+)/;

export function parseMergeRequestUrl(url: string): MergeRequestRef | null {
  const match = MR_URL_PATTERN.exec(url.trim());
  if (!match) return null;
  return { origin: match[1], projectPath: match[2], iid: Number(match[3]) };
}

export type MergeRequestDiff = {
  diff: string;
  title: string;
  label: string;
  /** SHA ล่าสุดของ source branch — ใช้ดึงเนื้อไฟล์เต็มสำหรับ Quick Scan (ESLint ต้องการไฟล์ครบ ไม่ใช่ diff) */
  headSha: string;
};

type GitLabChange = {
  old_path: string;
  new_path: string;
  new_file?: boolean;
  deleted_file?: boolean;
  renamed_file?: boolean;
  diff: string;
};

function gitlabHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "User-Agent": "node-code-reviewer" };
  if (process.env.GITLAB_TOKEN) headers["PRIVATE-TOKEN"] = process.env.GITLAB_TOKEN;
  return headers;
}

/**
 * GitLab API คืน diff ต่อไฟล์แบบไม่มี header ("diff --git", "---", "+++") มาให้ — ต้องประกอบเองเพื่อให้
 * parseUnifiedDiff() ใน node-diff-filter.ts (ซึ่งคาดหวัง format แบบ git unified diff) อ่านได้ถูกต้อง
 */
function toUnifiedDiff(changes: GitLabChange[]): string {
  return changes
    .map((c) => {
      const aPath = c.new_file ? "/dev/null" : `a/${c.old_path}`;
      const bPath = c.deleted_file ? "/dev/null" : `b/${c.new_path}`;
      const header = [`diff --git a/${c.old_path} b/${c.new_path}`, `--- ${aPath}`, `+++ ${bPath}`].join("\n");
      return `${header}\n${c.diff}`;
    })
    .join("\n");
}

export async function fetchMergeRequestDiff(ref: MergeRequestRef): Promise<MergeRequestDiff> {
  const headers = gitlabHeaders();

  // /changes คืน metadata (title, diff_refs) + diff ของทุกไฟล์ในคำขอเดียว — เป็น endpoint ที่ GitLab ทำ
  // เครื่องหมาย deprecated (แนะนำ /diffs แบบ paginated แทน) แต่ยังทำงานปกติและง่ายกว่าสำหรับ diff ขนาดทั่วไป
  const url = `${ref.origin}/api/v4/projects/${encodeURIComponent(ref.projectPath)}/merge_requests/${ref.iid}/changes`;

  const res = await fetch(url, { headers });

  if (!res.ok) {
    if (res.status === 404) {
      throw new Error("ไม่พบ Merge Request นี้ (หรือเป็น private project — ต้องตั้ง GITLAB_TOKEN)");
    }
    if (res.status === 401 || res.status === 403) {
      throw new Error("GitLab ปฏิเสธการเข้าถึง — ตั้ง GITLAB_TOKEN ใน .env.local (ต้องมีสิทธิ์อย่างน้อย read_api)");
    }
    throw new Error(`GitLab API error ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as {
    title?: string;
    changes?: GitLabChange[];
    diff_refs?: { head_sha?: string };
  };
  const changes = data.changes ?? [];
  const diff = toUnifiedDiff(changes);
  const title = data.title ?? `MR !${ref.iid}`;
  const headSha = data.diff_refs?.head_sha ?? "";

  return { diff, title, label: `${ref.projectPath}!${ref.iid} — ${title}`, headSha };
}

/** ดึงเนื้อไฟล์เต็ม ณ commit ที่กำหนด — ใช้โดย Quick Scan เท่านั้น (AI review ใช้แค่ diff) */
export async function fetchFileContent(ref: MergeRequestRef, path: string, sha: string): Promise<string | null> {
  const url = `${ref.origin}/api/v4/projects/${encodeURIComponent(ref.projectPath)}/repository/files/${encodeURIComponent(path)}/raw?ref=${encodeURIComponent(sha)}`;
  const res = await fetch(url, { headers: gitlabHeaders() });
  if (!res.ok) return null;
  return await res.text();
}
