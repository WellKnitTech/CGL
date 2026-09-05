import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEMO_CASES } from "./demo-cases.ts";
import { inventoryCsv, toCsv } from "./csv.ts";
import { buildFleet } from "./inventory.ts";
import { planStages } from "./plan.ts";
import { millCommand, pathWarnings, pathsConfig, trimPaths, parsedDiskPath, folderOf, joinWin } from "./paths.ts";
import { foldAssignments, foldEvents, foldLead, foldRoster, isSeatInitials, makeAssign, makeEvent, makeLead, makeRoster, mergeEventLogs, normalizeInitials, teamList } from "./collab.ts";
import { runPipeline } from "./pipeline.ts";

describe("ftp 5.0 auto mill", () => {
  it("Synology auto-runs sqlite+history and skips Hayabusa", () => {
    const r = runPipeline(DEMO_CASES.find((c) => c.id === "nas-02")!);
    assert.equal(r.kind, "uac_synology");
    assert.equal(r.stages.hayabusa, "skipped");
    assert.equal(r.stages.json_csv, "skipped");
    assert.ok(r.conn.length);
    assert.ok(r.history.some((h) => h.shell === "ash"));
  });

  it("ESXi auto-runs log signals and skips RECmd", () => {
    const r = runPipeline(DEMO_CASES.find((c) => c.id === "esx-n3")!);
    assert.equal(r.kind, "uac_esxi");
    assert.equal(r.stages.recmd, "skipped");
    assert.ok(r.esxi.length);
  });

  it("Velociraptor auto-runs Windows mill and skips UAC stages", () => {
    const r = runPipeline(DEMO_CASES.find((c) => c.id === "win-184")!);
    assert.equal(r.kind, "velo_windows");
    assert.equal(r.stages.hayabusa, "success");
    assert.equal(r.stages.synology_sqlite, "skipped");
  });

  it("Linux auto-parses auth/audit/nginx and skips Hayabusa", () => {
    const r = runPipeline(DEMO_CASES.find((c) => c.id === "app-01")!);
    assert.equal(r.kind, "uac_linux");
    assert.equal(r.stages.hayabusa, "skipped");
    assert.ok(r.linux.length);
  });

  it("plan never enables Hayabusa on UAC", () => {
    assert.equal(planStages("uac_synology").hayabusa, "skip");
    assert.equal(planStages("uac_esxi").json_csv, "skip");
    assert.equal(planStages("velo_windows").synology_sqlite, "skip");
    assert.equal(planStages("uac_linux").linux_logs, "run");
  });

  it("fleet inventory tracks hostnames and cross-OS users", () => {
    const nas = runPipeline(DEMO_CASES.find((c) => c.id === "nas-02")!);
    const win = runPipeline(DEMO_CASES.find((c) => c.id === "win-184")!);
    const linux = runPipeline(DEMO_CASES.find((c) => c.id === "app-01")!);
    assert.equal(nas.host, "fileserver-02");
    assert.equal(win.host, "WKSTN-184");
    const fleet = buildFleet([nas.asset, win.asset, linux.asset]);
    const cbravo = fleet.users.find((u) => u.name === "cbravo");
    assert.ok(cbravo);
    assert.ok(cbravo!.hosts.includes("fileserver-02"));
    assert.ok(cbravo!.hosts.includes("WKSTN-184"));
    const csv = inventoryCsv(fleet);
    assert.ok(csv.hostsCsv.includes("fileserver-02"));
    assert.ok(csv.usersCsv.includes("cbravo"));
    assert.equal(toCsv(["a", "b"], [["x,y", 'he said "hi"']]), 'a,b\r\n"x,y","he said ""hi"""\r\n');
  });

  it("macOS and FreeBSD auto-run Unix logs, skip Hayabusa", () => {
    const mac = runPipeline(DEMO_CASES.find((c) => c.id === "mbp-12")!);
    assert.equal(mac.kind, "uac_macos");
    assert.equal(mac.stages.hayabusa, "skipped");
    const bsd = runPipeline(DEMO_CASES.find((c) => c.id === "fw-01")!);
    assert.equal(bsd.kind, "uac_unix");
  });

  it("path config builds mill command for Windows lab VMs", () => {
    const p = trimPaths({
      sourceRoot: "E:\\data_ingest",
      unzipRoot: "E:\\Results\\Extracted",
      outputRoot: "E:\\Results\\CSVOutput",
      dbPath: "E:\\Results\\ftp50.case.db",
      analyst: "AA",
    });
    assert.equal(pathWarnings(p).length, 0);
    const cmd = millCommand(p);
    assert.match(cmd, /^py -3 /);
    assert.match(cmd, /--source E:\\data_ingest/);
    assert.match(cmd, /--analyst AA/);
    assert.equal(pathsConfig(p).case_db, p.dbPath);
    const withTools = trimPaths({
      ...p,
      recmdExe: "C:\\tools\\ZimmermanTools\\net9\\RECmd\\RECmd.exe",
      hayabusaDir: "C:\\tools\\hayabusa",
      sevenzipExe: "C:\\Program Files\\7-Zip\\7z.exe",
      krollBatch: "C:\\Tools\\KAPE\\Modules\\bin\\RECmd\\BatchExamples\\Kroll_Batch.reb",
    });
    const cfg = pathsConfig(withTools);
    assert.equal(cfg.recmd_exe, withTools.recmdExe);
    assert.match(millCommand(withTools), /--recmd-exe /);
    assert.match(millCommand(withTools), /--7zip /);
    assert.equal(pathsConfig(p).recmd_exe, undefined);
    assert.equal(
      parsedDiskPath(p.outputRoot, "app-01", "linux_ir_signals.csv"),
      "E:\\Results\\CSVOutput\\app-01\\linux_ir_signals.csv",
    );
    const nas = runPipeline(DEMO_CASES.find((c) => c.id === "nas-02")!);
    assert.ok(nas.artifacts.some((a) => a.outFile === "SYNOCONNDB.csv"));
    assert.ok(nas.artifacts.some((a) => a.outFile === "shell_history.csv"));
    assert.equal(folderOf(joinWin("E:\\Results\\CSVOutput", "host", "shell_history.csv")), "E:\\Results\\CSVOutput\\host");
  });

  it("concurrent seats last-write-wins per artifact", () => {
    const a = makeEvent("h::auth.log", "done", "AA", "a");
    const b = makeEvent("h::syslog", "done", "AL", "b");
    const later = { ...makeEvent("h::auth.log", "open", "AL", "b"), at: "2099-01-01T00:00:00Z" };
    const folded = foldEvents(mergeEventLogs([a, b], [later]));
    assert.equal(folded["h::auth.log"].status, "open");
    assert.equal(folded["h::syslog"].status, "done");
  });

  it("assigns collections by initials and last write wins", () => {
    const a = makeAssign("app-01", "app-01", "AA", "AA", "a");
    const b = { ...makeAssign("app-01", "app-01", "AL", "AA", "a"), at: "2099-01-01T00:00:00Z" };
    const folded = foldAssignments([a, b]);
    assert.equal(folded["app-01"].assignee, "AL");
  });

  it("roster holds a dozen analysts", () => {
    const events = ["AA", "AL", "MK", "TS", "RB", "DN", "KP", "VH", "CJ", "EW", "NL", "SG"].map((n) =>
      makeRoster(n, "add", "AA", "a"),
    );
    assert.equal(foldRoster(events).length, 12);
    const drop = { ...makeRoster("SG", "drop", "AA", "a"), at: "2099-01-01T00:00:00Z" };
    const dropped = foldRoster([...events, drop]);
    assert.equal(dropped.length, 11);
    const map = foldAssignments([makeAssign("nas-02", "fileserver-02", "ZZ", "AA", "a")]);
    const team = teamList(dropped, map, "jw");
    assert.ok(team.includes("AA"));
    assert.ok(team.includes("ZZ"));
  });

  it("initials are 2 or 3 letters so duplicate pairs can split", () => {
    assert.equal(normalizeInitials("aa"), "AA");
    assert.equal(normalizeInitials("aam"), "AAM");
    assert.equal(normalizeInitials("aamx"), "AAM");
    assert.equal(isSeatInitials("a"), false);
    assert.equal(isSeatInitials("aa"), true);
    assert.equal(isSeatInitials("aam"), true);
    const events = [makeRoster("AA", "add", "AA", "a"), makeRoster("AAM", "add", "AA", "a")];
    const roster = foldRoster(events);
    assert.ok(roster.includes("AA"));
    assert.ok(roster.includes("AAM"));
  });

  it("case lead locks after claim; only current lead can pass", () => {
    const claim = makeLead("claim", "AA", "AA", "a");
    assert.equal(foldLead([claim]), "AA");
    const steal = { ...makeLead("claim", "AL", "AL", "b"), at: "2099-01-01T00:00:00Z" };
    assert.equal(foldLead([claim, steal]), "AA");
    const pass = { ...makeLead("handoff", "MK", "AA", "a"), at: "2099-01-02T00:00:00Z" };
    assert.equal(foldLead([claim, steal, pass]), "MK");
    const lateSteal = { ...makeLead("handoff", "AL", "AL", "b"), at: "2099-01-03T00:00:00Z" };
    assert.equal(foldLead([claim, steal, pass, lateSteal]), "MK");
    const noReason = { ...makeLead("takeover", "AL", "AL", "b"), at: "2099-01-04T00:00:00Z" };
    assert.equal(foldLead([claim, steal, pass, lateSteal, noReason]), "MK");
    const cover = {
      ...makeLead("takeover", "AL", "AL", "b", { reason: "pto", witness: "DN" }),
      at: "2099-01-05T00:00:00Z",
    };
    assert.equal(foldLead([claim, steal, pass, lateSteal, noReason, cover]), "AL");
  });
});
