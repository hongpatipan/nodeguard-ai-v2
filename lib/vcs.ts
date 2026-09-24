/** รวมจุดเข้าเดียวสำหรับดึง diff/ไฟล์เต็มจาก URL — รองรับทั้ง GitHub PR และ GitLab MR */
import { fetchFileContent as fetchGithubFileContent, fetchPullRequestDiff, parsePullRequestUrl } from "./github";
import { fetchFileContent as fetchGitlabFileContent, fetchMergeRequestDiff, parseMergeRequestUrl } from "./gitlab";
import { getSkipReason, parseUnifiedDiff, type DiffFile } from "./node-diff-filter";

export type VcsSource = { kind: "github" | "gitlab"; label: string };

export type VcsDiffResult = { diff: string; source: VcsSource };

const URL_HELP =
  "URL ไม่ถูกต้อง — รองรับ GitHub PR (https://github.com/{owner}/{repo}/pull/{number}) " +
  "หรือ GitLab MR (https://gitlab.com/{namespace}/{project}/-/merge_requests/{number})";

/** คืน error message ตรง ๆ แทนการ throw เพราะ "URL รูปแบบผิด" เป็น 400 ที่คาดเดาได้ ไม่ใช่ exceptional case */
export async function fetchDiffFromUrl(url: string): Promise<VcsDiffResult | { error: string }> {
  const ghRef = parsePullRequestUrl(url);
  if (ghRef) {
    const pr = await fetchPullRequestDiff(ghRef);
    return { diff: pr.diff, source: { kind: "github", label: pr.label } };
  }

  const glRef = parseMergeRequestUrl(url);
  if (glRef) {
    const mr = await fetchMergeRequestDiff(glRef);
    return { diff: mr.diff, source: { kind: "gitlab", label: mr.label } };
  }

  return { error: URL_HELP };
}

export type VcsFileContent = { path: string; content: string };

export type VcsFilesResult = {
  files: VcsFileContent[];
  skippedFiles: { path: string; reason: string }[];
  totalFiles: number;
  source: VcsSource;
};

/** จำนวนไฟล์สูงสุดที่ Quick Scan จะดึงเนื้อหามาสแกนต่อครั้ง — กัน PR/MR ใหญ่มากยิงคำขอเยอะเกินไป */
const MAX_QUICK_SCAN_FILES = 15;

async function collectFiles(
  parsedFiles: DiffFile[],
  headSha: string,
  fetchContent: (path: string, sha: string) => Promise<string | null>,
  source: VcsSource,
): Promise<VcsFilesResult> {
  const skippedFiles: { path: string; reason: string }[] = [];
  const candidates: string[] = [];

  for (const f of parsedFiles) {
    if (f.status === "deleted") {
      skippedFiles.push({ path: f.path, reason: "ไฟล์ถูกลบ ไม่มีเนื้อหาให้สแกน" });
      continue;
    }
    const reason = getSkipReason(f.path);
    if (reason) {
      skippedFiles.push({ path: f.path, reason });
      continue;
    }
    candidates.push(f.path);
  }

  const toFetch = candidates.slice(0, MAX_QUICK_SCAN_FILES);
  for (const path of candidates.slice(MAX_QUICK_SCAN_FILES)) {
    skippedFiles.push({ path, reason: `เกินเพดาน Quick Scan (สูงสุด ${MAX_QUICK_SCAN_FILES} ไฟล์ต่อครั้ง)` });
  }

  const fetched = await Promise.all(
    toFetch.map(async (path) => ({ path, content: headSha ? await fetchContent(path, headSha) : null })),
  );

  const files: VcsFileContent[] = [];
  for (const { path, content } of fetched) {
    if (content !== null) files.push({ path, content });
    else skippedFiles.push({ path, reason: "ดึงเนื้อหาไฟล์ไม่สำเร็จ" });
  }

  return { files, skippedFiles, totalFiles: parsedFiles.length, source };
}

/**
 * ดึงเนื้อไฟล์เต็ม (ไม่ใช่ diff) ของทุกไฟล์ที่เปลี่ยนใน PR/MR — ใช้โดย Quick Scan เท่านั้น เพราะ ESLint
 * ต้อง parse syntax ให้ครบทั้งไฟล์ ป้อนแค่ diff hunk (บรรทัด +/- พร้อม context สั้นๆ) จะ parse ไม่ผ่าน
 */
export async function fetchChangedFileContents(url: string): Promise<VcsFilesResult | { error: string }> {
  const ghRef = parsePullRequestUrl(url);
  if (ghRef) {
    const pr = await fetchPullRequestDiff(ghRef);
    const parsed = parseUnifiedDiff(pr.diff);
    return collectFiles(parsed, pr.headSha, (path, sha) => fetchGithubFileContent(ghRef, path, sha), {
      kind: "github",
      label: pr.label,
    });
  }

  const glRef = parseMergeRequestUrl(url);
  if (glRef) {
    const mr = await fetchMergeRequestDiff(glRef);
    const parsed = parseUnifiedDiff(mr.diff);
    return collectFiles(parsed, mr.headSha, (path, sha) => fetchGitlabFileContent(glRef, path, sha), {
      kind: "gitlab",
      label: mr.label,
    });
  }

  return { error: URL_HELP };
}
