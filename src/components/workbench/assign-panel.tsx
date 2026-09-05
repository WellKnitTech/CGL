import { ClipboardList } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { assignedTo, foldAssignments, normalizeInitials, type AssignEvent, type AssignMap } from "@/lib/ftp/collab";
import { cn } from "@/lib/utils";

export type Assignable = { id: string; title: string; subtitle: string };

export function AssignPanel({
  collections,
  assigns,
  lead,
  roster,
  self,
  onAssign,
}: {
  collections: Assignable[];
  assigns: AssignEvent[];
  lead: string;
  roster: string[];
  self: string;
  onAssign: (collectionIds: string[], assignee: string) => void;
}) {
  const map: AssignMap = useMemo(() => foldAssignments(assigns), [assigns]);
  const [initials, setInitials] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const byAnalyst = useMemo(() => {
    const groups = new Map<string, string[]>();
    for (const c of collections) {
      const who = map[c.id]?.assignee || "unassigned";
      const list = groups.get(who) ?? [];
      list.push(c.title);
      groups.set(who, list);
    }
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [collections, map]);

  function toggle(id: string) {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }
  function go(who: string) {
    const ids = picked.length ? picked : collections.filter((c) => !map[c.id]?.assignee).map((c) => c.id);
    if (!ids.length) return;
    onAssign(ids, who);
    setPicked([]);
  }
  const who = normalizeInitials(initials);

  return (
    <section className="mb-6 rounded-lg border border-border bg-surface p-4 sm:p-5">
      <div className="mb-4 flex items-start gap-3">
        <ClipboardList className="mt-0.5 size-4 text-accent" />
        <div>
          <p className="text-sm font-medium">Assign collections</p>
          <p className="mt-1 max-w-xl text-xs text-muted">
            Case lead types initials — or take hosts yourself. No accounts.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {collections.map((c) => {
          const a = map[c.id];
          const on = picked.includes(c.id);
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => toggle(c.id)}
              className={cn("min-h-11 rounded-md border px-3 py-2 text-left", on ? "border-accent bg-surface-2 text-fg" : "border-border text-muted")}
            >
              <span className="block text-sm font-medium text-fg">{c.title}</span>
              <span className="block font-mono text-[0.65rem]">{a?.assignee ? `→ ${a.assignee}` : "unassigned"}</span>
            </button>
          );
        })}
      </div>
      <div className="mt-4 flex flex-wrap items-end gap-2">
        <div>
          <label htmlFor="assign-initials" className="block text-xs text-muted">
            Assign to
          </label>
          <input
            id="assign-initials"
            value={initials}
            onChange={(e) => setInitials(e.target.value)}
            placeholder="AA"
            maxLength={8}
            className="mt-1 h-11 w-28 rounded-sm border border-border bg-bg px-3 font-mono text-sm uppercase"
          />
        </div>
        <Button type="button" size="sm" disabled={!picked.length && !who} onClick={() => go(who)}>
          {who ? `Give ${picked.length ? picked.length : "open"} to ${who}` : "Unassign selected"}
        </Button>
        {self ? (
          <Button type="button" size="sm" variant="outline" onClick={() => go(self)}>
            Assign to me ({self})
          </Button>
        ) : null}
        {roster.map((r) => (
          <Button key={r} type="button" variant="ghost" size="sm" onClick={() => setInitials(r)}>
            {r}
          </Button>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {byAnalyst.map(([k, titles]) => (
          <Badge key={k} variant={k === "unassigned" ? "warn" : "ok"}>
            {k === "unassigned" ? "open" : k} · {titles.length}
          </Badge>
        ))}
        {lead && assignedTo(map, lead).length ? <Badge variant="kind">{lead} has {assignedTo(map, lead).length}</Badge> : null}
      </div>
    </section>
  );
}
