import { UserPlus } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Presence } from "@/lib/ftp/collab";
import { livePresence, normalizeInitials } from "@/lib/ftp/collab";
import { cn } from "@/lib/utils";

export type TeamRow = {
  initials: string;
  hosts: number;
  open: number;
  total: number;
};

export function TeamPanel({
  team,
  rows,
  lead,
  self,
  peers,
  pin,
  onAdd,
  onDrop,
  onPin,
}: {
  team: string[];
  rows: TeamRow[];
  lead: string;
  self: string;
  peers: Presence[];
  pin: string | null;
  onAdd: (initials: string) => void;
  onDrop: (initials: string) => void;
  onPin: (initials: string | null) => void;
}) {
  const [draft, setDraft] = useState("");
  const live = livePresence(peers);
  const who = normalizeInitials(draft);

  function add() {
    if (!who) return;
    onAdd(who);
    setDraft("");
  }

  return (
    <section className="mb-6 rounded-lg border border-border bg-surface p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <UserPlus className="mt-0.5 size-4 text-accent" />
          <div>
            <p className="text-sm font-medium">Team · {team.length}</p>
            <p className="mt-1 max-w-xl text-xs text-muted">Add initials, assign hosts, pin anyone’s pile. Case lead is locked in the header — only they can pass it.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <input
            id="team-add"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") add();
            }}
            placeholder="MK"
            maxLength={8}
            className="h-11 w-24 rounded-sm border border-border bg-bg px-3 font-mono text-sm uppercase"
          />
          <Button type="button" size="sm" disabled={!who} onClick={add}>
            Add
          </Button>
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((r) => {
          const here = live.filter((p) => p.analyst === r.initials);
          const mine = r.initials === self;
          return (
            <div
              key={r.initials}
              className={cn(
                "rounded-md border px-3 py-3",
                pin === r.initials ? "border-accent bg-surface-2" : "border-border",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="font-mono text-sm text-fg">
                  {r.initials}
                  {r.initials === lead ? " · lead" : ""}
                  {mine ? " · you" : ""}
                </p>
                <Badge variant={here.length ? "ok" : "default"}>{here.length ? `${here.length} live` : "away"}</Badge>
              </div>
              <p className="mt-1 font-mono text-[0.65rem] text-subtle">
                {r.hosts} hosts · {r.total ? `${r.total - r.open}/${r.total}` : "—"} reviewed
              </p>
              <div className="mt-2 flex flex-wrap gap-1">
                <Button type="button" variant={pin === r.initials ? "outline" : "ghost"} size="sm" onClick={() => onPin(pin === r.initials ? null : r.initials)}>
                  {pin === r.initials ? "Unpin" : "Pin pile"}
                </Button>
                {!mine ? (
                  <Button type="button" variant="ghost" size="sm" onClick={() => onDrop(r.initials)}>
                    Drop
                  </Button>
                ) : null}
              </div>
            </div>
          );
        })}
        {!rows.length ? <p className="text-sm text-muted">Add initials. This case can hold a full IR crew.</p> : null}
      </div>
    </section>
  );
}
