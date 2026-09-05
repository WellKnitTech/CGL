import type { LinuxHit } from "./types";

type Rule = { rule: string; family: string; severity: LinuxHit["severity"]; re: RegExp };

const AUTH: Rule[] = [
  { rule: "ssh_accepted", family: "auth", severity: "medium", re: /Accepted (?:password|publickey) for (\S+) from (\S+)/i },
  { rule: "ssh_failed", family: "auth", severity: "high", re: /Failed password for(?: invalid user)? (\S+) from (\S+)/i },
  { rule: "sudo", family: "auth", severity: "medium", re: /sudo:\s+(\S+)\s*:/i },
  { rule: "su_root", family: "auth", severity: "high", re: /\bsu(?:do)?:.*root/i },
];
const SYS: Rule[] = [
  { rule: "cron_job", family: "cron", severity: "medium", re: /CRON\[\d+\]:\s+\((\S+)\)/ },
  { rule: "useradd", family: "sys", severity: "high", re: /(?:useradd|adduser).*?(\S+)/i },
  { rule: "sshd_start", family: "sys", severity: "medium", re: /sshd.*(?:listening|started)/i },
];
const AUDIT: Rule[] = [
  { rule: "execve", family: "audit", severity: "medium", re: /type=EXECVE.*a0="([^"]+)"/i },
  { rule: "user_auth", family: "audit", severity: "high", re: /type=USER_AUTH.*acct="([^"]+)"/i },
];
const WEB: Rule[] = [
  { rule: "webshell", family: "web", severity: "critical", re: /\.(?:php|jsp|aspx)\b.*(?:cmd=|exec=|eval)/i },
  { rule: "nginx_4xx", family: "web", severity: "medium", re: /\]\s+"[A-Z]+ [^"]+" (?:401|403|404)/ },
];
const MAC: Rule[] = [
  { rule: "sudo_mac", family: "auth", severity: "medium", re: /sudo\[\d+\]:\s+(\S+)/i },
  { rule: "install", family: "pkg", severity: "medium", re: /Installer\[|install\.log|Successfully installed/i },
];

function pullUser(line: string, family: string): string {
  if (family === "auth") {
    const m = line.match(/for(?: invalid user)? (\S+) from |sudo:\s+(\S+)\s*:|acct="([^"]+)"|user=(\S+)/i);
    return (m?.[1] || m?.[2] || m?.[3] || m?.[4] || "").replace(/,$/, "");
  }
  const m = line.match(/\((\S+)\)|user=(\S+)/);
  return m?.[1] || m?.[2] || "";
}
function pullIp(line: string): string {
  const m = line.match(/\bfrom (\d{1,3}(?:\.\d{1,3}){3})\b/) || line.match(/\b(\d{1,3}(?:\.\d{1,3}){3})\b/);
  return m?.[1] ?? "";
}
function tsHint(line: string): string {
  const m = line.match(/^(\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})/) || line.match(/(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2})/);
  return m?.[1] ?? "";
}

function familyOf(path: string): string {
  const p = path.replace(/\\/g, "/").toLowerCase();
  if (p.includes("auth") || p.includes("secure")) return "auth";
  if (p.includes("audit")) return "audit";
  if (p.includes("nginx") || p.includes("access.log") || p.includes("httpd")) return "web";
  if (p.includes("cron")) return "cron";
  if (p.includes("system.log") || p.includes("install.log")) return "mac";
  if (p.includes("synoscgi") || p.includes("messages") || p.includes("syslog")) return "sys";
  return "sys";
}

export function linuxFamily(path: string): boolean {
  const p = path.replace(/\\/g, "/").toLowerCase();
  return /(auth\.log|secure|syslog|messages|audit\.log|nginx|access\.log|cron|dpkg|last\.log|wtmp|system\.log|install\.log|synoscgi)/.test(p);
}

export function parseLinuxLogs(tree: Record<string, string>): LinuxHit[] {
  const hits: LinuxHit[] = [];
  for (const [path, body] of Object.entries(tree)) {
    if (!linuxFamily(path)) continue;
    const fam = familyOf(path);
    const rules = fam === "auth" ? AUTH : fam === "audit" ? AUDIT : fam === "web" ? WEB : fam === "mac" ? MAC : SYS;
    const lines = body.split(/\r?\n/);
    lines.forEach((line, i) => {
      if (!line.trim()) return;
      for (const r of rules) {
        if (!r.re.test(line)) continue;
        hits.push({
          log: path,
          family: r.family,
          lineNo: i + 1,
          tsHint: tsHint(line),
          rule: r.rule,
          severity: r.severity,
          user: pullUser(line, r.family),
          ip: pullIp(line),
          excerpt: line.slice(0, 180),
        });
        break;
      }
    });
  }
  return hits;
}

const HIST = new Set([
  ".ash_history",
  ".bash_history",
  ".sh_history",
  ".zsh_history",
  ".zhistory",
  ".csh_history",
  ".tcsh_history",
  ".ksh_history",
  ".history",
]);

export function parseHistory(tree: Record<string, string>, host: string) {
  const rows: {
    host: string;
    user: string;
    shell: string;
    sourcePath: string;
    lineNo: number;
    command: string;
    tsUtc: string;
  }[] = [];
  for (const [path, body] of Object.entries(tree)) {
    const base = path.replace(/\\/g, "/").split("/").pop()?.toLowerCase() ?? "";
    if (!HIST.has(base)) continue;
    const shell = base.replace(/^\./, "").replace("_history", "").replace("history", "sh") || "sh";
    const user = /\/(?:home|Users)\/([^/]+)\//.exec(path.replace(/\\/g, "/"))?.[1] || (path.includes("/root/") ? "root" : "unknown");
    body.split(/\r?\n/).forEach((line, i) => {
      if (!line.trim() || line.startsWith("#")) return;
      rows.push({ host, user, shell, sourcePath: path, lineNo: i + 1, command: line, tsUtc: "" });
    });
  }
  return rows;
}

export function parseEsxi(tree: Record<string, string>) {
  const hits: { log: string; lineNo: number; tsHint: string; rule: string; severity: "critical" | "high" | "medium"; excerpt: string }[] = [];
  const rules: { rule: string; severity: "critical" | "high" | "medium"; re: RegExp }[] = [
    { rule: "shell_cmd", severity: "high", re: /shell\[\d+\]:.*(?:vim-cmd|esxcli|chmod)/i },
    { rule: "dcui_login", severity: "medium", re: /DCUI.*login|accepted.*dcui/i },
    { rule: "ssh_enable", severity: "high", re: /SSH.*(enabled|started)/i },
    { rule: "root_login", severity: "high", re: /Accepted.*?root/i },
  ];
  for (const [path, body] of Object.entries(tree)) {
    const b = path.replace(/\\/g, "/").toLowerCase();
    if (!/(shell|hostd|vobd|vmkernel|rhttpproxy|syslog|vpxa|auth)\.log$/.test(b)) continue;
    body.split(/\r?\n/).forEach((line, i) => {
      for (const r of rules) {
        if (!r.re.test(line)) continue;
        hits.push({
          log: path,
          lineNo: i + 1,
          tsHint: tsHint(line),
          rule: r.rule,
          severity: r.severity,
          excerpt: line.slice(0, 180),
        });
        break;
      }
    });
  }
  return hits;
}
