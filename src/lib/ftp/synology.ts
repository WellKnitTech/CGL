import type { ConnRow, QualityFlag, SysRow } from "./types";

function epochIso(epoch: number | null): string {
  if (!epoch) return "";
  let n = epoch;
  if (n > 10 ** 12) n = n / 1000;
  try {
    return new Date(n * 1000).toISOString().replace(/\.\d+Z$/, "Z");
  } catch {
    return "";
  }
}

export function parseSynology(
  tree: Record<string, string>,
  flags: QualityFlag[],
): { conn: ConnRow[]; sys: SysRow[]; flags: QualityFlag[] } {
  const conn: ConnRow[] = [];
  const sys: SysRow[] = [];
  for (const [path, body] of Object.entries(tree)) {
    const b = path.replace(/\\/g, "/").split("/").pop()?.toLowerCase() ?? "";
    const csvish = body.includes(",") && body.includes("\n");
    if (!csvish) continue;
    const lines = body.trim().split(/\r?\n/);
    const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
    const idx = (n: string) => header.indexOf(n);
    if (b.includes("synoconndb")) {
      for (let i = 1; i < lines.length; i++) {
        const c = lines[i].split(",");
        const ts = Number(c[idx("time")] || c[idx("tstamp")] || 0) || null;
        conn.push({
          id: `${path}:${i}`,
          sourceDb: path,
          tsEpoch: ts,
          tsUtc: epochIso(ts),
          level: c[idx("level")] || "",
          username: c[idx("username")] || c[idx("user")] || "",
          user: c[idx("user")] || c[idx("username")] || "",
          uid: c[idx("uid")] || "",
          ip: c[idx("ip")] || "",
          protocol: c[idx("protocol")] || c[idx("proto")] || "",
          token: c[idx("token")] || "",
          useragent: c[idx("useragent")] || "",
          msg: c[idx("msg")] || c.slice(header.length).join(",") || lines[i],
        });
      }
    }
    if (b.includes("synosysdb")) {
      for (let i = 1; i < lines.length; i++) {
        const c = lines[i].split(",");
        const ts = Number(c[idx("time")] || 0) || null;
        sys.push({
          id: `${path}:${i}`,
          sourceDb: path,
          tsEpoch: ts,
          tsUtc: epochIso(ts),
          level: c[idx("level")] || "",
          username: c[idx("username")] || c[idx("user")] || "",
          msg: c[idx("msg")] || lines[i],
        });
      }
    }
  }
  if (!conn.length) flags.push({ code: "no_synoconn", severity: "gap", message: "No .SYNOCONNDB rows parsed." });
  return { conn, sys, flags };
}
