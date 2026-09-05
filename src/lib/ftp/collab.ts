import type { ReviewMap, ReviewStatus } from "./review";

export type ReviewEvent = {
  eventId: string;
  artifactId: string;
  status: ReviewStatus;
  note: string;
  by: string;
  seatId: string;
  at: string;
};

export type Presence = {
  seatId: string;
  analyst: string;
  hostId: string;
  hostName: string;
  at: number;
};

export type AssignEvent = {
  eventId: string;
  collectionId: string;
  hostname: string;
  assignee: string;
  by: string;
  seatId: string;
  at: string;
};

export type Assignment = {
  collectionId: string;
  hostname: string;
  assignee: string;
  by: string;
  at: string;
};

export type AssignMap = Record<string, Assignment>;

export type RosterEvent = {
  eventId: string;
  initials: string;
  action: "add" | "drop";
  by: string;
  seatId: string;
  at: string;
};

export type LeadAction = "claim" | "handoff" | "takeover";
export type LeadReason = "pto" | "sick" | "unreachable" | "other";

export const LEAD_REASONS: { id: LeadReason; label: string }[] = [
  { id: "pto", label: "PTO" },
  { id: "sick", label: "Out sick" },
  { id: "unreachable", label: "Unreachable" },
  { id: "other", label: "Other" },
];

export type LeadEvent = {
  eventId: string;
  action: LeadAction;
  lead: string;
  by: string;
  seatId: string;
  at: string;
  reason?: LeadReason | "";
  witness?: string;
};

const TTL_MS = 12_000;

export function newEventId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function newSeatId(slot = "a") {
  if (typeof sessionStorage === "undefined") return `seat-${slot}`;
  const key = `ftp50.seat.${slot}`;
  const existing = sessionStorage.getItem(key);
  if (existing) return existing;
  const id = `${slot}-${Math.random().toString(36).slice(2, 8)}`;
  sessionStorage.setItem(key, id);
  return id;
}

export function normalizeInitials(raw: string): string {
  return raw.trim().toUpperCase().slice(0, 8);
}

export function channelName(dbPath: string) {
  return `ftp50.live::${dbPath.trim().toLowerCase() || "default"}`;
}

export function makeEvent(artifactId: string, status: ReviewStatus, by: string, seatId: string): ReviewEvent {
  return {
    eventId: newEventId(),
    artifactId,
    status,
    note: "",
    by: normalizeInitials(by) || "A",
    seatId,
    at: new Date().toISOString(),
  };
}

export function foldEvents(events: ReviewEvent[]): ReviewMap {
  const sorted = [...events].sort((a, b) =>
    a.at === b.at ? a.eventId.localeCompare(b.eventId) : a.at.localeCompare(b.at),
  );
  const map: ReviewMap = {};
  for (const e of sorted) {
    map[e.artifactId] = { status: e.status, note: e.note, by: e.by, at: e.at };
  }
  return map;
}

export function mergeEventLogs(a: ReviewEvent[], b: ReviewEvent[]): ReviewEvent[] {
  const map = new Map<string, ReviewEvent>();
  for (const e of [...a, ...b]) map.set(e.eventId, e);
  return [...map.values()].sort((x, y) => (x.at === y.at ? x.eventId.localeCompare(y.eventId) : x.at.localeCompare(y.at)));
}

export function makeAssign(
  collectionId: string,
  hostname: string,
  assignee: string,
  by: string,
  seatId: string,
): AssignEvent {
  return {
    eventId: newEventId(),
    collectionId,
    hostname,
    assignee: normalizeInitials(assignee),
    by: normalizeInitials(by) || "lead",
    seatId,
    at: new Date().toISOString(),
  };
}

export function foldAssignments(events: AssignEvent[]): AssignMap {
  const sorted = [...events].sort((a, b) =>
    a.at === b.at ? a.eventId.localeCompare(b.eventId) : a.at.localeCompare(b.at),
  );
  const map: AssignMap = {};
  for (const e of sorted) {
    map[e.collectionId] = {
      collectionId: e.collectionId,
      hostname: e.hostname,
      assignee: e.assignee,
      by: e.by,
      at: e.at,
    };
  }
  return map;
}

export function mergeAssignLogs(a: AssignEvent[], b: AssignEvent[]): AssignEvent[] {
  const map = new Map<string, AssignEvent>();
  for (const e of [...a, ...b]) map.set(e.eventId, e);
  return [...map.values()].sort((x, y) => (x.at === y.at ? x.eventId.localeCompare(y.eventId) : x.at.localeCompare(y.at)));
}

export function assignedTo(map: AssignMap, initials: string): Assignment[] {
  const who = normalizeInitials(initials);
  return Object.values(map).filter((a) => a.assignee === who);
}

export function assignedHostnames(map: AssignMap, initials: string): Set<string> {
  return new Set(assignedTo(map, initials).map((a) => a.hostname));
}

export function makeRoster(initials: string, action: "add" | "drop", by: string, seatId: string): RosterEvent {
  return {
    eventId: newEventId(),
    initials: normalizeInitials(initials),
    action,
    by: normalizeInitials(by) || "lead",
    seatId,
    at: new Date().toISOString(),
  };
}

export function foldRoster(events: RosterEvent[]): string[] {
  const sorted = [...events].sort((a, b) =>
    a.at === b.at ? a.eventId.localeCompare(b.eventId) : a.at.localeCompare(b.at),
  );
  const live = new Set<string>();
  for (const e of sorted) {
    if (!e.initials) continue;
    if (e.action === "drop") live.delete(e.initials);
    else live.add(e.initials);
  }
  return [...live].sort();
}

export function mergeRosterLogs(a: RosterEvent[], b: RosterEvent[]): RosterEvent[] {
  const map = new Map<string, RosterEvent>();
  for (const e of [...a, ...b]) map.set(e.eventId, e);
  return [...map.values()].sort((x, y) => (x.at === y.at ? x.eventId.localeCompare(y.eventId) : x.at.localeCompare(y.at)));
}

export function makeLead(
  action: LeadAction,
  lead: string,
  by: string,
  seatId: string,
  extra?: { reason?: LeadReason | ""; witness?: string },
): LeadEvent {
  return {
    eventId: newEventId(),
    action,
    lead: normalizeInitials(lead),
    by: normalizeInitials(by),
    seatId,
    at: new Date().toISOString(),
    reason: extra?.reason || "",
    witness: extra?.witness ? normalizeInitials(extra.witness) : "",
  };
}

export function mergeLeadLogs(a: LeadEvent[], b: LeadEvent[]): LeadEvent[] {
  const map = new Map<string, LeadEvent>();
  for (const e of [...a, ...b]) map.set(e.eventId, e);
  return [...map.values()].sort((x, y) => (x.at === y.at ? x.eventId.localeCompare(y.eventId) : x.at.localeCompare(y.at)));
}

/** First claim sticks. Handoff only from current lead. Takeover needs a reason (PTO/sick/out). */
export function foldLead(events: LeadEvent[]): string {
  const sorted = [...events].sort((a, b) =>
    a.at === b.at ? a.eventId.localeCompare(b.eventId) : a.at.localeCompare(b.at),
  );
  let lead = "";
  for (const e of sorted) {
    const next = normalizeInitials(e.lead);
    const by = normalizeInitials(e.by);
    if (!next || !by) continue;
    if (!lead) {
      lead = next;
      continue;
    }
    if (e.action === "handoff" && by === lead) {
      lead = next;
      continue;
    }
    if (e.action === "takeover" && by !== lead && Boolean(e.reason)) {
      lead = next;
    }
  }
  return lead;
}

export function canChangeLead(current: string, by: string): boolean {
  const who = normalizeInitials(by);
  if (!who) return false;
  const cur = normalizeInitials(current);
  return !cur || cur === who;
}

export function teamList(roster: string[], map: AssignMap, lead: string): string[] {
  const set = new Set<string>(roster.map(normalizeInitials).filter(Boolean));
  const l = normalizeInitials(lead);
  if (l) set.add(l);
  for (const a of Object.values(map)) {
    if (a.assignee) set.add(a.assignee);
  }
  return [...set].sort();
}

export function livePresence(peers: Presence[]): Presence[] {
  const now = Date.now();
  const latest = new Map<string, Presence>();
  for (const p of peers) {
    if (now - p.at > TTL_MS) continue;
    const cur = latest.get(p.seatId);
    if (!cur || p.at >= cur.at) latest.set(p.seatId, p);
  }
  return [...latest.values()];
}

export function occupants(peers: Presence[], hostId: string): Presence[] {
  return livePresence(peers).filter((p) => p.hostId === hostId);
}
