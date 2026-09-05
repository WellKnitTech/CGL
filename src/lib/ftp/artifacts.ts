import type { ParsedArtifact, PipelineResult, StageId } from "./types";

function outFile(family: string, label: string): string {
  if (family === "synology" && label.toLowerCase().includes("conn")) return "SYNOCONNDB.csv";
  if (family === "synology") return "SYNOSYSDB.csv";
  if (family === "history") return "shell_history.csv";
  if (family === "linux") return "linux_ir_signals.csv";
  if (family === "esxi") return "esxi_signals.csv";
  if (family === "windows") return "hayabusa.csv";
  if (family === "accounts") return "artifacts.csv";
  return "digest.json";
}

export function catalogArtifacts(r: PipelineResult): ParsedArtifact[] {
  const out: ParsedArtifact[] = [];
  const host = r.host;
  const add = (path: string, label: string, family: string, stage: StageId, rows: number, present: boolean) => {
    out.push({
      id: `${host}::${path}`,
      host,
      path,
      outFile: outFile(family, label),
      label,
      family,
      stage,
      rows,
      present,
    });
  };
  for (const f of r.files) {
    const b = f.path.replace(/\\/g, "/").split("/").pop()?.toLowerCase() ?? "";
    if (b === "uac.log" || b === "collection.json" || b === "hostname") add(f.path, b, "identity", "classify", 1, true);
    if (b === "passwd" || b === "passwd-") add(f.path, b, "accounts", "linux_common", 1, true);
    if (b.includes("synoconndb")) add(f.path, ".SYNOCONNDB", "synology", "synology_sqlite", r.conn.length, true);
    if (b.includes("synosysdb")) add(f.path, ".SYNOSYSDB", "synology", "synology_sqlite", r.sys.length, true);
    if (b.endsWith("_history") || b === ".history") add(f.path, b, "history", "linux_common", r.history.length, true);
    if (/(auth\.log|secure|syslog|messages|audit|nginx|cron|system\.log|install\.log|synoscgi)/.test(b)) {
      add(f.path, b, "linux", "linux_logs", r.linux.filter((h) => h.log === f.path).length, true);
    }
    if (/(shell|hostd|vmkernel|vobd)\.log$/.test(b)) add(f.path, b, "esxi", "esxi_logs", r.esxi.filter((h) => h.log === f.path).length, true);
  }
  if (r.hayabusa.length) add("hayabusa.csv", "Hayabusa", "windows", "hayabusa", r.hayabusa.length, true);
  return out;
}
