import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.fn();
const withTransactionMock = vi.fn();

vi.mock("@/lib/db", () => ({
  query: (...args: unknown[]) => queryMock(...args),
  withTransaction: (fn: (client: { query: typeof queryMock }) => unknown) =>
    withTransactionMock(fn),
}));

vi.mock("@/lib/services/billing-service", () => ({
  BillingService: { rollbackCharge: vi.fn() },
}));

import {
  ASYNC_JOB_WATCHDOG_MS_DEFAULT,
  reapOrphanedRunningAsyncJobs,
  reapStaleRunningAsyncJobs,
  reapWatchdogRunningAsyncJobs,
  touchAsyncJobHeartbeat,
} from "@/lib/async-jobs";

describe("async job orphan / stale / watchdog reapers", () => {
  beforeEach(() => {
    queryMock.mockReset();
    withTransactionMock.mockReset();
    queryMock.mockResolvedValue({ rows: [] });
    withTransactionMock.mockImplementation(async (fn) => {
      const client = {
        query: vi.fn().mockResolvedValue({ rows: [] }),
      };
      return fn(client);
    });
  });

  it("watchdog default is 55 minutes (covers long HD final assembly)", () => {
    expect(ASYNC_JOB_WATCHDOG_MS_DEFAULT).toBe(55 * 60_000);
  });

  it("orphan reaper returns jobs to pending with next_attempt_at and excludes current worker", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "j1" }] });
    const n = await reapOrphanedRunningAsyncJobs({
      currentWorkerId: "worker-alive",
      minAgeMs: 5_000,
      kinds: ["hd_report"],
    });
    expect(n).toBe(1);
    const [sql, params] = queryMock.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/status = 'pending'/);
    expect(sql).toMatch(/next_attempt_at = NOW\(\)/);
    expect(sql).toMatch(/worker_id IS DISTINCT FROM \$2/);
    expect(sql).toMatch(/orphan_reaped_at/);
    expect(params[1]).toBe("worker-alive");
  });

  it("stale reaper never steals the current worker's live job", async () => {
    const clientQuery = vi.fn().mockResolvedValue({ rows: [] });
    withTransactionMock.mockImplementationOnce(async (fn) =>
      fn({ query: clientQuery })
    );
    await reapStaleRunningAsyncJobs({
      staleAfterMs: 60_000,
      currentWorkerId: "worker-alive",
      kinds: ["hd_report"],
    });
    expect(clientQuery).toHaveBeenCalled();
    for (const call of clientQuery.mock.calls) {
      const sql = call[0] as string;
      const params = call[1] as unknown[];
      expect(sql).toMatch(/worker_id IS DISTINCT FROM \$4/);
      expect(params[3]).toBe("worker-alive");
    }
  });

  it("watchdog reaper includes current worker and tags watchdog_reaped_at", async () => {
    const clientQuery = vi.fn().mockResolvedValue({ rows: [{ id: "j2" }] });
    withTransactionMock.mockImplementationOnce(async (fn) =>
      fn({ query: clientQuery })
    );
    const result = await reapWatchdogRunningAsyncJobs({
      maxRunningMs: 25 * 60_000,
      kinds: ["hd_report"],
    });
    expect(result.requeued).toBe(1);
    const sql = clientQuery.mock.calls[0][0] as string;
    expect(sql).toMatch(/watchdog_reaped_at/);
    expect(sql).toMatch(/error_code = 'watchdog_requeued'/);
    expect(sql).not.toMatch(/worker_id IS DISTINCT FROM/);
  });

  it("heartbeat refreshes locked_at for the owning worker only", async () => {
    await touchAsyncJobHeartbeat("job-1", "worker-alive");
    const [sql, params] = queryMock.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/locked_at = NOW\(\)/);
    expect(sql).toMatch(/worker_id = \$2/);
    expect(params).toEqual(["job-1", "worker-alive"]);
  });
});
