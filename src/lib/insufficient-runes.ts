import { NextResponse } from "next/server";

export function insufficientRunesResponse(balance: number, required: number) {
  return NextResponse.json(
    {
      error: "insufficient_runes",
      balance,
      required,
      shortage: Math.max(0, required - balance),
    },
    { status: 402 }
  );
}

export function isInsufficientRunesError(error: unknown): error is {
  error: string;
  balance?: number;
  required?: number;
  shortage?: number;
} {
  if (!error || typeof error !== "object") return false;
  const e = error as { error?: string };
  return e.error === "insufficient_runes" || e.error === "INSUFFICIENT_RUNES";
}
