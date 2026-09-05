import { Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Presence } from "@/lib/ftp/collab";

export function PresenceBar({
  self,
  peers,
  lastLine,
  teamSize,
}: {
  self: Presence;
  peers: Presence[];
  lastLine: string | null;
  teamSize: number;
}) {
  const others = peers.filter((p) => p.seatId !== self.seatId);
  return (
    <section className="mb-6 rounded-lg border border-border bg-surface p-4">
      <div className="flex items-start gap-3">
        <Users className="mt-0.5 size-4 text-accent" />
        <div>
          <p className="text-sm font-medium">Live case</p>
          <p className="mt-1 max-w-xl text-xs text-muted">
            Initials only. A dozen seats can mark the same case — last write on that artifact wins.
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Badge variant="ok">{self.analyst || "you"} · this seat</Badge>
        <Badge variant="kind">{teamSize} on roster</Badge>
        {others.map((p) => (
          <Badge key={p.seatId} variant="kind">
            {p.analyst || p.seatId} · {p.hostName || "idle"}
          </Badge>
        ))}
        {!others.length ? <Badge variant="default">just you live</Badge> : null}
      </div>
      {lastLine ? <p className="mt-3 font-mono text-[0.7rem] text-subtle">{lastLine}</p> : null}
    </section>
  );
}
