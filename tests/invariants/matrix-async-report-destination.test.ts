import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { resolveAsyncReportDestination } from "@/lib/async-report-destination";
import {
  REPORT_JOB_KINDS,
  isNotifiedReportJobKind,
  notifiedReportKindsAsAsyncJobKinds,
  reportKindsAsAsyncJobKinds,
} from "@/lib/async-report-flags";

const ROOT = path.resolve(__dirname, "../..");

describe("async report destination", () => {
  it("opens the exact completed Matrix session when the job carries its session id", () => {
    expect(
      resolveAsyncReportDestination({
        kind: "numerology_reading",
        jobInput: {
          numerologToolId: "destiny_matrix",
          sessionId: "session/with unsafe chars",
        },
        result: { historyId: "history-is-not-the-chat-session" },
      })
    ).toBe(
      "/?master=numerolog&resume=chat&sessionId=session%2Fwith%20unsafe%20chars"
    );
  });

  it("keeps the Matrix tool fallback for legacy jobs without a session", () => {
    expect(
      resolveAsyncReportDestination({
        kind: "numerology_reading",
        jobInput: {
          numerologToolId: "child_matrix",
          matrixSubjectId: "subject-1",
        },
      })
    ).toBe("/?numerolog=1&tool=child_matrix&subjectId=subject-1");
  });

  it("does not present an unfinished accepted job as an openable saved session", () => {
    expect(
      resolveAsyncReportDestination({
        kind: "numerology_reading",
        jobInput: {
          numerologToolId: "destiny_matrix",
          sessionId: "session-still-running",
        },
      })
    ).toBe("/?numerolog=1&tool=destiny_matrix");
  });

  it("opens exact completed Natal reports and compatibility records", () => {
    expect(
      resolveAsyncReportDestination({
        kind: "natal_interpretation",
        result: { reportId: "natal/report 1" },
      })
    ).toBe("/cabinet/astrology?tab=reports&report=natal%2Freport%201");
    expect(
      resolveAsyncReportDestination({
        kind: "natal_forecast",
        result: { reportId: "forecast-1" },
      })
    ).toBe("/cabinet/astrology?tab=reports&report=forecast-1");
    expect(
      resolveAsyncReportDestination({
        kind: "natal_compatibility",
        result: { record: { id: "compat/1" } },
      })
    ).toBe("/cabinet/astrology?tab=compatibility&compatibility=compat%2F1");
  });

  it("opens exact Human Design charts and composite pairs", () => {
    expect(
      resolveAsyncReportDestination({
        kind: "hd_report",
        result: { report: { chartId: "chart/1" } },
      })
    ).toBe("/cabinet/human-design?chart=chart%2F1");
    expect(
      resolveAsyncReportDestination({
        kind: "hd_composite_report",
        jobInput: { baseChartId: "base/1", partnerChartId: "partner 2" },
        result: { report: { id: "report-1" } },
      })
    ).toBe("/cabinet/human-design?chart=base%2F1&partner=partner%202");
  });

  it("notifies and deep-links completed Aura and Palm reports", () => {
    expect(isNotifiedReportJobKind("aura_reading")).toBe(true);
    expect(isNotifiedReportJobKind("palm_reading")).toBe(true);
    expect(notifiedReportKindsAsAsyncJobKinds()).toEqual(
      expect.arrayContaining(["aura_reading", "palm_reading"])
    );
    expect(reportKindsAsAsyncJobKinds()).not.toEqual(
      expect.arrayContaining(["aura_reading", "palm_reading"])
    );
    expect(REPORT_JOB_KINDS).not.toContain("aura_reading");
    expect(REPORT_JOB_KINDS).not.toContain("palm_reading");

    expect(
      resolveAsyncReportDestination({
        kind: "aura_reading",
        jobInput: { auraSnapshotId: "aura-snapshot" },
        result: { historyId: "aura/history" },
      })
    ).toBe("/aura?reading=aura%2Fhistory");
    expect(
      resolveAsyncReportDestination({
        kind: "palm_reading",
        jobInput: { palmSnapshotId: "palm-snapshot" },
        result: { snapshotId: "palm/snapshot" },
      })
    ).toBe("/gadanie-po-ladoni?reading=palm%2Fsnapshot");

    expect(
      resolveAsyncReportDestination({
        kind: "aura_reading",
        jobInput: { auraSnapshotId: "still-running" },
      })
    ).toBe("/aura");
    expect(
      resolveAsyncReportDestination({
        kind: "palm_reading",
        jobInput: { palmSnapshotId: "still-running" },
      })
    ).toBe("/gadanie-po-ladoni");
  });

  it("consumes exact report query parameters in each destination screen", () => {
    const hd = readFileSync(path.join(ROOT, "src/components/human-design/HdCabinet.tsx"), "utf8");
    const natal = readFileSync(
      path.join(ROOT, "src/components/natal/NatalCompatibility.tsx"),
      "utf8"
    );
    const astrology = readFileSync(
      path.join(ROOT, "src/components/natal/AstrologyWorkspace.tsx"),
      "utf8"
    );
    const aura = readFileSync(path.join(ROOT, "src/components/aura/AuraReadingFlow.tsx"), "utf8");
    const palm = readFileSync(path.join(ROOT, "src/components/palm/PalmReadingFlow.tsx"), "utf8");

    expect(hd).toContain('search.get("chart")');
    expect(hd).toContain('search.get("partner")');
    expect(natal).toContain('search.get("compatibility")');
    expect(aura).toContain('search.get("reading")');
    expect(palm).toContain('search.get("reading")');
    expect(aura).toContain("authLoading || !isLoggedIn || requestedReadingId");
    expect(aura).toContain('buildLoginHref(returnTo, "/aura")');
    expect(palm).toContain('buildLoginHref(returnTo, "/gadanie-po-ladoni")');
    expect(aura).toContain("Открываем готовый разбор ауры");
    expect(palm).toContain("Открываем готовый разбор ладони");
    expect(aura).toContain('window.location.assign("/aura")');
    expect(palm).toContain('window.location.assign("/gadanie-po-ladoni")');
    expect(hd).toContain("chartId && !requestedChart");
    expect(astrology).toContain("setSelectedReportId(activeRequestedReportId)");
    expect(astrology).toContain("if (requestedReportId || requestedCompatibilityId) return;");
    expect(natal).toContain("selectCompatibility(data.record.id)");
  });

  it("sends ready notifications for Aura and Palm through the shared worker", () => {
    const worker = readFileSync(path.join(ROOT, "scripts/run-async-jobs.ts"), "utf8");
    const notify = readFileSync(path.join(ROOT, "src/lib/async-report-notify.ts"), "utf8");

    expect(worker).toContain("isNotifiedReportJobKind(job.kind)");
    expect(notify).toContain('aura_reading: "Разбор ауры готов"');
    expect(notify).toContain('palm_reading: "Разбор ладони готов"');
  });

  it("forces a document navigation from the floating tray", () => {
    const tray = readFileSync(
      path.join(ROOT, "src/components/reports/ActiveReportsTray.tsx"),
      "utf8"
    );
    const readyRows = tray.slice(tray.indexOf("{ready.map"));
    expect(readyRows).toContain("<a");
    expect(readyRows).not.toContain("<Link");
  });
});
