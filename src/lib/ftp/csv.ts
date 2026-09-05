import { kindLabel } from "./kind";
import type { FleetInventory } from "./types";

export function csvCell(value: string | number | boolean): string {
  const s = String(value ?? "");
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(headers: string[], rows: (string | number | boolean)[][]): string {
  const lines = [headers.map(csvCell).join(",")];
  for (const row of rows) lines.push(row.map(csvCell).join(","));
  return lines.join("\r\n") + "\r\n";
}

export function toTsv(headers: string[], rows: (string | number | boolean)[][]): string {
  const cell = (v: string | number | boolean) => String(v ?? "").replace(/\t/g, " ").replace(/\r?\n/g, " ");
  const lines = [headers.map(cell).join("\t")];
  for (const row of rows) lines.push(row.map(cell).join("\t"));
  return lines.join("\r\n") + "\r\n";
}

export function fleetHostTable(fleet: FleetInventory) {
  const headers = ["hostname", "fqdn", "kind", "os", "collected_at", "user_count", "users", "privileged", "archive"];
  const rows = fleet.hosts.map((h) => [
    h.hostname,
    h.fqdn,
    kindLabel(h.kind),
    h.osHint,
    h.collectedAt,
    h.users.length,
    h.users.map((u) => u.name).join("; "),
    h.users.filter((u) => u.privileged).map((u) => u.name).join("; "),
    h.sourceArchive,
  ]);
  return { headers, rows };
}

export function fleetUserTable(fleet: FleetInventory) {
  const headers = ["user", "hosts", "host_count", "family", "privileged", "seen_as", "account_on", "sources"];
  const rows = fleet.users.map((u) => [
    u.name,
    u.hosts.join("; "),
    u.hosts.length,
    u.osFamilies.join("; "),
    u.privileged ? "yes" : "",
    u.accountOn.length ? "account" : "observed",
    u.accountOn.join("; "),
    u.sources.join("; "),
  ]);
  return { headers, rows };
}

export function inventoryCsv(fleet: FleetInventory) {
  const hosts = fleetHostTable(fleet);
  const users = fleetUserTable(fleet);
  return {
    hostsCsv: toCsv(hosts.headers, hosts.rows),
    usersCsv: toCsv(users.headers, users.rows),
    hostsTsv: toTsv(hosts.headers, hosts.rows),
    usersTsv: toTsv(users.headers, users.rows),
    bothTsv: `HOSTS\r\n${toTsv(hosts.headers, hosts.rows)}\r\nUSERS\r\n${toTsv(users.headers, users.rows)}`,
  };
}

export function downloadText(filename: string, body: string, mime: string) {
  const blob = new Blob(["\uFEFF" + body], { type: mime });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through */
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.left = "-9999px";
  document.body.appendChild(ta);
  ta.select();
  const ok = document.execCommand("copy");
  ta.remove();
  return ok;
}
