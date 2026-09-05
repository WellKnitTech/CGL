import { FolderOpen } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { millCommand, millTaskCommand, pathWarnings, pathsConfig, type MillPaths } from "@/lib/ftp/paths";

function Field({
  id,
  label,
  hint,
  value,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="block text-sm font-medium text-fg">
        {label}
      </label>
      <p className="mt-0.5 text-xs text-muted">{hint}</p>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        autoComplete="off"
        className="mt-2 h-11 w-full rounded-sm border border-border bg-bg px-3 font-mono text-sm text-fg outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
    </div>
  );
}

export function PathsPanel({
  paths,
  onChange,
  caseHint,
  onSaveCase,
  onOpenCase,
}: {
  paths: MillPaths;
  onChange: (next: MillPaths) => void;
  caseHint?: string;
  onSaveCase: () => void;
  onOpenCase: (file: File) => void;
}) {
  const warns = pathWarnings(paths);
  const cmd = millCommand(paths);
  const task = millTaskCommand(paths);

  function downloadConfig() {
    const blob = new Blob([JSON.stringify(pathsConfig(paths), null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "ftp50.json";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* ignore */
    }
  }

  return (
    <section className="mb-6 rounded-lg border border-border bg-surface p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <FolderOpen className="mt-0.5 size-4 text-accent" />
          <div>
            <p className="text-sm font-medium">Mill paths — Windows lab VM</p>
            <p className="mt-1 max-w-xl text-xs text-muted">
              The mill is Python 3 stdlib. Run it with <span className="font-mono">py -3</span> or{" "}
              <span className="font-mono">cgl.cmd</span> on the IR workstation. Collections can be
              Linux/ESXi/Synology — the mill host is Windows.
            </p>
          </div>
        </div>
        {warns.length ? <Badge variant="warn">{warns.length} path warning</Badge> : <Badge variant="ok">separated</Badge>}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Field id="path-source" label="Collections" hint="Incoming UAC / Velociraptor archives" value={paths.sourceRoot} onChange={(sourceRoot) => onChange({ ...paths, sourceRoot })} />
        <Field id="path-unzip" label="Extract to" hint="Unpacked trees (dotfiles preserved)" value={paths.unzipRoot} onChange={(unzipRoot) => onChange({ ...paths, unzipRoot })} />
        <Field id="path-out" label="Results" hint="CSV, digest, inventory per host" value={paths.outputRoot} onChange={(outputRoot) => onChange({ ...paths, outputRoot })} />
        <Field id="path-db" label="Case database" hint="Shared SQLite on the lab share" value={paths.dbPath} onChange={(dbPath) => onChange({ ...paths, dbPath })} />
        <Field id="path-analyst" label="Analyst" hint="2 letters, or 3 if two people share a pair" value={paths.analyst} onChange={(analyst) => onChange({ ...paths, analyst: analyst.replace(/[^A-Za-z]/g, "").slice(0, 3) })} />
      </div>

      <p className="mt-6 text-xs font-medium uppercase tracking-wider text-subtle">Windows tools — leave blank to auto-detect</p>
      <div className="mt-3 grid gap-4 md:grid-cols-2">
        <Field id="path-7z" label="7-Zip" hint="7z.exe — zip extract. Blank = Program Files / PATH" value={paths.sevenzipExe ?? ""} onChange={(sevenzipExe) => onChange({ ...paths, sevenzipExe })} />
        <Field id="path-recmd" label="RECmd" hint="RECmd.exe — registry. Blank = ZimmermanTools / EZ Tools" value={paths.recmdExe ?? ""} onChange={(recmdExe) => onChange({ ...paths, recmdExe })} />
        <Field id="path-haya" label="Hayabusa folder or exe" hint="Picks latest hayabusa*.exe in the folder" value={paths.hayabusaDir ?? ""} onChange={(hayabusaDir) => onChange({ ...paths, hayabusaDir })} />
        <Field id="path-haya-out" label="Hayabusa output" hint="Blank = Results\_hayabusa, then copied per host" value={paths.hayabusaOut ?? ""} onChange={(hayabusaOut) => onChange({ ...paths, hayabusaOut })} />
        <Field id="path-kroll" label="Kroll_Batch.reb" hint="RECmd batch. Blank = KAPE Modules path, then GitHub if allowed" value={paths.krollBatch ?? ""} onChange={(krollBatch) => onChange({ ...paths, krollBatch })} />
      </div>

      {warns.length ? (
        <ul className="mt-3 space-y-1 text-xs text-warn">
          {warns.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      ) : null}
      {caseHint ? <p className="mt-3 font-mono text-[0.7rem] text-subtle">{caseHint}</p> : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onSaveCase}>
          Save case DB
        </Button>
        <label className="inline-flex h-9 cursor-pointer items-center rounded-xs border border-border px-3 text-xs font-medium text-fg hover:bg-surface-2">
          Open case DB
          <input
            type="file"
            accept=".json,.db,.sqlite"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onOpenCase(f);
              e.target.value = "";
            }}
          />
        </label>
        <Button type="button" variant="outline" size="sm" onClick={() => void copy(cmd)}>
          Copy mill command
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => void copy(task)}>
          Copy schtasks
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={downloadConfig}>
          Download ftp50.json
        </Button>
      </div>
      <pre className="mt-3 overflow-x-auto rounded-md border border-border bg-bg px-3 py-2 font-mono text-[0.7rem] text-muted">
        {cmd}
      </pre>
      <p className="mt-2 font-mono text-[0.65rem] text-subtle">{task}</p>
    </section>
  );
}
