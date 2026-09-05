import type { CollectionKind, FileNode } from "./types";

const SYN = new Set([".synoconndb", "synoconndb", ".synosysdb", "synosysdb", ".synosyslogdb", "synosyslogdb"]);
const ESX = ["vmkernel.log", "hostd.log", "shell.log"];

export function classifyCollection(
  files: FileNode[],
  archiveName: string,
  tree: Record<string, string>,
): { kind: CollectionKind; flags: { code: string; severity: "info" | "warn" | "gap"; message: string }[] } {
  const paths = files.map((f) => f.path.replace(/\\/g, "/").toLowerCase());
  const name = archiveName.toLowerCase();
  const flags: { code: string; severity: "info" | "warn" | "gap"; message: string }[] = [];

  const uacEntry = Object.entries(tree).find(([p]) => p.replace(/\\/g, "/").toLowerCase().endsWith("uac.log"));
  let osLine = "";
  if (uacEntry) {
    const m = uacEntry[1].match(/^os:\s*(\S+)/im);
    if (m) osLine = m[1].toLowerCase();
  }
  const uname = Object.entries(tree).find(([p]) => p.toLowerCase().includes("uname"));
  const unameTxt = (uname?.[1] ?? "").toLowerCase();

  const hasUac = paths.some((p) => p.endsWith("uac.log")) || name.startsWith("uac-") || name.includes("uac-");
  const hasVelo =
    paths.some((p) => p.includes("/results/") && p.endsWith(".json")) ||
    paths.some((p) => p.endsWith("collection.json"));
  const hasSyn = paths.some((p) => p.includes("synolog")) || paths.some((p) => SYN.has(p.split("/").pop() ?? ""));
  const hasEsx =
    paths.some((p) => ESX.some((e) => p.endsWith(e))) || name.includes("-esxi-") || osLine === "esxi";
  const hasMac =
    ["darwin", "macos", "osx"].includes(osLine) ||
    unameTxt.startsWith("darwin") ||
    name.includes("-macos-") ||
    name.includes("-darwin-") ||
    paths.some((p) => p.includes("/private/var/log") || p.includes("/library/logs"));
  const hasUnix =
    ["freebsd", "openbsd", "netbsd", "solaris", "sunos", "aix", "netscaler"].includes(osLine) ||
    unameTxt.startsWith("freebsd") ||
    unameTxt.startsWith("openbsd") ||
    paths.some((p) => p.includes("/var/adm/"));

  let kind: CollectionKind = "unknown";
  if (hasUac || hasSyn || (hasEsx && !hasVelo)) {
    if (hasSyn) kind = "uac_synology";
    else if (hasEsx) kind = "uac_esxi";
    else if (hasMac) kind = "uac_macos";
    else if (hasUnix) kind = "uac_unix";
    else kind = "uac_linux";
  } else if (hasMac && !hasVelo) kind = "uac_macos";
  else if (hasUnix && !hasVelo) kind = "uac_unix";
  else if (hasVelo) kind = "velo_windows";

  if (kind === "uac_synology" && !paths.some((p) => p.includes(".ash_history") || p.includes(".bash_history"))) {
    flags.push({
      code: "no_ash",
      severity: "gap",
      message: "Synology profile with no /root/.ash_history or .bash_history.",
    });
  }
  if (kind === "uac_esxi" && !paths.some((p) => p.endsWith("shell.log"))) {
    flags.push({
      code: "no_shell",
      severity: "gap",
      message: "shell.log missing — ESXi Shell commands will not be visible.",
    });
  }
  return { kind, flags };
}
