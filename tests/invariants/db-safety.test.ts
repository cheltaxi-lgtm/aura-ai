import { describe, expect, it } from "vitest";
import { assertSafeTestDatabaseUrl } from "./db/setup";

describe("db-safety", () => {
  it("refuses TEST_DATABASE_URL containing prod", () => {
    expect(() =>
      assertSafeTestDatabaseUrl("postgresql://u:p@db-prod.example.com:5432/aura")
    ).toThrow(/production host/i);
  });

  it("refuses TEST_DATABASE_URL containing beget", () => {
    expect(() =>
      assertSafeTestDatabaseUrl("postgresql://u:p@host.beget.com:5432/aura")
    ).toThrow(/production host/i);
  });

  it("refuses TEST_DATABASE_URL containing zovus.ru", () => {
    expect(() =>
      assertSafeTestDatabaseUrl("postgresql://u:p@zovus.ru:5432/aura")
    ).toThrow(/production host/i);
  });

  it("allows a local test URL", () => {
    expect(() =>
      assertSafeTestDatabaseUrl(
        "postgresql://auraai:auraai_secret@localhost:5432/auraai_test"
      )
    ).not.toThrow();
  });
});
