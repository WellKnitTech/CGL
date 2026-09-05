export type ReviewStatus = "open" | "done" | "na";

export type ReviewEntry = {
  status: ReviewStatus;
  note: string;
  by: string;
  at: string;
};

export type ReviewMap = Record<string, ReviewEntry>;

const KEY = (db: string) => `ftp50.review::${db}`;

export function loadReview(dbPath: string): ReviewMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(KEY(dbPath));
    return raw ? (JSON.parse(raw) as ReviewMap) : {};
  } catch {
    return {};
  }
}

export function saveReview(dbPath: string, map: ReviewMap) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY(dbPath), JSON.stringify(map));
}
