import { Clock, FileArchive, Play, SquareStack } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/workbench/data-table";
import { InventoryPanel } from "@/components/workbench/inventory-panel";
import { PathsPanel } from "@/components/workbench/paths-panel";
import { StageRail } from "@/components/workbench/stage-rail";
import { DEMO_CASES } from "@/lib/ftp/demo-cases";
import { buildFleet } from "@/lib/ftp/inventory";
import { kindLabel } from "@/lib/ftp/kind";
import { AssignPanel } from "@/components/workbench/assign-panel";
import { TeamPanel } from "@/components/workbench/team-panel";
import {
  appendAssign,
  appendCaseEvent,
  appendLead,
  appendRoster,
  caseStats,
  loadCase,
  mergeSweep,
  parseCaseFile,
  saveCase,
  type CaseFile,
} from "@/lib/ftp/case-db";
import {
  assignedHostnames,
  canChangeLead,
  channelName,
  foldAssignments,
  foldEvents,
  foldLead,
  foldRoster,
  livePresence,
  makeAssign,
  makeEvent,
  makeLead,
  makeRoster,
  mergeAssignLogs,
  mergeEventLogs,
  mergeLeadLogs,
  mergeRosterLogs,
  newSeatId,
  isSeatInitials,
  normalizeInitials,
  occupants,
  teamList,
  LEAD_REASONS,
  type AssignEvent,
  type LeadEvent,
  type LeadReason,
  type Presence,
  type ReviewEvent,
  type RosterEvent,
} from "@/lib/ftp/collab";
import { PresenceBar } from "@/components/workbench/presence-bar";
import { loadPaths, savePaths, parsedDiskPath, type MillPaths } from "@/lib/ftp/paths";
import { WorklistPanel } from "@/components/workbench/worklist-panel";
import { idleStages, peekKind, runPipeline } from "@/lib/ftp/pipeline";
import { loadReview, type ReviewMap } from "@/lib/ftp/review";
import type { ParsedArtifact, PipelineResult, StageId } from "@/lib/ftp/types";
import { loadUnattended, saveUnattended, type UnattendedConfig } from "@/lib/ftp/watch";
import { cn } from "@/lib/utils";

type Tab = "digest" | "conn" | "sys" | "hist" | "linux" | "esxi" | "files" | "win";
type Shell = "queue" | "worklist" | "team" | "inventory" | "mill";

const SHELL: { id: Shell; label: string }[] = [
  { id: "queue", label: "Queue" },
  { id: "worklist", label: "Worklist" },
  { id: "team", label: "Team" },
  { id: "inventory", label: "Inventory" },
  { id: "mill", label: "Mill" },
];

const TAB_LABEL: Record<Tab, string> = {
  digest: "Digest",
  conn: "Connections",
  sys: "System log",
  hist: "Shell history",
  linux: "Linux IR",
  esxi: "ESXi signals",
  files: "Tree",
  win: "Hayabusa",
};

export function Workbench() {
  const [activeId, setActiveId] = useState(DEMO_CASES[0].id);
  const [running, setRunning] = useState(false);
  const runningRef = useRef(false);
  const [stages, setStages] = useState(idleStages);
  const [results, setResults] = useState<Record<string, PipelineResult>>(() => loadCase(loadPaths()).collections ?? {});
  const [tab, setTab] = useState<Tab>("digest");
  const [shell, setShell] = useState<Shell>("queue");
  const [watch, setWatch] = useState<UnattendedConfig>(() => loadUnattended());
  const [notice, setNotice] = useState<string | null>(null);
  const [review, setReview] = useState<ReviewMap>(() => {
    const c = loadCase(loadPaths());
    return c.events?.length ? foldEvents(c.events) : loadReview(loadPaths().dbPath);
  });
  const [paths, setPaths] = useState<MillPaths>(() => loadPaths());
  const [caseFile, setCaseFile] = useState<CaseFile>(() => loadCase(loadPaths()));
  const [events, setEvents] = useState<ReviewEvent[]>(() => loadCase(loadPaths()).events ?? []);
  const [assigns, setAssigns] = useState<AssignEvent[]>(() => loadCase(loadPaths()).assigns ?? []);
  const [roster, setRoster] = useState<RosterEvent[]>(() => loadCase(loadPaths()).roster ?? []);
  const [leads, setLeads] = useState<LeadEvent[]>(() => loadCase(loadPaths()).lead ?? []);
  const [pin, setPin] = useState<string | null>(null);
  const [passTo, setPassTo] = useState("");
  const [coverReason, setCoverReason] = useState<LeadReason>("pto");
  const [witness, setWitness] = useState("");
  const [coverOpen, setCoverOpen] = useState(false);
  const [peers, setPeers] = useState<Presence[]>([]);
  const [lastLine, setLastLine] = useState<string | null>(null);
  const seatA = useMemo(() => newSeatId("a"), []);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const eventsRef = useRef(events);
  eventsRef.current = events;
  const assignsRef = useRef(assigns);
  assignsRef.current = assigns;
  const rosterRef = useRef(roster);
  rosterRef.current = roster;
  const leadsRef = useRef(leads);
  leadsRef.current = leads;
  const assignMap = useMemo(() => foldAssignments(assigns), [assigns]);
  const caseLead = useMemo(() => foldLead(leads), [leads]);
  const team = useMemo(
    () => teamList(foldRoster(roster), assignMap, caseLead || paths.analyst),
    [roster, assignMap, caseLead, paths.analyst],
  );

  const result = results[activeId] ?? null;
  const fleet = useMemo(() => {
    const hosts = Object.values(results).map((r) => r.asset);
    return hosts.length ? buildFleet(hosts) : null;
  }, [results]);
  const artifacts: ParsedArtifact[] = useMemo(() => Object.values(results).flatMap((r) => r.artifacts), [results]);

  function pileFor(who: string, seat = false) {
    const hosts = assignedHostnames(assignMap, who);
    if (hosts.size) return artifacts.filter((a) => hosts.has(a.host));
    if (!seat) return [];
    const leftover = new Set(DEMO_CASES.filter((c) => !assignMap[c.id]?.assignee).map((c) => c.title));
    if (!leftover.size) return artifacts;
    return artifacts.filter((a) => leftover.has(a.host));
  }

  const teamRows = team.map((initials) => {
    const pile = pileFor(initials, initials === normalizeInitials(paths.analyst));
    const open = pile.filter((a) => (review[a.id]?.status ?? "open") === "open").length;
    return {
      initials,
      hosts: Object.values(assignMap).filter((a) => a.assignee === initials).length,
      open,
      total: pile.length,
    };
  });

  const tabs = useMemo(() => {
    if (!result) return ["digest"] as Tab[];
    const t: Tab[] = ["digest", "files"];
    if (result.conn.length) t.splice(1, 0, "conn");
    if (result.sys.length) t.splice(t.includes("conn") ? 2 : 1, 0, "sys");
    if (result.history.length) t.push("hist");
    if (result.linux.length) t.push("linux");
    if (result.esxi.length) t.push("esxi");
    if (result.hayabusa.length) t.push("win");
    return t;
  }, [result]);

  const sweep = useCallback(
    async (reason: "manual" | "schedule") => {
      if (runningRef.current) {
        setNotice("IgnoreNew — a sweep is already running. This trigger was skipped.");
        setWatch((w) => {
          const next = { ...w, lastOutcome: "ignored" as const };
          saveUnattended(next);
          return next;
        });
        return;
      }
      runningRef.current = true;
      setRunning(true);
      setNotice(null);
      setShell("queue");
      const nextMap: Record<string, PipelineResult> = {};
      for (const cas of DEMO_CASES) {
        setActiveId(cas.id);
        setTab("digest");
        const next = idleStages();
        setStages({ ...next });
        const done = runPipeline(cas);
        const order = (Object.keys(done.stages) as StageId[]).filter((id) => done.stages[id] !== "skipped");
        for (const id of order) {
          next[id] = "running";
          setStages({ ...next });
          await wait(runningDelay());
          next[id] = done.stages[id];
          setStages({ ...next });
        }
        for (const id of Object.keys(done.stages) as StageId[]) next[id] = done.stages[id];
        setStages({ ...next });
        nextMap[cas.id] = done;
        setResults((prev) => ({ ...prev, [cas.id]: done }));
      }
      runningRef.current = false;
      setRunning(false);
      setActiveId(DEMO_CASES[0].id);
      setStages(nextMap[DEMO_CASES[0].id].stages);
      setCaseFile((prev) => {
        const next = mergeSweep(prev, nextMap, paths);
        saveCase(next);
        return next;
      });
      setWatch((w) => {
        const cfg = { ...w, lastSweepAt: new Date().toISOString(), lastOutcome: "ok" as const };
        saveUnattended(cfg);
        return cfg;
      });
      setNotice(
        reason === "schedule"
          ? `Unattended sweep finished (${DEMO_CASES.length} collections).`
          : `Ingest sweep finished. Wrote case DB ${paths.dbPath} (${DEMO_CASES.length} hosts).`,
      );
    },
    [paths],
  );

  useEffect(() => {
    if (!watch.enabled) return;
    const ms = Math.max(1, watch.minutes) * 60 * 1000;
    const id = window.setInterval(() => {
      void sweep("schedule");
    }, ms);
    return () => window.clearInterval(id);
  }, [watch.enabled, watch.minutes, sweep]);

  const selfPresence: Presence = {
    seatId: seatA,
    analyst: paths.analyst.trim() || "you",
    hostId: activeId,
    hostName: DEMO_CASES.find((c) => c.id === activeId)?.title ?? activeId,
    at: Date.now(),
  };

  useEffect(() => {
    const ch = new BroadcastChannel(channelName(paths.dbPath));
    channelRef.current = ch;
    const onMsg = (ev: MessageEvent) => {
      const data = ev.data as {
        type?: string;
        event?: ReviewEvent;
        events?: ReviewEvent[];
        assign?: AssignEvent;
        assigns?: AssignEvent[];
        roster?: RosterEvent[];
        rosterEvent?: RosterEvent;
        lead?: LeadEvent[];
        leadEvent?: LeadEvent;
        presence?: Presence;
        seatId?: string;
      };
      if (data.type === "event" && data.event) ingestEvent(data.event, false);
      if (data.type === "assign" && data.assign) ingestAssign(data.assign, false);
      if (data.type === "roster" && data.rosterEvent) ingestRoster(data.rosterEvent, false);
      if (data.type === "lead" && data.leadEvent) ingestLead(data.leadEvent, false);
      if (data.type === "events" && data.events) {
        setEvents((prev) => {
          const next = mergeEventLogs(prev, data.events ?? []);
          setReview(foldEvents(next));
          return next;
        });
      }
      if (data.type === "assigns" && data.assigns) setAssigns((prev) => mergeAssignLogs(prev, data.assigns ?? []));
      if (data.type === "rosters" && data.roster) setRoster((prev) => mergeRosterLogs(prev, data.roster ?? []));
      if (data.type === "leads" && data.lead) setLeads((prev) => mergeLeadLogs(prev, data.lead ?? []));
      if (data.type === "presence" && data.presence) {
        setPeers((prev) => livePresence([...prev.filter((p) => p.seatId !== data.presence!.seatId), data.presence!]));
      }
      if (data.type === "hello" && data.presence) {
        ch.postMessage({ type: "events", events: eventsRef.current });
        ch.postMessage({ type: "assigns", assigns: assignsRef.current });
        ch.postMessage({ type: "rosters", roster: rosterRef.current });
        ch.postMessage({ type: "leads", lead: leadsRef.current });
        ch.postMessage({ type: "presence", presence: { ...selfPresence, at: Date.now() } });
        setPeers((prev) => livePresence([...prev.filter((p) => p.seatId !== data.presence!.seatId), data.presence!]));
      }
      if (data.type === "bye" && data.seatId) setPeers((prev) => prev.filter((p) => p.seatId !== data.seatId));
    };
    ch.addEventListener("message", onMsg);
    ch.postMessage({ type: "hello", presence: { ...selfPresence, at: Date.now() } });
    const beat = window.setInterval(() => {
      ch.postMessage({ type: "presence", presence: { ...selfPresence, at: Date.now() } });
      setPeers((prev) => livePresence(prev));
    }, 4000);
    return () => {
      ch.postMessage({ type: "bye", seatId: seatA });
      ch.removeEventListener("message", onMsg);
      ch.close();
      channelRef.current = null;
      window.clearInterval(beat);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paths.dbPath, paths.analyst, activeId, seatA]);

  function ingestEvent(event: ReviewEvent, broadcast: boolean) {
    setEvents((prev) => {
      const next = mergeEventLogs(prev, [event]);
      setReview(foldEvents(next));
      setCaseFile((file) => {
        const saved = appendCaseEvent({ ...file, events: prev, review, paths }, event);
        saveCase(saved);
        return saved;
      });
      return next;
    });
    setLastLine(`${event.by} marked ${event.artifactId.split("::").pop()} ${event.status}`);
    if (broadcast) channelRef.current?.postMessage({ type: "event", event });
  }
  function ingestAssign(event: AssignEvent, broadcast: boolean) {
    setAssigns((prev) => {
      const next = mergeAssignLogs(prev, [event]);
      setCaseFile((file) => {
        const saved = appendAssign({ ...file, assigns: prev, paths }, event);
        saveCase(saved);
        return saved;
      });
      return next;
    });
    setLastLine(event.assignee ? `${event.by} assigned ${event.hostname} → ${event.assignee}` : `${event.by} unassigned ${event.hostname}`);
    if (broadcast) channelRef.current?.postMessage({ type: "assign", assign: event });
  }
  function applyAssign(collectionIds: string[], assignee: string) {
    for (const id of collectionIds) {
      const cas = DEMO_CASES.find((c) => c.id === id);
      ingestAssign(makeAssign(id, cas?.title ?? id, assignee, paths.analyst.trim() || "lead", seatA), true);
    }
  }
  function ingestRoster(event: RosterEvent, broadcast: boolean) {
    setRoster((prev) => {
      const next = mergeRosterLogs(prev, [event]);
      setCaseFile((file) => {
        const saved = appendRoster({ ...file, roster: prev, paths }, event);
        saveCase(saved);
        return saved;
      });
      return next;
    });
    setLastLine(`${event.by} ${event.action === "drop" ? "dropped" : "added"} ${event.initials}`);
    if (broadcast) channelRef.current?.postMessage({ type: "roster", rosterEvent: event });
  }
  function applyRoster(initials: string, action: "add" | "drop") {
    ingestRoster(makeRoster(initials, action, paths.analyst.trim() || "lead", seatA), true);
    if (action === "drop" && pin === initials.toUpperCase()) setPin(null);
  }
  function ingestLead(event: LeadEvent, broadcast: boolean) {
    setLeads((prev) => {
      const before = foldLead(prev);
      const next = mergeLeadLogs(prev, [event]);
      const after = foldLead(next);
      setCaseFile((file) => {
        const saved = appendLead({ ...file, lead: prev, paths }, event);
        saveCase(saved);
        return saved;
      });
      if (before && after === before && normalizeInitials(event.lead) !== after) {
        setLastLine(`Lead locked with ${before} — ${event.by} change ignored`);
      } else if (event.action === "takeover") {
        setLastLine(`${event.by} took lead from ${before || "—"} · ${event.reason || "cover"}${event.witness ? ` · witness ${event.witness}` : ""}`);
      } else if (!before && after) {
        setLastLine(`${event.by} claimed lead`);
      } else {
        setLastLine(`${event.by} passed lead → ${after}`);
      }
      return next;
    });
    if (broadcast) channelRef.current?.postMessage({ type: "lead", leadEvent: event });
  }
  function claimLead() {
    const who = normalizeInitials(paths.analyst);
    if (!isSeatInitials(who)) {
      setNotice("Set 2 or 3 letter initials first, then claim lead.");
      return;
    }
    if (foldLead(leads) && !canChangeLead(foldLead(leads), who)) {
      setNotice(`Lead is locked with ${foldLead(leads)}. Only they can pass it.`);
      return;
    }
    applyRoster(who, "add");
    ingestLead(makeLead("claim", who, who, seatA), true);
  }
  function passLead(to: string) {
    const who = normalizeInitials(paths.analyst);
    const next = normalizeInitials(to);
    const current = foldLead(leads);
    if (!who || !canChangeLead(current, who)) {
      setNotice(current ? `Lead is locked with ${current}.` : "Claim lead first.");
      return;
    }
    if (!next || !isSeatInitials(next)) {
      setNotice("Pass lead to 2 or 3 letter initials.");
      return;
    }
    applyRoster(next, "add");
    ingestLead(makeLead("handoff", next, who, seatA), true);
  }
  function takeoverLead() {
    const who = normalizeInitials(paths.analyst);
    const current = foldLead(leads);
    if (!isSeatInitials(who)) {
      setNotice("Set 2 or 3 letter initials first.");
      return;
    }
    if (!current) {
      claimLead();
      return;
    }
    if (who === current) {
      setNotice("You already hold lead.");
      return;
    }
    if (!coverReason) {
      setNotice("Pick why the current lead is out (PTO, sick, unreachable).");
      return;
    }
    const w = normalizeInitials(witness);
    if (w && (w === who || w === current)) {
      setNotice("Witness must be someone else on the team — not you or the outgoing lead.");
      return;
    }
    applyRoster(who, "add");
    ingestLead(makeLead("takeover", who, who, seatA, { reason: coverReason, witness: w }), true);
    setCoverOpen(false);
    setWitness("");
  }
  function applyMark(id: string, status: ReviewMap[string]["status"], by: string, seatId: string) {
    ingestEvent(makeEvent(id, status, by, seatId), true);
  }
  function onPaths(next: MillPaths) {
    saveCase({ ...caseFile, review, events, assigns, roster, lead: leads, paths, dbPath: paths.dbPath, analyst: paths.analyst });
    setPaths(next);
    savePaths(next);
    const loaded = loadCase(next);
    setCaseFile(loaded);
    setReview(loaded.events?.length ? foldEvents(loaded.events) : loaded.review);
    setEvents(loaded.events ?? []);
    setAssigns(loaded.assigns ?? []);
    setRoster(loaded.roster ?? []);
    setLeads(loaded.lead ?? []);
    if (Object.keys(loaded.collections).length) setResults(loaded.collections);
  }
  function saveCaseDownload() {
    const file: CaseFile = {
      ...caseFile,
      review,
      events,
      assigns,
      roster,
      lead: leads,
      collections: results,
      paths,
      dbPath: paths.dbPath,
      analyst: paths.analyst,
      updatedAt: new Date().toISOString(),
    };
    saveCase(file);
    setCaseFile(file);
    const blob = new Blob([JSON.stringify(file, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = (paths.dbPath.split(/[/\\]/).pop() || "ftp50.case.db").replace(/\.db$/i, "") + ".json";
    a.click();
    URL.revokeObjectURL(a.href);
    setNotice("Case saved. Share the JSON sidecar or mill SQLite with the next analyst.");
  }
  async function openCaseFile(file: File) {
    const text = await file.text();
    const parsed = parseCaseFile(text);
    if (!parsed) {
      setNotice("That file is not a CGL 5.0 case JSON.");
      return;
    }
    const nextPaths = { ...paths, ...parsed.paths, dbPath: parsed.dbPath || paths.dbPath };
    setPaths(nextPaths);
    savePaths(nextPaths);
    const merged: CaseFile = {
      ...parsed,
      events: mergeEventLogs(parsed.events ?? [], events),
      assigns: mergeAssignLogs(parsed.assigns ?? [], assigns),
      roster: mergeRosterLogs(parsed.roster ?? [], roster),
      lead: mergeLeadLogs(parsed.lead ?? [], leads),
      review: foldEvents(mergeEventLogs(parsed.events ?? [], events)),
      paths: nextPaths,
    };
    setCaseFile(merged);
    saveCase(merged);
    setEvents(merged.events);
    setAssigns(merged.assigns);
    setRoster(merged.roster ?? []);
    setLeads(merged.lead ?? []);
    setReview(merged.review);
    if (Object.keys(merged.collections).length) setResults(merged.collections);
    setNotice(`Opened case from ${file.name}.`);
  }

  const hint = caseStats({ ...caseFile, review, collections: results });
  const caseHint =
    hint.hosts > 0
      ? `Case DB ${paths.dbPath} · ${hint.hosts} hosts · ${hint.done}/${hint.artifacts} reviewed`
      : `Case DB ${paths.dbPath} — empty until you sweep or open a file.`;

  function toggleWatch() {
    setWatch((w) => {
      const enabling = !w.enabled;
      const next = { ...w, enabled: enabling };
      saveUnattended(next);
      if (enabling) queueMicrotask(() => void sweep("schedule"));
      return next;
    });
  }

  const me = normalizeInitials(paths.analyst);

  function setSeat(raw: string) {
    const next = { ...paths, analyst: raw.replace(/[^A-Za-z]/g, "").slice(0, 3) };
    setPaths(next);
    savePaths(next);
  }

  function claimSeat() {
    const who = normalizeInitials(paths.analyst);
    if (!isSeatInitials(who)) {
      setNotice("Initials are 2 letters, or 3 if someone else already has that pair.");
      return;
    }
    applyRoster(who, "add");
  }

  function takeHost(id: string) {
    const who = normalizeInitials(paths.analyst);
    if (!isSeatInitials(who)) {
      setNotice("Set 2 or 3 letter initials first — top right — then take a host.");
      return;
    }
    applyRoster(who, "add");
    applyAssign([id], who);
    setActiveId(id);
    setShell("worklist");
  }

  function takeByHost(hostname: string) {
    const cas = DEMO_CASES.find((c) => c.title === hostname);
    if (cas) takeHost(cas.id);
  }

  const assigneeByHost = useMemo(() => {
    const m: Record<string, string> = {};
    for (const a of Object.values(assignMap)) {
      if (a.hostname) m[a.hostname] = a.assignee;
    }
    return m;
  }, [assignMap]);

  const isLead = Boolean(me && caseLead && me === caseLead);

  function diskPathFor(a: ParsedArtifact) {
    return parsedDiskPath(paths.outputRoot, a.host, a.outFile);
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-[88rem] flex-col px-4 pb-16 pt-4 sm:px-6">
      <header className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[0.7rem] uppercase tracking-[0.18em] text-muted">Collection Grind Ledger · 5.0</p>
          <h1 className="mt-1 text-2xl font-medium tracking-tight text-fg sm:text-3xl">CGL</h1>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label htmlFor="seat-initials" className="block text-[0.65rem] uppercase tracking-wider text-subtle">
              Your initials (2–3)
            </label>
            <input
              id="seat-initials"
              value={paths.analyst}
              onChange={(e) => setSeat(e.target.value)}
              onBlur={claimSeat}
              placeholder="AAM"
              maxLength={3}
              className="mt-1 h-11 w-16 rounded-sm border border-border bg-bg px-3 font-mono text-sm uppercase text-fg"
            />
          </div>
          <div>
            <p className="text-[0.65rem] uppercase tracking-wider text-subtle">Case lead</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {caseLead ? (
                <>
                  <Badge variant="ok">{caseLead} · locked</Badge>
                  {me === caseLead ? (
                    <>
                      <input
                        id="pass-lead"
                        value={passTo}
                        onChange={(e) => setPassTo(e.target.value)}
                        placeholder="AAM"
                        maxLength={3}
                        className="h-11 w-16 rounded-sm border border-border bg-bg px-3 font-mono text-sm uppercase text-fg"
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={!isSeatInitials(passTo)}
                        onClick={() => {
                          passLead(passTo);
                          setPassTo("");
                        }}
                      >
                        Pass
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button type="button" size="sm" variant="ghost" onClick={() => setCoverOpen((o) => !o)}>
                        Lead is out
                      </Button>
                    </>
                  )}
                </>
              ) : (
                <Button type="button" size="sm" variant="outline" disabled={!isSeatInitials(me)} onClick={claimLead}>
                  Claim lead
                </Button>
              )}
            </div>
            {coverOpen && caseLead && me !== caseLead ? (
              <div className="mt-2 flex flex-wrap items-end gap-2 rounded-md border border-border bg-surface p-2">
                <div>
                  <label htmlFor="cover-reason" className="block text-[0.65rem] text-subtle">
                    Why {caseLead} is out
                  </label>
                  <select
                    id="cover-reason"
                    value={coverReason}
                    onChange={(e) => setCoverReason(e.target.value as LeadReason)}
                    className="mt-1 h-11 rounded-sm border border-border bg-bg px-2 text-sm"
                  >
                    {LEAD_REASONS.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="cover-witness" className="block text-[0.65rem] text-subtle">
                    Witness (optional)
                  </label>
                  <input
                    id="cover-witness"
                    value={witness}
                    onChange={(e) => setWitness(e.target.value)}
                    placeholder="AL"
                    maxLength={3}
                    className="mt-1 h-11 w-16 rounded-sm border border-border bg-bg px-2 font-mono text-sm uppercase"
                  />
                </div>
                <Button type="button" size="sm" onClick={takeoverLead} disabled={!isSeatInitials(me)}>
                  Take over as {me || "you"}
                </Button>
              </div>
            ) : null}
          </div>
          <Badge variant={watch.enabled ? "ok" : "default"}>{watch.enabled ? "watch armed" : "watch idle"}</Badge>
          <Button onClick={() => void sweep("manual")} disabled={running} size="sm">
            <Play className="size-4" />
            {running ? "Sweeping…" : "Sweep"}
          </Button>
        </div>
      </header>

      <nav className="sticky top-0 z-20 -mx-4 mb-6 border-b border-border bg-bg px-4 sm:-mx-6 sm:px-6">
        <div className="flex gap-1 overflow-x-auto py-2">
          {SHELL.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setShell(s.id)}
              className={cn(
                "min-h-11 shrink-0 rounded-sm px-3 text-sm",
                shell === s.id ? "bg-accent text-accent-foreground" : "text-muted hover:bg-surface-2 hover:text-fg",
              )}
            >
              {s.label}
              {s.id === "team" ? ` · ${team.length}` : ""}
            </button>
          ))}
        </div>
      </nav>

      {notice ? (
        <p className="mb-4 rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-fg">{notice}</p>
      ) : null}

      {shell === "mill" ? (
        <>
          <PathsPanel paths={paths} onChange={onPaths} caseHint={caseHint} onSaveCase={saveCaseDownload} onOpenCase={(f) => void openCaseFile(f)} />
          <section className="mb-6 rounded-lg border border-border bg-surface p-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-start gap-3">
                <Clock className="mt-0.5 size-4 text-accent" />
                <div>
                  <p className="text-sm font-medium">Unattended watch</p>
                  <p className="mt-1 max-w-lg text-xs text-muted">
                    Lab equivalent of Task Scheduler: every {watch.minutes} min, auto-select stages, skip if a run is live (IgnoreNew).
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="default">IgnoreNew</Badge>
                <Button variant={watch.enabled ? "outline" : "default"} size="sm" onClick={toggleWatch}>
                  {watch.enabled ? "Disarm watch" : "Arm unattended"}
                </Button>
              </div>
            </div>
            <p className="mt-3 font-mono text-[0.7rem] text-subtle">
              Last sweep: {watch.lastSweepAt ? new Date(watch.lastSweepAt).toLocaleString() : "never"}
              {watch.lastOutcome ? ` · ${watch.lastOutcome}` : ""}
            </p>
          </section>
          <div className="flex flex-wrap gap-2">
            <a href="/ftp_5_0.py" download className="inline-flex h-11 items-center justify-center rounded-sm border border-border px-4 text-sm text-muted hover:bg-surface-2 hover:text-fg">
              Download ftp_5_0.py
            </a>
            <a href="/cgl.cmd" download className="inline-flex h-11 items-center justify-center rounded-sm border border-border px-4 text-sm text-muted hover:bg-surface-2 hover:text-fg">
              Download cgl.cmd
            </a>
            <a href="/cgl.ps1" download className="inline-flex h-11 items-center justify-center rounded-sm border border-border px-4 text-sm text-muted hover:bg-surface-2 hover:text-fg">
              Download cgl.ps1
            </a>
            <a href="/cgl-open.ps1" download className="inline-flex h-11 items-center justify-center rounded-sm border border-border px-4 text-sm text-muted hover:bg-surface-2 hover:text-fg">
              Download cgl-open.ps1
            </a>
          </div>
        </>
      ) : null}

      {shell === "team" ? (
        <>
          <PresenceBar self={selfPresence} peers={peers} lastLine={lastLine} teamSize={team.length} />
          <TeamPanel
            team={team}
            rows={teamRows}
            lead={normalizeInitials(paths.analyst)}
            self={normalizeInitials(paths.analyst)}
            peers={peers}
            pin={pin}
            onAdd={(who) => applyRoster(who, "add")}
            onDrop={(who) => applyRoster(who, "drop")}
            onPin={(who) => {
              setPin(who);
              if (who) setShell("worklist");
            }}
          />
          <AssignPanel
            collections={DEMO_CASES.map((c) => ({ id: c.id, title: c.title, subtitle: c.subtitle }))}
            assigns={assigns}
            lead={me}
            roster={team}
            self={me}
            onAssign={applyAssign}
          />
        </>
      ) : null}

      {shell === "queue" ? (
        <>
          <section className="mb-6">
            <p className="mb-2 font-mono text-[0.65rem] uppercase tracking-wider text-subtle">Ingest queue</p>
            <div className="flex flex-wrap gap-2">
              {DEMO_CASES.map((c) => {
                const kind = results[c.id]?.kind ?? peekKind(c);
                const done = Boolean(results[c.id]);
                const here = occupants(peers, c.id);
                const names = [
                  ...(c.id === activeId && me ? [me] : []),
                  ...here.map((p) => p.analyst).filter((n) => n !== me),
                ];
                const owner = assignMap[c.id]?.assignee;
                return (
                  <div
                    key={c.id}
                    className={cn(
                      "flex min-h-11 items-stretch rounded-md border",
                      c.id === activeId ? "border-accent bg-surface-2" : "border-border bg-surface",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setActiveId(c.id);
                        if (results[c.id]) setStages(results[c.id].stages);
                      }}
                      className="min-w-0 flex-1 px-4 py-2 text-left"
                    >
                      <span className="block text-sm font-medium text-fg">{c.title}</span>
                      <span className="block font-mono text-[0.65rem] text-muted">
                        {kindLabel(kind)}
                        {owner ? ` · ${owner}` : " · open"}
                        {done ? " · parsed" : ""}
                        {names.length ? ` · ${names.join(", ")}` : ""}
                      </span>
                    </button>
                    {owner === me ? (
                      <span className="flex items-center px-3 font-mono text-[0.65rem] text-ok">yours</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => takeHost(c.id)}
                        className="shrink-0 px-3 text-xs text-muted hover:text-fg"
                      >
                        Take
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
          <StageRail stages={stages} />
          {result ? (
            <div id="case-result" className="mt-8 scroll-mt-6 space-y-6">
              <DigestHeader result={result} />
              <div className="flex gap-1 overflow-x-auto pb-1">
                {tabs.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTab(t)}
                    className={cn(
                      "min-h-11 shrink-0 rounded-sm px-3 text-sm",
                      tab === t ? "bg-accent text-accent-foreground" : "text-muted hover:bg-surface-2 hover:text-fg",
                    )}
                  >
                    {TAB_LABEL[t]}
                  </button>
                ))}
              </div>
              {tab === "digest" && <DigestBody result={result} />}
              {tab === "conn" && (
                <DataTable
                  empty="No .SYNOCONNDB rows."
                  columns={[
                    { key: "tsUtc", label: "UTC" },
                    { key: "ip", label: "IP" },
                    { key: "protocol", label: "Proto" },
                    { key: "user", label: "User" },
                    { key: "msg", label: "Message" },
                  ]}
                  rows={result.conn.map((r) => ({ tsUtc: r.tsUtc, ip: r.ip, protocol: r.protocol, user: r.user, msg: r.msg }))}
                />
              )}
              {tab === "sys" && (
                <DataTable
                  empty="No .SYNOSYSDB rows."
                  columns={[
                    { key: "tsUtc", label: "UTC" },
                    { key: "username", label: "User" },
                    { key: "msg", label: "Message" },
                  ]}
                  rows={result.sys.map((r) => ({ tsUtc: r.tsUtc, username: r.username, msg: r.msg }))}
                />
              )}
              {tab === "hist" && (
                <DataTable
                  empty="No shell history."
                  columns={[
                    { key: "user", label: "User" },
                    { key: "shell", label: "Shell" },
                    { key: "command", label: "Command" },
                  ]}
                  rows={result.history.map((r) => ({ user: r.user, shell: r.shell, command: r.command }))}
                />
              )}
              {tab === "linux" && (
                <DataTable
                  empty="No IR hits."
                  columns={[
                    { key: "severity", label: "Sev" },
                    { key: "rule", label: "Rule" },
                    { key: "user", label: "User" },
                    { key: "ip", label: "IP" },
                    { key: "excerpt", label: "Excerpt" },
                  ]}
                  rows={result.linux.map((r) => ({ severity: r.severity, rule: r.rule, user: r.user, ip: r.ip, excerpt: r.excerpt }))}
                />
              )}
              {tab === "esxi" && (
                <DataTable
                  empty="No ESXi hits."
                  columns={[
                    { key: "rule", label: "Rule" },
                    { key: "log", label: "Log" },
                    { key: "excerpt", label: "Excerpt" },
                  ]}
                  rows={result.esxi.map((r) => ({ rule: r.rule, log: r.log, excerpt: r.excerpt }))}
                />
              )}
              {tab === "win" && (
                <DataTable
                  empty="Hayabusa skipped — not Windows."
                  columns={[
                    { key: "level", label: "Level" },
                    { key: "count", label: "n" },
                    { key: "rule", label: "Rule" },
                    { key: "technique", label: "ATT&CK" },
                  ]}
                  rows={result.hayabusa.map((r) => ({ level: r.level, count: r.count, rule: r.rule, technique: r.technique }))}
                />
              )}
              {tab === "files" && (
                <DataTable
                  empty="Empty tree."
                  columns={[
                    { key: "path", label: "Path" },
                    { key: "bytes", label: "Bytes" },
                  ]}
                  rows={result.files.map((f) => ({ path: f.path, bytes: f.bytes }))}
                />
              )}
            </div>
          ) : (
            <EmptyHint />
          )}
        </>
      ) : null}

      {shell === "worklist" ? (
        artifacts.length ? (
          <div className={cn(pin && !isLead && "grid gap-4 lg:grid-cols-2")}>
            <WorklistPanel
              artifacts={isLead ? artifacts : pileFor(me, true)}
              review={review}
              analyst={me}
              title={isLead ? `Lead board · all hosts` : `${me || "you"} · your pile`}
              onMark={(id, status) => applyMark(id, status, me, seatA)}
              assigneeByHost={assigneeByHost}
              onTakeHost={takeByHost}
              diskPath={diskPathFor}
            />
            {pin && !isLead ? (
              <WorklistPanel
                artifacts={pileFor(pin, false)}
                review={review}
                analyst={me}
                title={`${pin} · pinned`}
                onMark={(id, status) => applyMark(id, status, me, seatA)}
                assigneeByHost={assigneeByHost}
                onTakeHost={takeByHost}
                diskPath={diskPathFor}
              />
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-muted">Sweep ingest first, then check off your pile here.</p>
        )
      ) : null}

      {shell === "inventory" ? (
        fleet ? (
          <InventoryPanel fleet={fleet} />
        ) : (
          <p className="text-sm text-muted">Sweep ingest to build the fleet inventory.</p>
        )
      ) : null}
    </div>
  );
}

function DigestHeader({ result }: { result: PipelineResult }) {
  const d = result.digest;
  return (
    <div className="rounded-lg border border-border bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-medium tracking-tight">{d.host}</h2>
          <p className="mt-1 font-mono text-xs text-muted">{d.osHint}</p>
        </div>
        <Badge variant="kind">{kindLabel(d.kind)}</Badge>
      </div>
      <p className="mt-3 text-sm text-muted">{result.decision}</p>
      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="First event" value={d.firstEvent} />
        <Stat label="Last event" value={d.lastEvent} />
        <Stat label="Linux IR hits" value={String(d.linuxHits)} />
        <Stat label="Hits / history" value={String(d.esxiHits || d.historyLines)} />
      </dl>
    </div>
  );
}

function DigestBody({ result }: { result: PipelineResult }) {
  const d = result.digest;
  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <div className="space-y-3 lg:col-span-3">
        {d.narrative.map((n) => (
          <p key={n} className="rounded-md border border-border bg-surface px-4 py-3 text-sm leading-relaxed">
            {n}
          </p>
        ))}
        {d.flags.map((f) => (
          <p key={f.code} className="rounded-md border border-border bg-surface px-4 py-3 text-sm">
            <Badge variant={f.severity === "gap" ? "gap" : f.severity === "warn" ? "warn" : "ok"} className="mr-2">
              {f.severity}
            </Badge>
            {f.message}
          </p>
        ))}
      </div>
      <aside className="space-y-4 lg:col-span-2">
        <ChipList title="Top source IPs" items={d.topIps.map((x) => `${x.ip}  ×${x.n}`)} />
        <ChipList title="Top users" items={d.topUsers.map((x) => `${x.user}  ×${x.n}`)} />
      </aside>
    </div>
  );
}

function ChipList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-md border border-border bg-surface p-4">
      <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-wider text-muted">
        <SquareStack className="size-3.5" />
        {title}
      </div>
      {items.length ? (
        <ul className="space-y-1 font-mono text-xs">
          {items.map((it) => (
            <li key={it}>{it}</li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-subtle">None</p>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[0.65rem] uppercase tracking-wider text-subtle">{label}</dt>
      <dd className="mt-0.5 font-mono text-sm tabular">{value}</dd>
    </div>
  );
}

function EmptyHint() {
  return (
    <div className="mt-10 flex flex-col items-start gap-3 rounded-lg border border-dashed border-border px-5 py-10">
      <FileArchive className="size-6 text-muted" />
      <p className="max-w-md text-sm text-muted">
        Sweep the ingest in this preview, or drop ftp_5_0.py + cgl.cmd on a Windows lab VM and point it at E:\data_ingest.
        Linux/ESXi/Synology collections are parsed on Windows — Hayabusa only runs on Velociraptor drops.
      </p>
    </div>
  );
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function runningDelay() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 70;
}
