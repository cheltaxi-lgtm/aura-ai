import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import SessionIntentionBar from "@/components/SessionIntentionBar";
import type { SessionIntention } from "@/lib/intention";
import { normalizeSessionIntention } from "@/lib/session-intention-normalize";
import { decodeNumerologSpreadId, numerologComputedOnlyTool, resolveNumerologToolId } from "@/lib/numerology/tools";

describe("Matrix bot session reopening", () => {
  it.each(["destiny_matrix", "child_matrix"])("restores raw and prefixed %s as a computed Matrix session", tool => {
    for (const spreadId of [tool, `numerolog:${tool}`]) {
      const historyTool = decodeNumerologSpreadId(spreadId);
      const restoredTool = resolveNumerologToolId(spreadId, historyTool);
      expect(normalizeSessionIntention(tool)).toBeNull();
      expect(historyTool).toBe(tool);
      expect(restoredTool).toBe(tool);
      expect(numerologComputedOnlyTool(restoredTool)).toBe(true);
    }
    expect(decodeNumerologSpreadId("unknown_legacy_tool")).toBeNull();
  });

  it.each(["destiny_matrix", "child_matrix", "unknown_legacy_tool"])("does not restore %s as a conversation topic", intention => {
    expect(normalizeSessionIntention(intention)).toBeNull();
    expect(() => renderToStaticMarkup(createElement(SessionIntentionBar, {
      intention: intention as SessionIntention,
      masterName: "Эвелина", characterKey: "numerolog", activeCharacterKey: "numerolog",
    }))).not.toThrow();
  });

  it.each(["Любовь", "Деньги", "love", "life_death", "custom"])("keeps valid conversation topic %s", intention => {
    expect(normalizeSessionIntention(` ${intention} `)).toBe(intention);
    expect(renderToStaticMarkup(createElement(SessionIntentionBar, {
      intention: intention as SessionIntention,
      masterName: "Эвелина", characterKey: "numerolog", activeCharacterKey: "numerolog",
    }))).toContain("Тема сеанса");
  });
});
