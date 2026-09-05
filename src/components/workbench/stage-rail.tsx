import { Badge } from "@/components/ui/badge";
import { ALL_STAGES } from "@/lib/ftp/plan";
import type { StageId, StageStatus } from "@/lib/ftp/types";
import { cn } from "@/lib/utils";

const LABEL: Record<StageId, string> = {
  extract: "Extract",
  classify: "Classify",
  json_csv: "JSON→CSV",
  recmd: "RECmd",
  hayabusa: "Hayabusa",
  synology_sqlite: "Synology DB",
  esxi_logs: "ESXi logs",
  linux_common: "History",
  linux_logs: "Linux IR",
  digest: "Digest",
};

export function StageRail({ stages }: { stages: Record<StageId, StageStatus> }) {
  return (
    <div className="flex flex-wrap gap-2">
      {ALL_STAGES.map((id) => {
        const s = stages[id] ?? "idle";
        return (
          <div
            key={id}
            className={cn(
              "flex min-h-11 items-center gap-2 rounded-md border px-3",
              s === "success"
                ? "border-ok/40 bg-surface"
                : s === "skipped"
                  ? "border-border text-subtle"
                  : s === "running"
                    ? "border-accent bg-surface-2"
                    : "border-border",
            )}
          >
            <StatusDot status={s} />
            <span className="text-sm">{LABEL[id]}</span>
            {s === "skipped" ? <Badge variant="default">skip</Badge> : null}
          </div>
        );
      })}
    </div>
  );
}

function StatusDot({ status }: { status: StageStatus }) {
  return (
    <span
      className={cn(
        "size-2 rounded-full",
        status === "success" && "bg-ok",
        status === "running" && "bg-accent",
        status === "skipped" && "bg-subtle",
        status === "failed" && "bg-signal",
        status === "idle" && "bg-border",
      )}
    />
  );
}
