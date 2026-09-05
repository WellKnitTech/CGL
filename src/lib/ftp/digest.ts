import { kindLabel } from "./kind";
import type { CaseDigest, PipelineResult } from "./types";

function topN(items: string[], n = 5) {
  const m = new Map<string, number>();
  for (const i of items) {
    if (!i) continue;
    m.set(i, (m.get(i) ?? 0) + 1);
  }
  return [...m.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k, v]) => ({ k, n: v }));
}

export function buildDigest(r: Omit<PipelineResult, "digest" | "artifacts" | "stages">): CaseDigest {
  const times = [
    ...r.conn.map((c) => c.tsUtc),
    ...r.sys.map((s) => s.tsUtc),
    ...r.linux.map((h) => h.tsHint),
    ...r.esxi.map((h) => h.tsHint),
  ].filter(Boolean).sort();
  const ips = topN([...r.conn.map((c) => c.ip), ...r.linux.map((h) => h.ip)]);
  const users = topN([
    ...r.conn.map((c) => c.user),
    ...r.history.map((h) => h.user),
    ...r.linux.map((h) => h.user),
    ...r.asset.users.map((u) => u.name),
  ]);
  const narrative: string[] = [
    `${r.host} classified as ${kindLabel(r.kind)}. ${r.decision}`,
  ];
  if (r.linux.length) narrative.push(`${r.linux.length} Linux/Unix IR hits across auth, syslog, audit, web.`);
  if (r.conn.length) narrative.push(`${r.conn.length} Synology connection rows (.SYNOCONNDB).`);
  if (r.history.length) narrative.push(`${r.history.length} shell history lines (ash/bash/zsh/csh).`);
  if (r.esxi.length) narrative.push(`${r.esxi.length} ESXi signal hits.`);
  if (r.hayabusa.length) narrative.push(`${r.hayabusa.length} Hayabusa rules on the Windows collection.`);
  return {
    host: r.host,
    kind: r.kind,
    osHint: r.asset.osHint,
    collectedAt: r.asset.collectedAt,
    firstEvent: times[0] || "—",
    lastEvent: times[times.length - 1] || "—",
    connRows: r.conn.length,
    sysRows: r.sys.length,
    historyLines: r.history.length,
    esxiHits: r.esxi.length,
    linuxHits: r.linux.length,
    topIps: ips.map((x) => ({ ip: x.k, n: x.n })),
    topUsers: users.map((x) => ({ user: x.k, n: x.n })),
    flags: r.flags,
    narrative,
  };
}
