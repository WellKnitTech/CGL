import { osFamily } from "./kind";
import type { AssetHost, AssetUser, CollectionKind, FleetInventory } from "./types";

const SKIP = new Set([
  "bin", "daemon", "sys", "sync", "games", "man", "lp", "mail", "news", "uucp",
  "proxy", "list", "irc", "gnats", "nobody", "messagebus", "syslog", "sshd",
  "uuidd", "tcpdump", "polkitd", "dbus", "unknown", "-",
]);
const PRIV = new Set(["root", "admin", "administrator", "dcui"]);

function cleanName(raw: string): string {
  const n = raw.trim().replace(/^["']|["']$/g, "");
  if (!n || n.length > 32) return "";
  if (!/^[A-Za-z0-9._$-]+$/.test(n)) return "";
  if (n.endsWith("$")) return "";
  const low = n.toLowerCase();
  if (SKIP.has(low) || low.startsWith("systemd-")) return "";
  return n;
}

function addUser(map: Map<string, AssetUser>, name: string, patch: Partial<AssetUser>) {
  const n = cleanName(name);
  if (!n) return;
  const key = n.toLowerCase();
  const cur = map.get(key);
  const sources = new Set(cur?.sources ?? []);
  for (const s of patch.sources ?? []) sources.add(s);
  map.set(key, {
    name: cur?.name ?? n,
    uid: patch.uid || cur?.uid,
    sid: patch.sid || cur?.sid,
    kind: cur?.kind === "account" || patch.kind === "account" ? "account" : "observed",
    sources: [...sources],
    lastSeen: patch.lastSeen || cur?.lastSeen,
    privileged: Boolean(cur?.privileged || patch.privileged || PRIV.has(key) || patch.uid === "0"),
  });
}

export function identityFromCollection(
  tree: Record<string, string>,
  archiveName: string,
): { hostname: string; fqdn: string; collectedAt: string; osHint: string } {
  let hostname = archiveName.replace(/\.(tar\.gz|tgz|zip|tar)$/i, "");
  hostname = hostname.replace(/^uac-/i, "").replace(/-linux-.*|-esxi-.*|-macos-.*|-darwin-.*|-freebsd-.*$/i, "");
  hostname = hostname.replace(/^F-/, "").replace(/-collection$/i, "");
  let fqdn = hostname;
  let collectedAt = "";
  let osHint = "";
  for (const [p, body] of Object.entries(tree)) {
    const path = p.replace(/\\/g, "/").toLowerCase();
    if (path.endsWith("/hostname") || path.endsWith("etc/hostname")) {
      hostname = body.trim().split(/\s/)[0] || hostname;
    }
    if (path.endsWith("uac.log")) {
      const h = body.match(/^hostname:\s*(\S+)/im);
      const o = body.match(/^os:\s*(.+)$/im);
      const c = body.match(/^start time:\s*(.+)$/im);
      if (h) hostname = h[1];
      if (o) osHint = o[1].trim();
      if (c) collectedAt = c[1].trim();
    }
    if (path.endsWith("collection.json")) {
      try {
        const j = JSON.parse(body);
        hostname = j.hostname || j.Fqdn || hostname;
        fqdn = j.fqdn || j.Fqdn || hostname;
      } catch {
        /* ignore */
      }
    }
    if (path.includes("uname") && !osHint) osHint = body.trim().split("\n")[0];
  }
  return { hostname, fqdn, collectedAt, osHint };
}

export function parsePasswd(body: string, map: Map<string, AssetUser>) {
  for (const line of body.split(/\r?\n/)) {
    const [name, , uid] = line.split(":");
    if (!name || name.startsWith("#")) continue;
    const n = Number(uid);
    if (!(n === 0 || n >= 500)) continue;
    addUser(map, name, { uid, kind: "account", sources: ["passwd"], privileged: n === 0 });
  }
}

export function usersFromTree(
  tree: Record<string, string>,
  extra: { user?: string; username?: string; sources?: string[] }[],
): AssetUser[] {
  const map = new Map<string, AssetUser>();
  for (const [p, body] of Object.entries(tree)) {
    const path = p.replace(/\\/g, "/").toLowerCase();
    if (path.endsWith("/passwd") || path.endsWith("/passwd-") || path.endsWith("etc/passwd")) {
      parsePasswd(body, map);
    }
    if (path.includes("ntuser") || path.endsWith("sam.json") || path.includes("/sam/")) {
      try {
        const j = JSON.parse(body);
        const names: string[] = j.users || j.Users || [];
        for (const n of names) addUser(map, n, { kind: "account", sources: path.includes("sam") ? ["sam"] : ["ntuser"] });
      } catch {
        for (const n of body.split(/\r?\n/)) addUser(map, n, { kind: "account", sources: ["sam"] });
      }
    }
    if (path.includes(".ash_history") || path.includes(".bash_history") || path.includes(".zsh_history")) {
      const user = path.includes("/root/") ? "root" : /\/(?:home|Users)\/([^/]+)\//.exec(p.replace(/\\/g, "/"))?.[1];
      if (user) addUser(map, user, { kind: "account", sources: ["history", "home"] });
    }
  }
  for (const e of extra) addUser(map, e.user || e.username || "", { kind: "observed", sources: e.sources ?? ["log"] });
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function buildHostAsset(
  tree: Record<string, string>,
  archiveName: string,
  kind: CollectionKind,
  extraUsers: { user?: string; username?: string; sources?: string[] }[],
): AssetHost {
  const id = identityFromCollection(tree, archiveName);
  return {
    ...id,
    kind,
    sourceArchive: archiveName,
    users: usersFromTree(tree, extraUsers),
  };
}

export function buildFleet(hosts: AssetHost[]): FleetInventory {
  const um = new Map<
    string,
    { name: string; hosts: Set<string>; os: Set<string>; sources: Set<string>; privileged: boolean; accountOn: Set<string> }
  >();
  for (const h of hosts) {
    for (const u of h.users) {
      const key = u.name.toLowerCase();
      const cur = um.get(key) ?? {
        name: u.name,
        hosts: new Set<string>(),
        os: new Set<string>(),
        sources: new Set<string>(),
        privileged: false,
        accountOn: new Set<string>(),
      };
      cur.hosts.add(h.hostname);
      cur.os.add(osFamily(h.kind));
      u.sources.forEach((s) => cur.sources.add(s));
      cur.privileged = cur.privileged || u.privileged;
      if (u.kind === "account") cur.accountOn.add(h.hostname);
      um.set(key, cur);
    }
  }
  const users = [...um.values()]
    .map((u) => ({
      name: u.name,
      hosts: [...u.hosts].sort(),
      osFamilies: [...u.os].sort(),
      sources: [...u.sources].sort(),
      privileged: u.privileged,
      accountOn: [...u.accountOn].sort(),
    }))
    .sort((a, b) => b.hosts.length - a.hosts.length || a.name.localeCompare(b.name));
  return { hosts: [...hosts].sort((a, b) => a.hostname.localeCompare(b.hostname)), users };
}
