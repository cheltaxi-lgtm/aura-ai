import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.fn();
const rollbackChargeMock = vi.fn();

vi.mock("@/lib/db", () => ({
  query: (...args: unknown[]) => queryMock(...args),
  withTransaction: async (fn: (client: { query: typeof queryMock }) => unknown) =>
    fn({ query: queryMock }),
}));

vi.mock("@/lib/services/billing-service", () => ({
  BillingService: { rollbackCharge: (...args: unknown[]) => rollbackChargeMock(...args) },
}));

import {
  isRetryableReportErrorCode,
  reapNeedsRegenerationAsyncJobs,
  REPORT_JOB_MAX_ATTEMPTS,
  REPORT_JOB_MAX_PROVIDER_RESCHEDULES,
  rescheduleOrFailReportJob,
  retryOrFailReportJob,
} from "@/lib/async-jobs";

const CHARGED_RUNNING_JOB = {
  id: "job-1",
  user_id: "user-1",
  kind: "hd_report",
  status: "running",
  billing_state: "charged",
  charge_transaction_id: "tx-1",
};

describe("report job retry budget", () => {
  beforeEach(() => {
    queryMock.mockReset();
    rollbackChargeMock.mockReset();
    queryMock.mockResolvedValue({ rows: [] });
  });

  it("classifies retryable vs terminal error codes", () => {
    for (const code of [
      "generation_failed",
      "invalid_model_report",
      "invalid_model_output",
      "empty_or_rejected",
      "matrix_arcana_mismatch",
      "db_timeout",
      "provider_unavailable",
      "worker_timeout",
    ]) {
      expect(isRetryableReportErrorCode(code)).toBe(true);
    }
    for (const code of [
      "insufficient_runes",
      "insufficient",
      "not_found",
      "charts_not_ready",
      "save_fk_violation",
      "needs_regeneration",
      "regeneration_failed",
      "",
      null,
      undefined,
    ]) {
      expect(isRetryableReportErrorCode(code)).toBe(false);
    }
  });

  it("requeues under the attempt budget without touching billing", async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.startsWith("SELECT attempt_count")) {
        return { rows: [{ attempt_count: 1 }] };
      }
      if (sql.includes("SET status = 'pending'")) return { rowCount: 1 };
      return { rows: [] };
    });

    const outcome = await retryOrFailReportJob({
      jobId: "job-1",
      message: "model wobble",
      errorCode: "generation_failed",
    });

    expect(outcome).toBe("requeued");
    const update = queryMock.mock.calls.find(([sql]) =>
      String(sql).includes("SET status = 'pending'")
    );
    expect(update).toBeDefined();
    const [sql] = update as [string, unknown[]];
    expect(sql).toMatch(/next_attempt_at = NOW\(\)/);
    expect(sql).not.toMatch(/billing_state/);
    expect(rollbackChargeMock).not.toHaveBeenCalled();
  });

  it("fails + refunds once the attempt budget is exhausted", async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.startsWith("SELECT attempt_count")) {
        return { rows: [{ attempt_count: REPORT_JOB_MAX_ATTEMPTS }] };
      }
      if (sql.includes("FROM async_jobs") && sql.includes("WHERE id = $1")) {
        return { rows: [CHARGED_RUNNING_JOB] };
      }
      if (sql.includes("SET status = 'failed'")) return { rowCount: 1 };
      if (sql.includes("FROM rune_transactions")) {
        return { rows: [{ amount: 100, action_type: "HD_REPORT" }] };
      }
      return { rowCount: 1, rows: [] };
    });

    const outcome = await retryOrFailReportJob({
      jobId: "job-1",
      message: "model keeps failing",
      errorCode: "generation_failed",
    });

    expect(outcome).toBe("failed");
    expect(
      queryMock.mock.calls.some(([sql]) => String(sql).includes("SET status = 'failed'"))
    ).toBe(true);
    expect(rollbackChargeMock).toHaveBeenCalledTimes(1);
    // No requeue may happen at budget.
    expect(
      queryMock.mock.calls.some(([sql]) => String(sql).includes("SET status = 'pending'"))
    ).toBe(false);
  });

  it("does not interfere when the job already transitioned away", async () => {
    queryMock.mockResolvedValue({ rows: [] }); // no running row
    const outcome = await retryOrFailReportJob({
      jobId: "job-1",
      message: "x",
      errorCode: "generation_failed",
    });
    expect(outcome).toBe("failed");
    expect(
      queryMock.mock.calls.some(
        ([sql]) =>
          String(sql).includes("SET status = 'pending'") ||
          String(sql).includes("SET status = 'failed'")
      )
    ).toBe(false);
  });

  it("caps provider reschedules so a dead provider cannot loop a job forever", async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.startsWith("SELECT retry_429_count")) {
        return { rows: [{ retry_429_count: REPORT_JOB_MAX_PROVIDER_RESCHEDULES }] };
      }
      if (sql.includes("FROM async_jobs") && sql.includes("WHERE id = $1")) {
        return { rows: [CHARGED_RUNNING_JOB] };
      }
      if (sql.includes("SET status = 'failed'")) return { rowCount: 1 };
      if (sql.includes("FROM rune_transactions")) {
        return { rows: [{ amount: 100, action_type: "HD_REPORT" }] };
      }
      return { rowCount: 1, rows: [] };
    });

    const outcome = await rescheduleOrFailReportJob({
      jobId: "job-1",
      delayMs: 30_000,
      message: "provider down",
    });

    expect(outcome).toBe("failed");
    expect(
      queryMock.mock.calls.some(([sql]) => String(sql).includes("SET status = 'failed'"))
    ).toBe(true);
    // rescheduleAsyncJob would have issued this UPDATE — must not happen at cap.
    expect(
      queryMock.mock.calls.some(([sql]) =>
        String(sql).includes("retry_429_count = COALESCE(retry_429_count, 0) + 1")
      )
    ).toBe(false);
  });

  it("needs_regeneration reaper requeues once, then fails + refunds", async () => {
    // First sweep: regen_attempts = 0 → requeue to pending with regen_attempts=1.
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM async_jobs") && sql.includes("needs_regeneration")) {
        return { rows: [{ id: "job-1", error_message: "qa", regen_attempts: 0 }] };
      }
      if (sql.includes("SET status = 'pending'")) return { rowCount: 1 };
      return { rows: [] };
    });

    const first = await reapNeedsRegenerationAsyncJobs({
      minAgeMs: 60_000,
      kinds: ["hd_report"],
    });
    expect(first).toEqual({ requeued: 1, failed: 0 });
    const requeue = queryMock.mock.calls.find(([sql]) =>
      String(sql).includes("SET status = 'pending'")
    );
    expect(requeue).toBeDefined();
    expect(String(requeue![0])).toMatch(/regen_attempts/);
    expect(String(requeue![0])).toMatch(/completed_at = NULL/);

    // Second sweep: regen_attempts = 1 → terminal fail + refund.
    queryMock.mockReset();
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes("needs_regeneration") && sql.includes("SELECT id, error_message")) {
        return { rows: [{ id: "job-1", error_message: "qa", regen_attempts: 1 }] };
      }
      if (sql.includes("SET status = 'failed'")) return { rowCount: 1 };
      if (sql.includes("FROM async_jobs") && sql.includes("WHERE id = $1")) {
        return { rows: [CHARGED_RUNNING_JOB] };
      }
      if (sql.includes("FROM rune_transactions")) {
        return { rows: [{ amount: 100, action_type: "HD_REPORT" }] };
      }
      return { rowCount: 1, rows: [] };
    });

    const second = await reapNeedsRegenerationAsyncJobs({
      minAgeMs: 60_000,
      kinds: ["hd_report"],
    });
    expect(second).toEqual({ requeued: 0, failed: 1 });
    expect(rollbackChargeMock).toHaveBeenCalledTimes(1);
  });
});
