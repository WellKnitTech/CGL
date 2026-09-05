# CGL — Copilot

This repository is **Collection Grind Ledger**, a DFIR mill (Velociraptor Windows + UAC Linux/macOS/Synology/ESXi) and analyst workbench.

Follow **AGENTS.md** at the repo root. Ignore `.grok/` (Grok sandbox metadata).

- Mill: `public/ftp_5_0.py` (Python 3 stdlib, Windows lab VMs)
- Engine: `src/lib/ftp/`
- UI: `src/components/workbench/`
- Tests: `npx tsx --test src/lib/ftp/pipeline.test.ts`

CSVOutput is parsed output. Extracted is the raw archive tree. Initials are 2 or 3 letters. No IAM.
