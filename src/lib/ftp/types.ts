export type CollectionKind =
  | "velo_windows"
  | "uac_linux"
  | "uac_macos"
  | "uac_unix"
  | "uac_synology"
  | "uac_esxi"
  | "unknown";

export type StageId =
  | "extract"
  | "classify"
  | "json_csv"
  | "recmd"
  | "hayabusa"
  | "synology_sqlite"
  | "esxi_logs"
  | "linux_common"
  | "linux_logs"
  | "digest";

export type StageStatus = "idle" | "running" | "success" | "skipped" | "failed";

export type QualityFlag = {
  code: string;
  severity: "info" | "warn" | "gap";
  message: string;
};

export type FileNode = {
  path: string;
  bytes: number;
  hidden: boolean;
  kind: "file" | "dir";
};

export type ConnRow = {
  id: string;
  sourceDb: string;
  tsEpoch: number | null;
  tsUtc: string;
  level: string;
  username: string;
  user: string;
  uid: string;
  ip: string;
  protocol: string;
  token: string;
  useragent: string;
  msg: string;
};

export type SysRow = {
  id: string;
  sourceDb: string;
  tsEpoch: number | null;
  tsUtc: string;
  level: string;
  username: string;
  msg: string;
};

export type HistoryRow = {
  host: string;
  user: string;
  shell: string;
  sourcePath: string;
  lineNo: number;
  command: string;
  tsUtc: string;
};

export type EsxiHit = {
  log: string;
  lineNo: number;
  tsHint: string;
  rule: string;
  severity: "critical" | "high" | "medium";
  excerpt: string;
};

export type LinuxHit = {
  log: string;
  family: string;
  lineNo: number;
  tsHint: string;
  rule: string;
  severity: "critical" | "high" | "medium";
  user: string;
  ip: string;
  excerpt: string;
};

export type HayabusaHit = {
  rule: string;
  level: string;
  count: number;
  technique: string;
};

export type CaseDigest = {
  host: string;
  kind: CollectionKind;
  osHint: string;
  collectedAt: string;
  firstEvent: string;
  lastEvent: string;
  connRows: number;
  sysRows: number;
  historyLines: number;
  esxiHits: number;
  linuxHits: number;
  topIps: { ip: string; n: number }[];
  topUsers: { user: string; n: number }[];
  flags: QualityFlag[];
  narrative: string[];
};

export type AssetUser = {
  name: string;
  uid?: string;
  sid?: string;
  kind: "account" | "observed";
  sources: string[];
  lastSeen?: string;
  privileged: boolean;
};

export type AssetHost = {
  hostname: string;
  fqdn: string;
  kind: CollectionKind;
  osHint: string;
  collectedAt: string;
  sourceArchive: string;
  users: AssetUser[];
};

export type FleetUser = {
  name: string;
  hosts: string[];
  osFamilies: string[];
  sources: string[];
  privileged: boolean;
  accountOn: string[];
};

export type FleetInventory = {
  hosts: AssetHost[];
  users: FleetUser[];
};

export type ParsedArtifact = {
  id: string;
  host: string;
  path: string;
  outFile: string;
  label: string;
  family: string;
  stage: StageId;
  rows: number;
  present: boolean;
};

export type PipelineResult = {
  kind: CollectionKind;
  host: string;
  files: FileNode[];
  flags: QualityFlag[];
  conn: ConnRow[];
  sys: SysRow[];
  history: HistoryRow[];
  esxi: EsxiHit[];
  linux: LinuxHit[];
  hayabusa: HayabusaHit[];
  jsonCsvFiles: number;
  recmdNote: string;
  decision: string;
  digest: CaseDigest;
  asset: AssetHost;
  artifacts: ParsedArtifact[];
  stages: Record<StageId, StageStatus>;
};

export type DemoCase = {
  id: string;
  title: string;
  subtitle: string;
  archiveName: string;
  tree: Record<string, string>;
};
