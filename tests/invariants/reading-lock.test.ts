import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ connect: vi.fn(), on: vi.fn(), poolOptions: vi.fn() }));
vi.mock("@/lib/db", () => ({ getPool: () => ({ options: { max: 20 } }) }));
vi.mock("pg", () => ({
  Pool: class {
    constructor(options: unknown) { mocks.poolOptions(options); }
    connect = mocks.connect;
    on = mocks.on;
  },
}));
import { withReadingLock } from "@/lib/reading-lock";

describe("reading lock connection lifetime", () => {
  beforeEach(() => { mocks.connect.mockReset(); });

  it("keeps the same checked-out connection until the callback and unlock finish", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const release = vi.fn();
    mocks.connect.mockResolvedValue({ query, release });
    expect(await withReadingLock("reading:user:one", async () => {
      expect(query).toHaveBeenCalledWith("SELECT pg_advisory_lock(hashtext($1))", ["reading:user:one"]);
      expect(release).not.toHaveBeenCalled();
      return "result";
    })).toBe("result");
    expect(query).toHaveBeenLastCalledWith("SELECT pg_advisory_unlock(hashtext($1))", ["reading:user:one"]);
    expect(release).toHaveBeenCalledWith(false);
    expect(mocks.poolOptions).toHaveBeenCalledWith(expect.objectContaining({ max: 20, connectionTimeoutMillis: 30_000 }));
  });

  it("unlocks and releases when generation throws, preserving the original error", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const release = vi.fn();
    mocks.connect.mockResolvedValue({ query, release });
    const failure = new Error("generation failed");
    await expect(withReadingLock("one", async () => { throw failure; })).rejects.toBe(failure);
    expect(query).toHaveBeenCalledTimes(2);
    expect(release).toHaveBeenCalledWith(false);
  });

  it("discards a connection if unlock fails instead of returning a locked backend to the pool", async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [] }).mockRejectedValueOnce(new Error("connection lost"));
    const release = vi.fn();
    mocks.connect.mockResolvedValue({ query, release });
    expect(await withReadingLock("one", async () => "saved")).toBe("saved");
    expect(release).toHaveBeenCalledWith(true);
  });

  it("does not run generation when lock acquisition fails", async () => {
    const query = vi.fn().mockRejectedValue(new Error("lock timeout"));
    const release = vi.fn();
    const generate = vi.fn();
    mocks.connect.mockResolvedValue({ query, release });
    await expect(withReadingLock("one", generate)).rejects.toThrow("lock timeout");
    expect(generate).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledWith(true);
  });
});
