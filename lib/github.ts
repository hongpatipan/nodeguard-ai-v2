/** ดึง unified diff และเนื้อไฟล์เต็มของ PR ผ่าน GitHub REST API */

export type PullRequestRef = { owner: string; repo: string; number: number };

export function parsePullRequestUrl(url: string): PullRequestRef | null {
  const match = /github\.com\/([^/\s]+)\/([^/\s]+)\/pull\/(\d+)/.exec(url.trim());
  if (!match) return null;
  return { owner: match[1], repo: match[2].replace(/\.git$/, ""), number: Number(match[3]) };
}

export type PullRequestDiff = {
  diff: string;
  title: string;
  label: string;
  /** SHA ล่าสุดของ branch ต้นทาง — ใช้ดึงเนื้อไฟล์เต็มสำหรับ Quick Scan (ESLint ต้องการไฟล์ครบ ไม่ใช่ diff) */
  headSha: string;
};

function githubHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "node-code-reviewer",
  };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return headers;
}

export async function fetchPullRequestDiff(ref: PullRequestRef): Promise<PullRequestDiff> {
  const base = `https://api.github.com/repos/${ref.owner}/${ref.repo}/pulls/${ref.number}`;
  const headers = githubHeaders();

  const [diffRes, metaRes] = await Promise.all([
    fetch(base, { headers: { ...headers, Accept: "application/vnd.github.v3.diff" } }),
    fetch(base, { headers: { ...headers, Accept: "application/vnd.github+json" } }),
  ]);

  if (!diffRes.ok) {
    if (diffRes.status === 404) {
      throw new Error("ไม่พบ PR นี้ (หรือเป็น private repo — ต้องตั้ง GITHUB_TOKEN)");
    }
    if (diffRes.status === 403) {
      throw new Error("GitHub rate limit หรือสิทธิ์ไม่พอ — ตั้ง GITHUB_TOKEN ใน .env.local");
    }
    throw new Error(`GitHub API error ${diffRes.status}: ${await diffRes.text()}`);
  }

  const diff = await diffRes.text();
  const meta = metaRes.ok ? ((await metaRes.json()) as { title?: string; head?: { sha?: string } }) : {};
  const title = meta.title ?? `PR #${ref.number}`;
  const headSha = meta.head?.sha ?? "";

  return { diff, title, label: `${ref.owner}/${ref.repo}#${ref.number} — ${title}`, headSha };
}

/** ดึงเนื้อไฟล์เต็ม ณ commit ที่กำหนด — ใช้โดย Quick Scan เท่านั้น (AI review ใช้แค่ diff) */
export async function fetchFileContent(ref: PullRequestRef, path: string, sha: string): Promise<string | null> {
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  const url = `https://api.github.com/repos/${ref.owner}/${ref.repo}/contents/${encodedPath}?ref=${encodeURIComponent(sha)}`;
  const res = await fetch(url, { headers: { ...githubHeaders(), Accept: "application/vnd.github+json" } });
  if (!res.ok) return null;

  const json = (await res.json()) as { content?: string; encoding?: string };
  if (!json.content || json.encoding !== "base64") return null;
  return Buffer.from(json.content, "base64").toString("utf-8");
}
