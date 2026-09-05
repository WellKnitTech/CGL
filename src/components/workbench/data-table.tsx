import { cn } from "@/lib/utils";

export function DataTable({
  columns,
  rows,
  empty,
}: {
  columns: { key: string; label: string; className?: string }[];
  rows: Record<string, string | number>[];
  empty: string;
}) {
  if (!rows.length) {
    return (
      <p className="border border-dashed border-border px-4 py-10 text-center text-sm text-muted">
        {empty}
      </p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full min-w-[40rem] text-left text-sm">
        <thead className="bg-surface-2 text-[0.7rem] uppercase tracking-wider text-muted">
          <tr>
            {columns.map((c) => (
              <th key={c.key} className={cn("px-3 py-2 font-medium", c.className)}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-border odd:bg-surface">
              {columns.map((c) => (
                <td key={c.key} className={cn("px-3 py-2 align-top font-mono text-[0.75rem] text-fg", c.className)}>
                  {String(r[c.key] ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
