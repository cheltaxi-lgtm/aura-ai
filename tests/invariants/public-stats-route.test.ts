import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const m = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock("@/lib/db", () => ({ query: m.query }));

import { GET } from "@/app/api/stats/public/route";

describe("public stats route", () => {
  beforeEach(() => {
    m.query.mockReset().mockResolvedValue({ rows: [{ sessions: "42", users: "17" }] });
  });

  it("reuses one server result when query parameters change the CDN cache key", async () => {
    const headers = { "x-forwarded-for": "203.0.113.10" };
    const first = await GET(new NextRequest("https://zovus.ru/api/stats/public?x=1", { headers }));
    const second = await GET(new NextRequest("https://zovus.ru/api/stats/public?x=2", { headers }));

    expect(await first.json()).toEqual({ sessions: 42, users: 17 });
    expect(await second.json()).toEqual({ sessions: 42, users: 17 });
    expect(m.query).toHaveBeenCalledTimes(1);
  });
});
