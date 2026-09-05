# CGL — Collection Grind Ledger

Instructions for **any coding agent** (Claude, Cursor, Copilot, Codex, Gemini, Grok, Aider, etc.) working in this repository.

This is a **DFIR mill + analyst workbench**, not a Grok App Builder toy. Ignore `.grok/` (sandbox metadata). Product code lives in `public/ftp_5_0.py` and `src/lib/ftp/` + `src/components/workbench/`.

## What it is

Unattended parser for:

- Velociraptor **Windows** collections (Hayabusa / RECmd / JSON→CSV)
- **UAC** trees: Linux, macOS, generic Unix, Synology NAS, ESXi

The mill **runs on Windows lab VMs** (`py -3`, `cgl.cmd`). Collections may be Linux. Hayabusa **never** runs on UAC.

## Paths (do not mix these)

| Path | Role |
|---|---|
| Collections (`source`) | Incoming archives |
| Extracted (`unzip`) | Raw unpacked collection tree |
| CSVOutput (`out`) | Parsed artifacts analysts review (`<host>\SYNOCONNDB.csv`, `linux_ir_signals.csv`, `shell_history.csv`, …) |
| Case DB | Shared SQLite + JSON sidecar (worklist, inventory, assignments, lead) |

Worklist links open **CSVOutput**, not Extracted.

## Layout

```
public/ftp_5_0.py          Windows mill (Python 3 stdlib only — no pip)
public/cgl.cmd / cgl.ps1   Lab launchers; -RegisterTask, -RegisterProtocol
public/cgl-open.ps1        cgl: protocol → Explorer on a parsed file
src/lib/ftp/               Engine + collab (classify, plan, parse, inventory, case DB)
src/components/workbench/  Tabbed UI (Queue / Worklist / Team / Inventory / Mill)
src/lib/ftp/pipeline.test.ts
```

## Commands

```bash
npm install
npx tsx --test src/lib/ftp/pipeline.test.ts   # mill + collab tests (required)
npx tsc --noEmit
python3 -m py_compile public/ftp_5_0.py       # mill syntax
npm run dev                                   # workbench (if the Vite app is present)
```

Windows mill:

```bat
py -3 ftp_5_0.py --source E:\data_ingest --unzip E:\Results\Extracted --out E:\Results\CSVOutput --db E:\Results\ftp50.case.db --analyst AA --non-interactive
```

## Hard rules

1. **Windows Velociraptor = v4.9 mill.** `public/ftp_windows.py` is the Forensic Triage Parser 4.9 feature set (7-Zip/zipfile extract, JSON→CSV with workers, RECmd + Kroll SHA256 allow-list, Hayabusa v4 `dfir-timeline` individual+bulk, markers, scheduled task, inventory hashes). `ftp_5_0.py` classifies; `velo_windows` collections are handed to that pipeline. UAC kinds never get Hayabusa/RECmd.
2. **Python mill: stdlib required.** `tqdm` / `orjson` / `ijson` are optional (`public/requirements.txt`) for faster JSON→CSV. Keep Windows-safe PID lock, SQLite URI, sanitized extract on the 5.0 path.
3. **Synology:** hidden `.SYNOCONNDB` / `.SYNOSYSDB` (+ WAL) under `var/log/synolog`. Convert sqlite → CSV. Parse `.ash_history` in `/root`.
4. **Team:** initials only, **2 or 3 letters** (`AA` vs `AAM` when two people share a pair). No IAM. Case lead is locked; only the lead **Pass**es it; **Lead is out** is a logged takeover (PTO/sick/unreachable).
5. **Lead worklist** shows every host and assignee; analysts see their pile. Anyone can **Take** / assign-to-me.
6. **No personal identifiers** in fixtures or docs (no real analyst initials, no employer names). Demo cross-host user is `cbravo`.
7. Do not gold-plate. Match existing types in `src/lib/ftp/types.ts`. Append-only events (`review` / `assign` / `roster` / `lead`); last-write-wins by timestamp.

## Where to change what

| Ask | Touch |
|---|---|
| New log family / UAC kind | `src/lib/ftp/classify.ts`, `plan.ts`, `linux-logs.ts`, `public/ftp_5_0.py` |
| Worklist / lead / initials | `collab.ts`, `workbench.tsx`, `worklist-panel.tsx` |
| Paths / Explorer links / tool binaries | `paths.ts` (`parsedDiskPath` → CSVOutput). 7-Zip, RECmd, Hayabusa, Kroll are configurable; blank = auto-detect. |
| Demo collections | `demo-cases.ts` (keep fictional) |
| Tests | `src/lib/ftp/pipeline.test.ts` — add a case, don’t delete the mill suite |

## PR bar

- `npx tsx --test src/lib/ftp/pipeline.test.ts` passes
- `python3 -m py_compile public/ftp_5_0.py` if you edited the mill
- No secrets, no case data, no `node_modules`, no `.vercel/output`
