import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { copyText } from "@/lib/ftp/csv";
import { cglOpenHref, folderOf } from "@/lib/ftp/paths";
import type { ParsedArtifact } from "@/lib/ftp/types";
import type { ReviewMap, ReviewStatus } from "@/lib/ftp/review";
import { cn } from "@/lib/utils";

export function WorklistPanel({
  artifacts,
  review,
  analyst,
  title,
  onMark,
  assigneeByHost,
  onTakeHost,
  diskPath,
}: {
  artifacts: ParsedArtifact[];
  review: ReviewMap;
  analyst: string;
  title: string;
  onMark: (id: string, status: ReviewStatus) => void;
  assigneeByHost?: Record<string, string>;
  onTakeHost?: (host: string) => void;
  diskPath?: (a: ParsedArtifact) => string;
}) {
  const open = artifacts.filter((a) => (review[a.id]?.status ?? "open") === "open").length;
  const done = artifacts.length - open;
  const groups = new Map<string, ParsedArtifact[]>();
  for (const a of artifacts) {
    const list = groups.get(a.host) ?? [];
    list.push(a);
    groups.set(a.host, list);
  }
  const hosts = [...groups.keys()].sort((a, b) => {
    const aa = assigneeByHost?.[a] || "zzz";
    const bb = assigneeByHost?.[b] || "zzz";
    if (aa === analyst && bb !== analyst) return -1;
    if (bb === analyst && aa !== analyst) return 1;
    return a.localeCompare(b);
  });

  return (
    <section className="rounded-lg border border-border bg-surface p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="font-mono text-[0.65rem] uppercase tracking-wider text-subtle">Worklist</p>
          <h2 className="text-lg font-medium tracking-tight">{title}</h2>
        </div>
        <Badge variant={open ? "warn" : "ok"}>
          {done}/{artifacts.length} reviewed
        </Badge>
      </div>
      <div className="space-y-4">
        {hosts.map((host) => {
          const owner = assigneeByHost?.[host] || "";
          const mine = Boolean(analyst && owner === analyst);
          const items = groups.get(host) ?? [];
          return (
            <div key={host} className="rounded-md border border-border">
              <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
                <span className="text-sm font-medium text-fg">{host}</span>
                <Badge variant={owner ? (mine ? "ok" : "kind") : "warn"}>{owner || "unassigned"}</Badge>
                {onTakeHost && !mine ? (
                  <Button type="button" size="sm" variant="ghost" onClick={() => onTakeHost(host)}>
                    Assign to me
                  </Button>
                ) : null}
              </div>
              <ul>
                {items.map((a) => {
                  const st = review[a.id]?.status ?? "open";
                  return (
                    <li
                      key={a.id}
                      className={cn(
                        "flex flex-wrap items-center gap-2 px-3 py-2 even:bg-bg",
                        st !== "open" && "opacity-70",
                      )}
                    >
                      <input
                        type="checkbox"
                        className="size-4 accent-accent"
                        checked={st === "done"}
                        onChange={() => onMark(a.id, st === "done" ? "open" : "done")}
                        aria-label={`Mark ${a.label} done`}
                      />
                      <span className="min-w-0 flex-1 font-mono text-xs text-fg">{a.label}</span>
                      {diskPath ? (
                        <ArtifactPath path={diskPath(a)} rel={`${a.host}\\${a.outFile}`} source={a.path} />
                      ) : (
                        <span className="max-w-[18rem] truncate font-mono text-[0.65rem] text-subtle" title={a.outFile}>
                          {a.host}\\{a.outFile}
                        </span>
                      )}
                      <span className="font-mono text-[0.65rem] text-muted">{a.family}</span>
                      {review[a.id]?.by ? (
                        <span className="font-mono text-[0.65rem] text-subtle">{review[a.id].by}</span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ArtifactPath({ path, rel, source }: { path: string; rel: string; source?: string }) {
  const folder = folderOf(path);
  const href = cglOpenHref(path);
  return (
    <a
      href={href}
      title={`${path}\nRaw extract: ${source || "—"}\nOpens CSVOutput in Explorer. Click also copies the folder.`}
      onClick={() => {
        void copyText(folder);
      }}
      className="max-w-[22rem] truncate font-mono text-[0.65rem] text-accent underline-offset-2 hover:underline"
    >
      {rel.replace(/\//g, "\\")}
    </a>
  );
}
