import type { FileNode, HistoryRow, QualityFlag } from "./types";
import { epochToUtc } from "./time";

const HISTORY_FILES: Record<string, string> = {
  ".ash_history": "ash",
  ".bash_history": "bash",
  ".sh_history": "sh",
  ".zsh_history": "zsh",
  ".zhistory": "zsh",
  ".csh_history": "csh",
  ".tcsh_history": "tcsh",
  ".ksh_history": "ksh",
  ".history": "sh",
};

function shellFor(name: string): string | null {
  return HISTORY_FILES[name.toLowerCase()] ?? null;
}

function userFromPath(path: string): string {
  const parts = path.replace(/\\/g, "/").split("/").filter(Boolean);
  const idx = parts.findIndex((p) => p.startsWith("."));
  if (idx > 0) return parts[idx - 1];
  if (parts.includes("root")) return "root";
  return "unknown";
}

export function parseShellHistory(
  files: FileNode[],
  tree: Record<string, string>,
  host: string,
  kind: string,
): { rows: HistoryRow[]; flags: QualityFlag[] } {
  const flags: QualityFlag[] = [];
  const rows: HistoryRow[] = [];

  const histFiles = files.filter((f) => {
    const b = f.path.split("/").pop() ?? "";
    return shellFor(b) !== null;
  });

  const hasAsh = histFiles.some((f) => f.path.toLowerCase().endsWith(".ash_history"));
  const hasBash = histFiles.some((f) => f.path.toLowerCase().endsWith(".bash_history"));

  if (kind === "uac_synology" && !hasAsh && !hasBash) {
    flags.push({
      code: "root_history_missing",
      severity: "gap",
      message:
        "Synology profile with no /root/.ash_history or .bash_history — hidden file / profile gap.",
    });
  } else if (kind === "uac_synology" && hasAsh && !hasBash) {
    flags.push({
      code: "ash_expected",
      severity: "info",
      message: "DSM root shell is ash; .bash_history absent is expected.",
    });
  }

  for (const f of histFiles) {
    const raw = tree[f.path] ?? "";
    const name = f.path.split("/").pop() ?? "";
    const shell = shellFor(name) ?? "sh";
    const user = userFromPath(f.path);
    if (!raw.trim()) {
      flags.push({
        code: "history_empty",
        severity: "warn",
        message: `${f.path} exists but is empty — history never persisted, or UAC raced a live write.`,
      });
      continue;
    }
    const lines = raw.split(/\r?\n/);
    let pendingTs = "";
    let n = 0;
    for (const line of lines) {
      if (shell === "bash" && /^#\d{9,}$/.test(line.trim())) {
        pendingTs = epochToUtc(Number(line.trim().slice(1)));
        continue;
      }
      n += 1;
      rows.push({
        host,
        user,
        shell,
        sourcePath: f.path,
        lineNo: n,
        command: line,
        tsUtc: pendingTs,
      });
      pendingTs = "";
    }
  }

  return { rows, flags };
}
