export type UnattendedConfig = {
  enabled: boolean;
  minutes: number;
  lastSweepAt: string | null;
  lastOutcome: "ok" | "ignored" | null;
};

const KEY = "ftp50.watch";

export function loadUnattended(): UnattendedConfig {
  if (typeof window === "undefined") return { enabled: false, minutes: 30, lastSweepAt: null, lastOutcome: null };
  try {
    const raw = localStorage.getItem(KEY);
    return raw
      ? { enabled: false, minutes: 30, lastSweepAt: null, lastOutcome: null, ...JSON.parse(raw) }
      : { enabled: false, minutes: 30, lastSweepAt: null, lastOutcome: null };
  } catch {
    return { enabled: false, minutes: 30, lastSweepAt: null, lastOutcome: null };
  }
}

export function saveUnattended(c: UnattendedConfig) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(c));
}
