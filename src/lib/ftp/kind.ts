import type { CollectionKind } from "./types";

export function kindLabel(kind: CollectionKind): string {
  switch (kind) {
    case "uac_synology":
      return "UAC · Synology";
    case "uac_esxi":
      return "UAC · ESXi";
    case "uac_linux":
      return "UAC · Linux";
    case "uac_macos":
      return "UAC · macOS";
    case "uac_unix":
      return "UAC · Unix";
    case "velo_windows":
      return "Velociraptor · Windows";
    default:
      return "Unclassified";
  }
}

export function osFamily(kind: CollectionKind): string {
  if (kind === "velo_windows") return "windows";
  if (kind === "uac_macos") return "macos";
  if (kind === "uac_esxi") return "esxi";
  if (kind === "uac_unix") return "unix";
  if (kind === "uac_synology" || kind === "uac_linux") return "linux";
  return "unknown";
}
