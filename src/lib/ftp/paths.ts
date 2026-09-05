export type MillPaths = {
  sourceRoot: string;
  unzipRoot: string;
  outputRoot: string;
  dbPath: string;
  analyst: string;
  sevenzipExe?: string;
  recmdExe?: string;
  hayabusaDir?: string;
  hayabusaOut?: string;
  krollBatch?: string;
};

const KEY = "ftp50.paths";

export const DEFAULT_PATHS: MillPaths = {
  sourceRoot: "E:\\data_ingest",
  unzipRoot: "E:\\Results\\Extracted",
  outputRoot: "E:\\Results\\CSVOutput",
  dbPath: "E:\\Results\\ftp50.case.db",
  analyst: "",
  sevenzipExe: "",
  recmdExe: "",
  hayabusaDir: "",
  hayabusaOut: "",
  krollBatch: "",
};

export function loadPaths(): MillPaths {
  if (typeof window === "undefined") return DEFAULT_PATHS;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_PATHS;
    return { ...DEFAULT_PATHS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_PATHS;
  }
}

export function savePaths(p: MillPaths) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(p));
}

export function trimPaths(p: MillPaths): MillPaths {
  return {
    sourceRoot: p.sourceRoot.trim(),
    unzipRoot: p.unzipRoot.trim(),
    outputRoot: p.outputRoot.trim(),
    dbPath: p.dbPath.trim(),
    analyst: p.analyst.trim().replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase(),
    sevenzipExe: (p.sevenzipExe ?? "").trim(),
    recmdExe: (p.recmdExe ?? "").trim(),
    hayabusaDir: (p.hayabusaDir ?? "").trim(),
    hayabusaOut: (p.hayabusaOut ?? "").trim(),
    krollBatch: (p.krollBatch ?? "").trim(),
  };
}

export function pathWarnings(p: MillPaths): string[] {
  const t = trimPaths(p);
  const w: string[] = [];
  if (!t.sourceRoot) w.push("Collections path is empty.");
  if (!t.unzipRoot) w.push("Extract path is empty.");
  if (!t.outputRoot) w.push("Results path is empty.");
  if (!t.dbPath) w.push("Case database path is empty.");
  const norm = (s: string) => s.replace(/[/\\]+$/, "").toLowerCase();
  if (t.sourceRoot && t.unzipRoot && norm(t.sourceRoot) === norm(t.unzipRoot)) {
    w.push("Collections and extract are the same folder — extracts will mix with incoming archives.");
  }
  if (t.unzipRoot && t.outputRoot && norm(t.unzipRoot) === norm(t.outputRoot)) {
    w.push("Extract and results are the same folder — CSVs will land inside the tree.");
  }
  return w;
}

export function pathsConfig(p: MillPaths) {
  const t = trimPaths(p);
  const cfg: Record<string, string> = {
    source_root: t.sourceRoot,
    unzip_root: t.unzipRoot,
    output_root: t.outputRoot,
    case_db: t.dbPath,
    analyst: t.analyst,
  };
  if (t.sevenzipExe) cfg.sevenzip_exe = t.sevenzipExe;
  if (t.recmdExe) cfg.recmd_exe = t.recmdExe;
  if (t.hayabusaDir) cfg.hayabusa_dir = t.hayabusaDir;
  if (t.hayabusaOut) cfg.hayabusa_out = t.hayabusaOut;
  if (t.krollBatch) cfg.kroll_batch_reb = t.krollBatch;
  return cfg;
}

function q(s: string) {
  return /\s/.test(s) ? `"${s}"` : s;
}

function toolFlags(p: MillPaths): string {
  const t = trimPaths(p);
  const parts: string[] = [];
  if (t.sevenzipExe) parts.push(`--7zip ${q(t.sevenzipExe)}`);
  if (t.recmdExe) parts.push(`--recmd-exe ${q(t.recmdExe)}`);
  if (t.hayabusaDir) parts.push(`--hayabusa-dir ${q(t.hayabusaDir)}`);
  if (t.hayabusaOut) parts.push(`--hayabusa-out ${q(t.hayabusaOut)}`);
  if (t.krollBatch) parts.push(`--kroll ${q(t.krollBatch)}`);
  return parts.length ? ` ${parts.join(" ")}` : "";
}

/** Windows lab VMs: py launcher, then python.exe. */
export function millCommand(p: MillPaths): string {
  const t = trimPaths(p);
  const by = t.analyst ? ` --analyst ${q(t.analyst)}` : "";
  return `py -3 ftp_5_0.py --source ${q(t.sourceRoot)} --unzip ${q(t.unzipRoot)} --out ${q(t.outputRoot)} --db ${q(t.dbPath)}${by}${toolFlags(t)} --non-interactive`;
}

export function millTaskCommand(p: MillPaths): string {
  const inner = millCommand(p).replace(/"/g, '\\"');
  return `schtasks /Create /TN "CGL Mill" /SC MINUTE /MO 30 /TR "cmd /c ${inner}" /F`;
}

export function caseStorageKey(dbPath: string) {
  return `ftp50.case::${dbPath.trim().toLowerCase() || "default"}`;
}

export function joinWin(...parts: string[]): string {
  return parts
    .map((p) => p.replace(/[/\\]+/g, "\\").replace(/^\\+|\\+$/g, ""))
    .filter(Boolean)
    .join("\\");
}

export function archiveStem(name: string): string {
  return name.replace(/\.(tar\.gz|tgz|zip|tar)$/i, "");
}

export function folderOf(filePath: string): string {
  const n = filePath.replace(/\//g, "\\");
  const i = n.lastIndexOf("\\");
  return i > 0 ? n.slice(0, i) : n;
}

export function artifactDiskPath(unzipRoot: string, archiveName: string, rel: string): string {
  return joinWin(unzipRoot, archiveStem(archiveName), rel.replace(/[/\\]+/g, "\\"));
}

/** Parsed mill output lives under CSVOutput\\<host>\\<file>, not in the raw extract tree. */
export function parsedDiskPath(outputRoot: string, host: string, outFile: string): string {
  return joinWin(outputRoot, host, outFile);
}

export function cglOpenHref(filePath: string): string {
  return "cgl:" + encodeURIComponent(filePath);
}

export function explorerSelect(filePath: string): string {
  return `explorer /select,${q(filePath)}`;
}
