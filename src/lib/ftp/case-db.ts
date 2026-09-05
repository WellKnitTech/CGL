import {
  foldAssignments,
  foldEvents,
  mergeAssignLogs,
  mergeEventLogs,
  mergeLeadLogs,
  mergeRosterLogs,
  type AssignEvent,
  type AssignMap,
  type LeadEvent,
  type ReviewEvent,
  type RosterEvent,
} from "./collab";
import { caseStorageKey, type MillPaths } from "./paths";
import type { ReviewMap } from "./review";
import type { PipelineResult } from "./types";

export type CaseFile = {
  version: string;
  kind: "ftp50.case";
  dbPath: string;
  analyst: string;
  updatedAt: string;
  paths: MillPaths;
  collections: Record<string, PipelineResult>;
  review: ReviewMap;
  events: ReviewEvent[];
  assigns: AssignEvent[];
  roster: RosterEvent[];
  lead: LeadEvent[];
};

export function emptyCase(paths: MillPaths): CaseFile {
  return {
    version: "5.0.0",
    kind: "ftp50.case",
    dbPath: paths.dbPath,
    analyst: paths.analyst,
    updatedAt: new Date().toISOString(),
    paths,
    collections: {},
    review: {},
    events: [],
    assigns: [],
    roster: [],
    lead: [],
  };
}

export function loadCase(paths: MillPaths): CaseFile {
  if (typeof window === "undefined") return emptyCase(paths);
  try {
    const raw = localStorage.getItem(caseStorageKey(paths.dbPath));
    if (!raw) return emptyCase(paths);
    const parsed = JSON.parse(raw) as CaseFile;
    if (parsed.kind !== "ftp50.case") return emptyCase(paths);
    return {
      ...emptyCase(paths),
      ...parsed,
      events: parsed.events ?? [],
      assigns: parsed.assigns ?? [],
      roster: parsed.roster ?? [],
      lead: parsed.lead ?? [],
    };
  } catch {
    return emptyCase(paths);
  }
}

export function saveCase(file: CaseFile) {
  if (typeof window === "undefined") return;
  localStorage.setItem(caseStorageKey(file.dbPath), JSON.stringify(file));
}

export function parseCaseFile(text: string): CaseFile | null {
  try {
    const parsed = JSON.parse(text) as CaseFile;
    if (parsed.kind !== "ftp50.case") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function mergeSweep(
  file: CaseFile,
  collections: Record<string, PipelineResult>,
  paths: MillPaths,
): CaseFile {
  return {
    ...file,
    collections: { ...file.collections, ...collections },
    paths,
    dbPath: paths.dbPath,
    analyst: paths.analyst,
    updatedAt: new Date().toISOString(),
  };
}

export function appendCaseEvent(file: CaseFile, event: ReviewEvent): CaseFile {
  const events = mergeEventLogs(file.events ?? [], [event]);
  return { ...file, events, review: foldEvents(events), updatedAt: event.at };
}

export function appendAssign(file: CaseFile, event: AssignEvent): CaseFile {
  return { ...file, assigns: mergeAssignLogs(file.assigns ?? [], [event]), updatedAt: event.at };
}

export function appendRoster(file: CaseFile, event: RosterEvent): CaseFile {
  return { ...file, roster: mergeRosterLogs(file.roster ?? [], [event]), updatedAt: event.at };
}

export function appendLead(file: CaseFile, event: LeadEvent): CaseFile {
  return { ...file, lead: mergeLeadLogs(file.lead ?? [], [event]), updatedAt: event.at };
}

export function assignmentMap(file: CaseFile): AssignMap {
  return foldAssignments(file.assigns ?? []);
}

export function caseStats(file: CaseFile) {
  const artifacts = Object.values(file.collections).flatMap((c) => c.artifacts ?? []);
  const review = file.events?.length ? foldEvents(file.events) : file.review;
  const done = artifacts.filter((a) => review[a.id]?.status === "done" || review[a.id]?.status === "na").length;
  return {
    hosts: Object.keys(file.collections).length,
    artifacts: artifacts.length,
    done,
    analyst: file.analyst,
  };
}
