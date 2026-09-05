import { catalogArtifacts } from "./artifacts";
import { classifyCollection } from "./classify";
import { buildDigest } from "./digest";
import { buildHostAsset } from "./inventory";
import { parseEsxi, parseHistory, parseLinuxLogs } from "./linux-logs";
import { idleStages, planStages } from "./plan";
import { parseSynology } from "./synology";
import type { DemoCase, FileNode, HayabusaHit, PipelineResult, StageId, StageStatus } from "./types";

export { idleStages };

function treeFiles(tree: Record<string, string>): FileNode[] {
  return Object.entries(tree).map(([path, body]) => ({
    path,
    bytes: body.length,
    hidden: path.split("/").pop()?.startsWith(".") ?? false,
    kind: "file" as const,
  }));
}

const DEMO_HAYA: HayabusaHit[] = [
  { rule: "Suspicious Scheduled Task Created", level: "high", count: 2, technique: "T1053.005" },
  { rule: "PowerShell Encoded Command", level: "med", count: 4, technique: "T1059.001" },
  { rule: "Logon from New Country", level: "info", count: 1, technique: "T1078" },
];

export function peekKind(cas: DemoCase) {
  return classifyCollection(treeFiles(cas.tree), cas.archiveName, cas.tree).kind;
}

export function runPipeline(cas: DemoCase): PipelineResult {
  const files = treeFiles(cas.tree);
  const { kind, flags } = classifyCollection(files, cas.archiveName, cas.tree);
  const plan = planStages(kind);
  const stages: Record<StageId, StageStatus> = idleStages();
  stages.extract = "success";
  stages.classify = "success";

  const syn = plan.synology_sqlite === "run" ? parseSynology(cas.tree, flags) : { conn: [], sys: [], flags };
  if (plan.synology_sqlite === "run") stages.synology_sqlite = "success";
  else stages.synology_sqlite = "skipped";

  const history = plan.linux_common === "run" ? parseHistory(cas.tree, "") : [];
  stages.linux_common = plan.linux_common === "run" ? "success" : "skipped";

  const linux = plan.linux_logs === "run" ? parseLinuxLogs(cas.tree) : [];
  stages.linux_logs = plan.linux_logs === "run" ? "success" : "skipped";

  const esxi = plan.esxi_logs === "run" ? parseEsxi(cas.tree) : [];
  stages.esxi_logs = plan.esxi_logs === "run" ? "success" : "skipped";

  const jsonCsvFiles =
    plan.json_csv === "run"
      ? files.filter((f) => f.path.toLowerCase().endsWith(".json") && f.path.toLowerCase().includes("result")).length || 1
      : 0;
  stages.json_csv = plan.json_csv === "run" ? "success" : "skipped";
  const recmdNote = plan.recmd === "run" ? "Kroll_Batch auto-selected (unattended)." : "";
  stages.recmd = plan.recmd === "run" ? "success" : "skipped";
  const hayabusa = plan.hayabusa === "run" ? DEMO_HAYA : [];
  stages.hayabusa = plan.hayabusa === "run" ? "success" : "skipped";
  stages.digest = "success";

  const extra = [
    ...syn.conn.map((c) => ({ user: c.user, username: c.username, sources: ["synoconndb"] })),
    ...syn.sys.map((s) => ({ user: s.username, sources: ["synosysdb"] })),
    ...linux.map((h) => ({ user: h.user, sources: [h.family] })),
    ...history.map((h) => ({ user: h.user, sources: ["history"] })),
  ];
  const asset = buildHostAsset(cas.tree, cas.archiveName, kind, extra);
  const host = asset.hostname;
  const hist = history.map((h) => ({ ...h, host }));

  const decision =
    kind === "velo_windows"
      ? "Windows mill: JSON→CSV, RECmd, Hayabusa. UAC stages skipped."
      : kind === "uac_synology"
        ? "Synology UAC: .SYNOCONNDB/.SYNOSYSDB → CSV, ash/bash history, Linux IR logs. Hayabusa skipped."
        : kind === "uac_esxi"
          ? "ESXi UAC: hostd/shell/vmkernel signals. Hayabusa/RECmd skipped."
          : "Unix UAC: auth/syslog/audit/history. Hayabusa skipped.";

  const base = {
    kind,
    host,
    files,
    flags: syn.flags,
    conn: syn.conn,
    sys: syn.sys,
    history: hist,
    esxi,
    linux,
    hayabusa,
    jsonCsvFiles,
    recmdNote,
    decision,
    asset,
  };
  const digest = buildDigest(base);
  const result: PipelineResult = { ...base, digest, artifacts: [], stages };
  result.artifacts = catalogArtifacts(result);
  return result;
}
