import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/workbench/data-table";
import { copyText, downloadText, inventoryCsv } from "@/lib/ftp/csv";
import { kindLabel } from "@/lib/ftp/kind";
import type { FleetInventory } from "@/lib/ftp/types";

export function InventoryPanel({ fleet }: { fleet: FleetInventory }) {
  const cross = fleet.users.filter((u) => u.hosts.length > 1);
  const files = inventoryCsv(fleet);
  const [copied, setCopied] = useState<string | null>(null);

  async function copy(label: string, text: string) {
    const ok = await copyText(text);
    setCopied(ok ? label : "failed");
    window.setTimeout(() => setCopied(null), 1800);
  }

  return (
    <section className="scroll-mt-6 space-y-4 rounded-lg border border-border bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[0.65rem] uppercase tracking-wider text-subtle">Asset inventory</p>
          <h2 className="mt-1 text-lg font-medium tracking-tight">
            {fleet.hosts.length} hosts · {fleet.users.length} users
          </h2>
          <p className="mt-1 text-sm text-muted">
            Copy is tab-separated for Excel. CSV download is quoted UTF-8.
          </p>
        </div>
        {cross.length ? <Badge variant="warn">{cross.length} users on more than one host</Badge> : null}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => void copy("hosts", files.hostsTsv)}>
          Copy hosts
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => void copy("users", files.usersTsv)}>
          Copy users
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => void copy("both", files.bothTsv)}>
          Copy both
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => downloadText("cgl-hosts.csv", files.hostsCsv, "text/csv;charset=utf-8")}>
          Hosts.csv
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => downloadText("cgl-users.csv", files.usersCsv, "text/csv;charset=utf-8")}>
          Users.csv
        </Button>
        {copied ? (
          <Badge variant={copied === "failed" ? "warn" : "ok"}>
            {copied === "failed" ? "copy failed" : `copied ${copied} — paste in Excel`}
          </Badge>
        ) : null}
      </div>
      <DataTable
        empty="No hosts classified yet."
        columns={[
          { key: "hostname", label: "Hostname" },
          { key: "os", label: "OS / kind" },
          { key: "users", label: "Users" },
          { key: "priv", label: "Privileged" },
          { key: "archive", label: "Archive" },
        ]}
        rows={fleet.hosts.map((h) => ({
          hostname: h.hostname,
          os: `${kindLabel(h.kind)} · ${h.osHint.slice(0, 48)}`,
          users: h.users.length,
          priv: h.users.filter((u) => u.privileged).map((u) => u.name).join(", ") || "—",
          archive: h.sourceArchive,
        }))}
      />
      <p className="font-mono text-[0.65rem] uppercase tracking-wider text-subtle">Users</p>
      <DataTable
        empty="No users extracted."
        columns={[
          { key: "name", label: "User" },
          { key: "hosts", label: "Hosts" },
          { key: "os", label: "Family" },
          { key: "priv", label: "Priv" },
          { key: "kind", label: "Seen as" },
          { key: "src", label: "Sources" },
        ]}
        rows={fleet.users.map((u) => ({
          name: u.name,
          hosts: u.hosts.join(", "),
          os: u.osFamilies.join(", "),
          priv: u.privileged ? "yes" : "",
          kind: u.accountOn.length ? `account (${u.accountOn.length})` : "observed",
          src: u.sources.join(", "),
        }))}
      />
    </section>
  );
}
