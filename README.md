# CGL — Collection Grind Ledger

Unattended mill and workbench for Velociraptor **Windows** collections and **UAC** trees (Linux, macOS, Unix, Synology, ESXi).

The mill **runs on Windows lab VMs** (`py -3` / `cgl.cmd`). Collections can be Linux. Hayabusa only runs on Velociraptor Windows drops.

**Coding agents:** read [AGENTS.md](./AGENTS.md) first. Ignore `.grok/` (Grok sandbox metadata, not product code).

## Paths

| Path | Role |
|---|---|
| Collections | Incoming archives (`E:\data_ingest`) |
| Extracted | Raw unpacked tree |
| CSVOutput | Parsed output analysts review (`E:\Results\CSVOutput\<host>\*.csv`) |
| Case DB | Shared SQLite + JSON sidecar (worklist, inventory, assignments) |

## Dev (Linux / macOS / Windows)

```bash
git clone https://github.com/WellKnitTech/CGL.git
cd CGL
npm install
npx tsx --test src/lib/ftp/pipeline.test.ts
python3 -m py_compile public/ftp_5_0.py
npm run dev
```

## Windows lab

```bat
py -3 ftp_5_0.py --source E:\data_ingest --unzip E:\Results\Extracted --out E:\Results\CSVOutput --db E:\Results\ftp50.case.db --analyst AA --non-interactive
```

Or drop `ftp_5_0.py`, `cgl.cmd`, and `ftp50.json` on the share and run `cgl.cmd`.

```powershell
powershell -File cgl.ps1 -RegisterTask        # 30-min IgnoreNew sweep
powershell -File cgl.ps1 -RegisterProtocol    # cgl: links open CSVOutput in Explorer
```

Python 3 stdlib only. No pip.

## Mill auto-selects stages

- Velociraptor Windows → JSON→CSV, RECmd, Hayabusa
- Synology UAC → `.SYNOCONNDB` / `.SYNOSYSDB` (+ WAL) → CSV, ash/bash history, Linux IR logs
- ESXi UAC → hostd / shell / vmkernel signals
- Linux / macOS / Unix UAC → auth, syslog, audit, nginx, history (including `.ash_history`)

## Team

Initials only (2 or 3 letters, e.g. `AA` / `AAM`) — no IAM. Case lead is locked until they **Pass** it. **Lead is out** is a logged takeover (PTO / sick / unreachable). Lead sees the full worklist; analysts see their pile. Worklist links open parsed files under CSVOutput.

## Workbench

React workbench in `src/` (demo collections + live mill command). Engine in `src/lib/ftp/`. Portable mill in `public/ftp_5_0.py`.

## License

MIT. See [LICENSE](./LICENSE).
