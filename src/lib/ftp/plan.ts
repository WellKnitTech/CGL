import type { CollectionKind, StageId, StageStatus } from "./types";

const WINDOWS: StageId[] = ["json_csv", "recmd", "hayabusa"];
const UAC: StageId[] = ["synology_sqlite", "esxi_logs", "linux_common", "linux_logs"];
const CORE: StageId[] = ["extract", "classify", "digest"];
export const ALL_STAGES: StageId[] = [...CORE, ...WINDOWS, ...UAC];

export function idleStages(): Record<StageId, StageStatus> {
  return Object.fromEntries(ALL_STAGES.map((s) => [s, "idle"])) as Record<StageId, StageStatus>;
}

export function planStages(kind: CollectionKind): Record<StageId, "run" | "skip"> {
  const plan = Object.fromEntries(ALL_STAGES.map((s) => [s, "skip"])) as Record<StageId, "run" | "skip">;
  for (const s of CORE) plan[s] = "run";
  if (kind === "velo_windows") {
    for (const s of WINDOWS) plan[s] = "run";
  } else if (kind === "uac_synology") {
    plan.synology_sqlite = "run";
    plan.linux_common = "run";
    plan.linux_logs = "run";
  } else if (kind === "uac_esxi") {
    plan.esxi_logs = "run";
    plan.linux_common = "run";
  } else {
    plan.linux_common = "run";
    plan.linux_logs = "run";
  }
  return plan;
}
