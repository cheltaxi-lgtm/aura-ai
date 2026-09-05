import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { resolveAsyncReportDestination } from "@/lib/async-report-destination";

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
