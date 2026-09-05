#!/usr/bin/env python3
"""
CGL 5.0 — Collection Grind Ledger. Unattended auto mill.

Runs on Windows lab VMs (py -3 / python.exe / cgl.cmd). Stdlib only.
Collections may be Linux, macOS, ESXi, Synology, or Velociraptor Windows —
the mill host is Windows.

  py -3 ftp_5_0.py --source E:\\data_ingest --unzip E:\\Results\\Extracted --out E:\\Results\\CSVOutput --non-interactive
  py -3 ftp_5_0.py --config ftp50.json --non-interactive
  cgl.cmd
  powershell -File cgl.ps1 -RegisterTask
"""
from __future__ import annotations

import argparse
import csv
import ctypes
import json
import logging
import os
import re
import shutil
import sqlite3
import tarfile
import zipfile
from datetime import datetime, timezone
from pathlib import Path

SCRIPT_VERSION = "5.0.0"
STAGE_MARKER = ".COMPLETE"
LOCK_NAME = ".ftp.lock"

WINDOWS_STAGES = ("json_csv", "recmd", "hayabusa")
UAC_STAGES = ("synology_sqlite", "esxi_logs", "linux_common", "linux_logs")
CORE = ("extract", "classify", "digest")

SYN_DB_BASENAMES = {
    ".synoconndb": "SYNOCONNDB",
    "synoconndb": "SYNOCONNDB",
    ".synosysdb": "SYNOSYSDB",
    "synosysdb": "SYNOSYSDB",
    ".synosyslogdb": "SYNOSYSLOGDB",
}
HISTORY_NAMES = {
    ".ash_history": "ash",
    ".bash_history": "bash",
    ".sh_history": "sh",
    ".zsh_history": "zsh",
    ".zhistory": "zsh",
    ".csh_history": "csh",
    ".tcsh_history": "tcsh",
    ".ksh_history": "ksh",
    ".history": "sh",
}
ESXI_LOGS = ("shell.log", "hostd.log", "vobd.log", "vmkernel.log", "rhttpproxy.log", "syslog.log", "vpxa.log", "auth.log")
PRIV = {"root", "admin", "administrator", "dcui"}
SKIP_USERS = {
    "bin", "daemon", "sys", "sync", "games", "man", "lp", "mail", "news", "uucp",
    "proxy", "list", "irc", "gnats", "nobody", "messagebus", "syslog", "sshd",
    "uuidd", "tcpdump", "polkitd", "dbus", "unknown", "-",
}
WIN_BAD = re.compile(r'[<>:"|?*]')


def plan_stages(kind: str) -> dict[str, str]:
    plan = {s: "skip" for s in CORE + WINDOWS_STAGES + UAC_STAGES}
    for s in CORE:
        plan[s] = "run"
    if kind == "velo_windows":
        for s in WINDOWS_STAGES:
            plan[s] = "run"
    elif kind == "uac_synology":
        plan["synology_sqlite"] = "run"
        plan["linux_common"] = "run"
        plan["linux_logs"] = "run"
    elif kind == "uac_esxi":
        plan["esxi_logs"] = "run"
        plan["linux_common"] = "run"
    else:
        plan["linux_common"] = "run"
        plan["linux_logs"] = "run"
    return plan


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def walk_all(root: Path):
    for dirpath, _dirnames, filenames in os.walk(root):
        for name in filenames:
            yield Path(dirpath) / name


def read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return ""


def pid_alive(pid: int) -> bool:
    """True if pid exists. Never TerminateProcess — os.kill on Windows would kill it."""
    if pid <= 0:
        return False
    if os.name == "nt":
        PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
        handle = ctypes.windll.kernel32.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, False, int(pid))
        if handle:
            ctypes.windll.kernel32.CloseHandle(handle)
            return True
        return False
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False


def sqlite_ro_uri(path: Path) -> str:
    return path.resolve().as_uri() + "?mode=ro"


def safe_member_name(name: str) -> str | None:
    name = name.replace("\\", "/")
    if re.match(r"^[A-Za-z]:", name):
        name = name[2:]
    name = name.lstrip("/")
    parts: list[str] = []
    for part in name.split("/"):
        if part in ("", ".", ".."):
            continue
        part = WIN_BAD.sub("_", part).rstrip(" .")
        if part:
            parts.append(part)
    return "/".join(parts) if parts else None


def load_mill_config(path: Path | None) -> dict:
    if not path or not path.is_file():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}


def resolve_roots(args) -> tuple[Path, Path, Path, Path, str]:
    cfg = load_mill_config(Path(args.config) if args.config else None)
    source = args.source or cfg.get("source_root") or r"E:\data_ingest"
    unzip = args.unzip or cfg.get("unzip_root") or r"E:\Results\Extracted"
    out = args.out or cfg.get("output_root") or r"E:\Results\CSVOutput"
    db = args.db or cfg.get("case_db") or str(Path(out) / "ftp50.case.db")
    analyst = args.analyst or cfg.get("analyst") or ""
    return Path(source), Path(unzip), Path(out), Path(db), analyst


def acquire_lock(out: Path) -> Path | None:
    lock = out / LOCK_NAME
    if lock.is_file():
        try:
            pid = int(lock.read_text(encoding="utf-8").strip().split()[0])
            if pid_alive(pid):
                logging.info("IgnoreNew — pid %s still holds the lock. Exiting.", pid)
                return None
            lock.unlink(missing_ok=True)
        except (ValueError, OSError):
            lock.unlink(missing_ok=True)
    out.mkdir(parents=True, exist_ok=True)
    lock.write_text(f"{os.getpid()} {utc_now()}\n", encoding="utf-8")
    return lock


def classify(extract: Path, archive_name: str = "") -> str:
    paths = [p.as_posix().lower() for p in walk_all(extract)]
    name = archive_name.lower()
    uac = next((p for p in walk_all(extract) if p.name.lower() == "uac.log"), None)
    os_line = ""
    if uac:
        m = re.search(r"^os:\s*(\S+)", read_text(uac), re.I | re.M)
        if m:
            os_line = m.group(1).lower()
    uname = next((p for p in walk_all(extract) if "uname" in p.name.lower()), None)
    uname_txt = read_text(uname).lower() if uname else ""
    has_uac = any(p.endswith("uac.log") for p in paths) or name.startswith("uac-") or "uac-" in name
    has_velo = any("/results/" in p and p.endswith(".json") for p in paths) or any(p.endswith("collection.json") for p in paths)
    has_syn = any("synolog" in p for p in paths) or any(p.split("/")[-1] in SYN_DB_BASENAMES for p in paths)
    has_esx = any(p.endswith(x) for p in paths for x in ("vmkernel.log", "hostd.log", "shell.log")) or "-esxi-" in name or os_line == "esxi"
    has_mac = os_line in ("darwin", "macos", "osx") or uname_txt.startswith("darwin") or "-macos-" in name or any("/private/var/log" in p or "/library/logs" in p for p in paths)
    has_unix = os_line in ("freebsd", "openbsd", "netbsd", "solaris", "sunos", "aix") or uname_txt.startswith(("freebsd", "openbsd", "netbsd", "sunos")) or any("/var/adm/" in p for p in paths)
    if has_uac or has_syn or (has_esx and not has_velo):
        if has_syn:
            return "uac_synology"
        if has_esx:
            return "uac_esxi"
        if has_mac:
            return "uac_macos"
        if has_unix:
            return "uac_unix"
        if has_uac:
            return "uac_linux"
    if has_mac and not has_velo:
        return "uac_macos"
    if has_unix and not has_velo:
        return "uac_unix"
    if has_velo:
        return "velo_windows"
    return "unknown"


def extract_archive(src: Path, dest: Path) -> bool:
    dest.mkdir(parents=True, exist_ok=True)
    suf = "".join(src.suffixes).lower()
    try:
        if src.is_dir():
            shutil.copytree(src, dest, dirs_exist_ok=True)
            return True
        if suf.endswith(".zip"):
            with zipfile.ZipFile(src, "r") as z:
                for info in z.infolist():
                    rel = safe_member_name(info.filename)
                    if not rel or info.is_dir() or rel.endswith("/"):
                        continue
                    target = dest.joinpath(*rel.split("/"))
                    target.parent.mkdir(parents=True, exist_ok=True)
                    with z.open(info) as src_f, open(target, "wb") as out_f:
                        shutil.copyfileobj(src_f, out_f)
            return True
        if any(suf.endswith(x) for x in (".tar", ".tar.gz", ".tgz", ".tar.bz2")):
            with tarfile.open(src, "r:*") as t:
                for member in t.getmembers():
                    if not member.isfile():
                        continue
                    rel = safe_member_name(member.name)
                    if not rel:
                        continue
                    target = dest.joinpath(*rel.split("/"))
                    target.parent.mkdir(parents=True, exist_ok=True)
                    src_f = t.extractfile(member)
                    if src_f is None:
                        continue
                    with src_f, open(target, "wb") as out_f:
                        shutil.copyfileobj(src_f, out_f)
            return True
    except Exception as e:
        logging.error("extract failed %s: %s", src, e)
        return False
    logging.error("unsupported archive %s", src)
    return False


def copy_sqlite_trio(db_path: Path, tmp_dir: Path) -> Path:
    dest = tmp_dir / db_path.name
    shutil.copy2(db_path, dest)
    for suffix in ("-wal", "-shm"):
        sibling = db_path.with_name(db_path.name + suffix)
        if sibling.is_file():
            shutil.copy2(sibling, dest.with_name(dest.name + suffix))
    return dest


def dump_sqlite(db_path: Path, out_csv: Path) -> int:
    tmp = out_csv.parent / "_sqlite_copy"
    tmp.mkdir(parents=True, exist_ok=True)
    copied = copy_sqlite_trio(db_path, tmp)
    conn = sqlite3.connect(sqlite_ro_uri(copied), uri=True)
    conn.row_factory = sqlite3.Row
    try:
        tables = [r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")]
        table = "logs" if "logs" in tables else (tables[0] if tables else None)
        if not table:
            return 0
        rows = list(conn.execute(f'SELECT * FROM "{table}"'))
        if not rows:
            return 0
        cols = [d[0] for d in conn.execute(f'PRAGMA table_info("{table}")')]
        with open(out_csv, "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=cols)
            w.writeheader()
            for r in rows:
                w.writerow({c: r[c] for c in cols})
        return len(rows)
    except Exception as e:
        logging.error("sqlite dump %s: %s", db_path, e)
        return 0
    finally:
        conn.close()


def dump_synology_csv(extract: Path, dest: Path) -> tuple[int, int]:
    conn_n = sys_n = 0
    for p in walk_all(extract):
        key = p.name.lower()
        if key not in SYN_DB_BASENAMES:
            continue
        label = SYN_DB_BASENAMES[key]
        n = dump_sqlite(p, dest / f"{label}.csv")
        if label == "SYNOCONNDB":
            conn_n += n
        else:
            sys_n += n
    return conn_n, sys_n


def resolve_host(extract: Path, archive_name: str) -> str:
    for p in walk_all(extract):
        if p.name.lower() == "collection.json":
            try:
                j = json.loads(read_text(p))
                return j.get("hostname") or j.get("Fqdn") or archive_name
            except json.JSONDecodeError:
                pass
        if p.name.lower() == "uac.log":
            m = re.search(r"^hostname:\s*(\S+)", read_text(p), re.I | re.M)
            if m:
                return m.group(1)
        if p.name.lower() == "hostname":
            h = read_text(p).strip().split()[0]
            if h:
                return h
    name = Path(archive_name).name
    name = re.sub(r"\.(tar\.gz|tgz|zip|tar)$", "", name, flags=re.I)
    name = re.sub(r"^uac-", "", name, flags=re.I)
    name = re.sub(r"-linux-.*|-esxi-.*|-macos-.*|-darwin-.*|-freebsd-.*$", "", name, flags=re.I)
    return name or "unknown-host"


def parse_history(extract: Path, host: str) -> list[dict]:
    rows = []
    for p in walk_all(extract):
        shell = HISTORY_NAMES.get(p.name.lower())
        if not shell:
            continue
        posix = p.as_posix()
        user = "root" if "/root/" in posix.replace("\\", "/") else "unknown"
        m = re.search(r"/(?:home|Users)/([^/]+)/", posix.replace("\\", "/"))
        if m:
            user = m.group(1)
        for i, line in enumerate(read_text(p).splitlines(), 1):
            if not line.strip() or line.startswith("#"):
                continue
            rows.append({"host": host, "user": user, "shell": shell, "path": str(p), "lineNo": i, "command": line})
    return rows


AUTH_RE = [
    ("ssh_accepted", re.compile(r"Accepted (?:password|publickey) for (\S+) from (\S+)", re.I)),
    ("ssh_failed", re.compile(r"Failed password for(?: invalid user)? (\S+) from (\S+)", re.I)),
    ("sudo", re.compile(r"sudo:\s+(\S+)\s*:", re.I)),
]
WEB_RE = re.compile(r"\.(?:php|jsp|aspx)\b.*(?:cmd=|exec=)", re.I)


def linux_family(path: Path) -> bool:
    b = path.name.lower()
    return bool(re.search(r"auth\.log|secure|syslog|messages|audit|nginx|access\.log|cron|system\.log|install\.log|synoscgi", b))


def parse_linux_logs(extract: Path) -> list[dict]:
    hits = []
    for p in walk_all(extract):
        if not linux_family(p):
            continue
        for i, line in enumerate(read_text(p).splitlines(), 1):
            for rule, cre in AUTH_RE:
                m = cre.search(line)
                if m:
                    hits.append({"log": str(p), "rule": rule, "user": m.group(1), "ip": m.group(2) if m.lastindex and m.lastindex >= 2 else "", "excerpt": line[:180], "lineNo": i})
                    break
            else:
                if WEB_RE.search(line):
                    hits.append({"log": str(p), "rule": "webshell", "user": "", "ip": "", "excerpt": line[:180], "lineNo": i})
    return hits


def parse_esxi(extract: Path) -> list[dict]:
    hits = []
    rules = [
        ("shell_cmd", re.compile(r"shell\[\d+\]:.*(?:vim-cmd|esxcli|chmod)", re.I)),
        ("ssh_enable", re.compile(r"SSH.*(enabled|started)", re.I)),
        ("root_login", re.compile(r"Accepted.*?root", re.I)),
    ]
    for p in walk_all(extract):
        if p.name.lower() not in ESXI_LOGS:
            continue
        for i, line in enumerate(read_text(p).splitlines(), 1):
            for rule, cre in rules:
                if cre.search(line):
                    hits.append({"log": str(p), "rule": rule, "excerpt": line[:180], "lineNo": i})
                    break
    return hits


def collect_users(extract: Path, extra: list[str]) -> list[dict]:
    found: dict[str, dict] = {}
    def add(name: str, src: str, priv: bool = False, account: bool = False):
        n = name.strip()
        if not n or n.lower() in SKIP_USERS or len(n) > 32:
            return
        if not re.match(r"^[A-Za-z0-9._-]+$", n):
            return
        key = n.lower()
        cur = found.setdefault(key, {"name": n, "sources": [], "privileged": False, "kind": "observed"})
        if src not in cur["sources"]:
            cur["sources"].append(src)
        cur["privileged"] = cur["privileged"] or priv or key in PRIV
        if account:
            cur["kind"] = "account"
    for p in walk_all(extract):
        if p.name.lower() in ("passwd", "passwd-"):
            for line in read_text(p).splitlines():
                parts = line.split(":")
                if len(parts) < 3:
                    continue
                try:
                    uid = int(parts[2])
                except ValueError:
                    continue
                if uid == 0 or uid >= 500:
                    add(parts[0], "passwd", uid == 0, True)
    for n in extra:
        add(n, "log")
    return sorted(found.values(), key=lambda x: x["name"].lower())


def write_rows(path: Path, rows: list[dict]) -> None:
    if not rows:
        return
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)


def discover(source: Path) -> list[Path]:
    if not source.exists():
        return []
    items = []
    for p in source.iterdir() if source.is_dir() else [source]:
        if p.name.startswith("."):
            continue
        if p.is_dir():
            items.append(p)
            continue
        suf = "".join(p.suffixes).lower()
        if suf.endswith((".zip", ".tar", ".tar.gz", ".tgz", ".tar.bz2")):
            items.append(p)
    return items


CASE_SCHEMA = """
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS collections (
  id TEXT PRIMARY KEY, host TEXT NOT NULL, kind TEXT NOT NULL, archive TEXT,
  report_json TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS fleet_users (
  name TEXT PRIMARY KEY, hosts TEXT, sources TEXT, privileged INTEGER
);
"""


def open_case_db(db_path: Path) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_path))
    conn.executescript(CASE_SCHEMA)
    conn.execute("INSERT OR REPLACE INTO meta(key,value) VALUES('version',?)", (SCRIPT_VERSION,))
    conn.commit()
    return conn


def process_one(item: Path, unzip_root: Path, out_root: Path) -> dict:
    name = item.stem if item.is_file() else item.name
    if name.endswith(".tar"):
        name = Path(name).stem
    extract = unzip_root / name
    if item.is_file():
        if not extract_archive(item, extract):
            return {"collection": name, "status": "extract_failed", "host": name, "kind": "unknown", "users": [], "archive": item.name}
    else:
        extract = item
    kind = classify(extract, item.name)
    host = resolve_host(extract, item.name)
    dest = out_root / host
    dest.mkdir(parents=True, exist_ok=True)
    plan = plan_stages(kind)
    report: dict = {
        "script_version": SCRIPT_VERSION, "host": host, "kind": kind, "archive": item.name,
        "source": str(item), "extract": str(extract), "results": str(dest),
        "completed_at": utc_now(), "plan": plan, "users": [], "user_count": 0,
        "conn_rows": 0, "sys_rows": 0, "history_rows": 0, "esxi_hits": 0, "linux_hits": 0,
    }
    extra: list[str] = []
    if plan["synology_sqlite"] == "run":
        c, s = dump_synology_csv(extract, dest)
        report["conn_rows"], report["sys_rows"] = c, s
    if plan["esxi_logs"] == "run":
        hits = parse_esxi(extract)
        report["esxi_hits"] = len(hits)
        write_rows(dest / "esxi_signals.csv", hits)
    if plan["linux_common"] == "run":
        hist = parse_history(extract, host)
        report["history_rows"] = len(hist)
        write_rows(dest / "shell_history.csv", hist)
        extra.extend(h["user"] for h in hist)
    if plan["linux_logs"] == "run":
        linux = parse_linux_logs(extract)
        report["linux_hits"] = len(linux)
        write_rows(dest / "linux_ir_signals.csv", linux)
        extra.extend(h.get("user", "") for h in linux)
    users = collect_users(extract, extra)
    report["users"] = users
    report["user_count"] = len(users)
    (dest / STAGE_MARKER).write_text(json.dumps(report, indent=2), encoding="utf-8")
    return report


def main() -> int:
    p = argparse.ArgumentParser(description=f"CGL {SCRIPT_VERSION} — Collection Grind Ledger")
    p.add_argument("--config", default=None)
    p.add_argument("--source", default=None)
    p.add_argument("--unzip", default=None)
    p.add_argument("--out", default=None)
    p.add_argument("--db", default=None)
    p.add_argument("--analyst", default=None)
    p.add_argument("--non-interactive", "-ni", action="store_true", default=True)
    args = p.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")
    source, unzip, out, db, analyst = resolve_roots(args)
    logging.info("CGL mill host=%s collections=%s extract=%s results=%s db=%s", os.name, source, unzip, out, db)
    unzip.mkdir(parents=True, exist_ok=True)
    out.mkdir(parents=True, exist_ok=True)
    lock = acquire_lock(out)
    if lock is None:
        print(json.dumps({"version": SCRIPT_VERSION, "status": "ignored", "reason": "IgnoreNew"}))
        return 0
    try:
        items = discover(source)
        logging.info("unattended: %s collections (auto-select stages)", len(items))
        summaries = [process_one(item, unzip, out) for item in items]
        (out / "case_index.json").write_text(json.dumps(summaries, indent=2), encoding="utf-8")
        fleet: dict[str, dict] = {}
        for s in summaries:
            for u in s.get("users") or []:
                key = str(u.get("name", "")).lower()
                if not key:
                    continue
                cur = fleet.setdefault(key, {"name": u["name"], "hosts": [], "privileged": False, "sources": []})
                if s.get("host") and s["host"] not in cur["hosts"]:
                    cur["hosts"].append(s["host"])
                cur["privileged"] = cur["privileged"] or bool(u.get("privileged"))
                for src in u.get("sources") or []:
                    if src not in cur["sources"]:
                        cur["sources"].append(src)
        def csv_cell(v) -> str:
            s = "" if v is None else str(v)
            if any(c in s for c in ',"\r\n'):
                return '"' + s.replace('"', '""') + '"'
            return s
        def write_csv(path: Path, headers: list[str], rows: list[list]) -> None:
            lines = [",".join(csv_cell(h) for h in headers)]
            for row in rows:
                lines.append(",".join(csv_cell(c) for c in row))
            path.write_text("\ufeff" + "\r\n".join(lines) + "\r\n", encoding="utf-8")
        write_csv(out / "assets.csv", ["hostname", "kind", "user_count", "archive"],
                  [[s.get("host", ""), s.get("kind", ""), s.get("user_count", 0), s.get("archive", "")] for s in summaries])
        write_csv(out / "users.csv", ["user", "hosts", "host_count", "privileged", "sources"],
                  [[u["name"], "; ".join(u["hosts"]), len(u["hosts"]), "yes" if u["privileged"] else "", "; ".join(u["sources"])]
                   for u in sorted(fleet.values(), key=lambda x: (-len(x["hosts"]), x["name"]))])
        conn = open_case_db(db)
        try:
            for s in summaries:
                conn.execute(
                    "INSERT OR REPLACE INTO collections(id,host,kind,archive,report_json,updated_at) VALUES(?,?,?,?,?,?)",
                    (s.get("host"), s.get("host"), s.get("kind"), s.get("archive"), json.dumps(s), utc_now()),
                )
            conn.commit()
        finally:
            conn.close()
        print(json.dumps({"version": SCRIPT_VERSION, "host_os": os.name, "collections": len(summaries),
                          "paths": {"source": str(source), "unzip": str(unzip), "out": str(out), "db": str(db)}}, indent=2))
        return 0
    finally:
        lock.unlink(missing_ok=True)


if __name__ == "__main__":
    raise SystemExit(main())
