/** Typed errors for budget protection layer. */
export class BudgetExhaustedError extends Error {
  readonly code = "BUDGET_EXHAUSTED" as const;
  constructor(
    message: string,
    public spentRub: number,
    public hardTotalRub: number
  ) {
    super(message);
    this.name = "BudgetExhaustedError";
  }
}

export class HardBudgetImmutableError extends Error {
  readonly code = "HARD_BUDGET_IMMUTABLE" as const;
  constructor(message = "hard_total_budget_rub can only change via approval_request kind=global_cap_increase") {
    super(message);
    this.name = "HardBudgetImmutableError";
  }
}

export class ApprovalExpiredError extends Error {
  readonly code = "APPROVAL_EXPIRED" as const;
  constructor(message = "approval_request TTL expired — create a new request") {
    super(message);
    this.name = "ApprovalExpiredError";
  }
}

export class ApprovalConfirmRequiredError extends Error {
  readonly code = "APPROVAL_CONFIRM_REQUIRED" as const;
  constructor(message: string) {
    super(message);
    this.name = "ApprovalConfirmRequiredError";
  }
}
