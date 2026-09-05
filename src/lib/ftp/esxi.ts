import type { EsxiHit, FileNode, QualityFlag } from "./types";
import { parseEsxiTs } from "./time";

type Rule = {
  id: string;
  severity: EsxiHit["severity"];
  re: RegExp;
};

const RULES: Rule[] = [
  { id: "shell_enabled", severity: "high", re: /ESXi Shell (is )?enabled|shell\.enabled.*true/i },
  { id: "ssh_enabled", severity: "high", re: /SSH.*(enabled|started)|TSM-SSH/i },
  { id: "ssh_login", severity: "high", re: /Accepted (password|publickey) for|SSH login|session opened for/i },
  { id: "password_change", severity: "medium", re: /password (changed|reset)|chage|passwd/i },
  { id: "firewall_disable", severity: "critical", re: /firewall.*(set|disable)|allowedAll|esxcli network firewall set/i },
  { id: "exec_fetch", severity: "critical", re: /\b(wget|curl)\b/i },
  { id: "chmod_exec", severity: "high", re: /\bchmod\s+[+0-7]*x|\bchmod\s+777/i },
  { id: "python_exec", severity: "high", re: /\bpython(\d+(\.\d+)?)?\b/i },
  { id: "vim_cmd", severity: "medium", re: /\bvim-cmd\b/i },
  { id: "esxcli", severity: "medium", re: /\besxcli\b/i },
  { id: "vib_install", severity: "critical", re: /\bvib\s+install|esxcli software vib/i },
  { id: "datastore_browser", severity: "medium", re: /datastorebrowser|ha-nfc|\/vmfs\/volumes\//i },
  { id: "unsigned_exec", severity: "high", re: /execInstalledOnly|not part of a VIB|untrusted/i },
];

const PRIORITY_LOGS = [
  "shell.log",
  "auth.log",
  "hostd.log",
  "syslog.log",
  "vobd.log",
  "rhttpproxy.log",
  "vmkernel.log",
  "vpxa.log",
];

function isPriorityLog(path: string): string | null {
  const b = path.split("/").pop()?.toLowerCase() ?? "";
  const base = b.replace(/\.\d+$/, "");
  const hit = PRIORITY_LOGS.find((n) => base === n || b.startsWith(n.replace(".log", "")));
  return hit ?? (b.endsWith(".log") && path.toLowerCase().includes("/var/") ? b : null);
}

export function parseEsxiLogs(
  files: FileNode[],
  tree: Record<string, string>,
): { hits: EsxiHit[]; flags: QualityFlag[]; mergedLines: number } {
  const flags: QualityFlag[] = [];
  const hits: EsxiHit[] = [];
  let mergedLines = 0;

  const logFiles = files.filter((f) => isPriorityLog(f.path));
  if (!files.some((f) => f.path.toLowerCase().endsWith("shell.log"))) {
    flags.push({
      code: "shell_log_missing",
      severity: "warn",
      message: "shell.log not in collection — ESXi Shell commands will not be visible.",
    });
  }

  for (const f of logFiles) {
    const raw = tree[f.path];
    if (!raw) continue;
    const logName = f.path.split("/").pop() ?? f.path;
    const lines = raw.split(/\r?\n/);
    mergedLines += lines.filter((l) => l.length).length;
    lines.forEach((line, idx) => {
      if (!line.trim()) return;
      for (const rule of RULES) {
        if (rule.re.test(line)) {
          hits.push({
            log: logName,
            lineNo: idx + 1,
            tsHint: parseEsxiTs(line),
            rule: rule.id,
            severity: rule.severity,
            excerpt: line.trim().slice(0, 280),
          });
          break;
        }
      }
    });
  }

  const sev = { critical: 0, high: 1, medium: 2 };
  hits.sort((a, b) => sev[a.severity] - sev[b.severity] || a.lineNo - b.lineNo);
  return { hits, flags, mergedLines };
}
