# Contributing to CGL

1. Read [AGENTS.md](../AGENTS.md) (required for humans and coding agents).
2. Branch from `main`.
3. Keep mill changes in lockstep: `src/lib/ftp/*` and `public/ftp_5_0.py` when behavior is shared.
4. Run `npx tsx --test src/lib/ftp/pipeline.test.ts`.
5. Do not commit case data, `.env`, `node_modules`, or `.vercel/output`.
