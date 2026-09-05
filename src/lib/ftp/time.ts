export function epochToUtc(epoch: number | null | undefined): string {
  if (epoch == null || !Number.isFinite(epoch) || epoch <= 0) return "";
  const ms = epoch > 1e12 ? epoch : epoch * 1000;
  try {
    return new Date(ms).toISOString().replace(".000Z", "Z");
  } catch {
    return "";
  }
}

export function minMaxIso(values: string[]): { first: string; last: string } {
  const clean = values.filter(Boolean).sort();
  if (!clean.length) return { first: "—", last: "—" };
  return { first: clean[0], last: clean[clean.length - 1] };
}

export function parseEsxiTs(line: string): string {
  const m = line.match(
    /^(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)/,
  );
  if (m) return m[1].replace(" ", "T");
  const m2 = line.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/);
  return m2 ? m2[1] : "";
}
