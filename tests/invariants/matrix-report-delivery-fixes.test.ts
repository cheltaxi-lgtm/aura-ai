import { describe, expect, it, vi, beforeEach } from "vitest";
import { matrixReportDisplayMetadata } from "@/lib/numerology/matrix-report-display";

const rollback = vi.hoisted(() => vi.fn());
vi.mock("@/lib/services/billing-service", () => ({ BillingService: { rollbackChargeEx: rollback } }));
import { refundReadingCharge } from "@/lib/services/reading-refund-service";

describe("saved Matrix delivery identity", () => {
  it("delivers the old report's version, calendar and snapshot together", () => {
    const snapshot = { version: "matrix-v4", asOf: { date: "2024-01-01" }, comfort: { number: 12 } };
    expect(matrixReportDisplayMetadata({ birthDate: "1990-08-15", calculationVersion: "matrix-v4", structuredData: snapshot, createdAt: "2024-01-02T12:00:00Z" })).toEqual({
      matrixBirthDate: "1990-08-15", matrixCalculationVersion: "matrix-v4", matrixStructuredData: snapshot, matrixAsOf: "2024-01-01",
    });
  });
  it("retains legacy missing snapshot instead of claiming the live version", () => {
    expect(matrixReportDisplayMetadata({ birthDate: "1988-03-03", calculationVersion: "matrix-v3", structuredData: null, createdAt: "2023-03-01T12:00:00Z" })).toMatchObject({ matrixStructuredData: null, matrixCalculationVersion: "matrix-v3", matrixAsOf: "2023-03-01T12:00:00Z" });
  });
});

describe("reading refund confirmation", () => {
  beforeEach(() => rollback.mockReset());
  const charge = { userId: "buyer", cost: 100, wasFreeQuestion: false, transactionId: "original-charge" };
  it("does not mark the job refunded when ledger rollback fails", async () => {
    rollback.mockResolvedValue({ balance: 20, refunded: false });
    const confirmed = vi.fn();
    await expect(refundReadingCharge(charge, confirmed)).rejects.toThrow("reading_refund_failed");
    expect(confirmed).not.toHaveBeenCalled();
  });
  it("marks only the confirmed original-charge refund", async () => {
    rollback.mockResolvedValue({ balance: 120, refunded: true });
    const confirmed = vi.fn().mockResolvedValue(undefined);
    await expect(refundReadingCharge(charge, confirmed)).resolves.toEqual({ balance: 120, refunded: true });
    expect(rollback).toHaveBeenCalledWith(charge);
    expect(confirmed).toHaveBeenCalledOnce();
  });
});
