/**
 * SEO proposals through the EXISTING ads approvals + experiments.
 * No second autopilot. Auto-safe = metadata/schema/internal links/technical.
 * Body copy, new/deleted routes, bulk changes → approval.
 */
import { getAppUrl } from "@/lib/brand";
import { adsQuery } from "../db";
import { createApprovalRequest } from "../approvals";
import type { ApprovalKind } from "../types";
import { isLandingWhitelisted } from "../validator";
import { runSeoLandingAudit, type LandingAudit } from "./audit";
import {
  mergeInternalLinks,
  normalizeOverridePath,
  parseInternalLinksJson,
  pinCanonicalToAppOrigin,
  sanitizeSchemaJson,
  type SeoOverrideField,
} from "./overrides";

export type SeoAction =
  | "internal_link"
  | "metadata"
  | "schema"
  | "canonical"
  | "robots"
  | "content"
  | "new_route"
  | "delete_route"
  | "bulk";

const AUTO_SAFE: SeoAction[] = ["internal_link", "metadata", "schema", "canonical", "robots"];

export function isSeoAutoSafe(action: SeoAction): boolean {
  return AUTO_SAFE.includes(action);
}

export function approvalKindFor(action: SeoAction): ApprovalKind {
  if (action === "new_route" || action === "delete_route") return "seo_route_change";
  if (action === "content" || action === "bulk") return "seo_content_change";
  return "seo_safe_fix";
}

export async function createSeoExperiment(input: {
  query?: string | null;
  url: string;
  action: SeoAction;
  oldValue?: unknown;
  newValue?: unknown;
  reason: string;
  score?: number | null;
  positionBefore?: number | null;
  clicksBefore?: number | null;
  impressionsBefore?: number | null;
  ctrBefore?: number | null;
  autoSafe?: boolean;
  approvalId?: string | null;
}): Promise<{ id: string }> {
  const { rows } = await adsQuery<{ id: string }>(
    `INSERT INTO ads.seo_experiment (
       query, url, action, old_value, new_value, reason, score,
       position_before, clicks_before, impressions_before, ctr_before,
       result, auto_safe, approval_id
     ) VALUES (
       $1,$2,$3,$4::jsonb,$5::jsonb,$6,$7,$8,$9,$10,$11,'PENDING',$12,$13
     )
     RETURNING id`,
    [
      input.query ?? null,
      input.url,
      input.action,
      JSON.stringify(input.oldValue ?? null),
      JSON.stringify(input.newValue ?? null),
      input.reason,
      input.score ?? null,
      input.positionBefore ?? null,
      input.clicksBefore ?? null,
      input.impressionsBefore ?? null,
      input.ctrBefore ?? null,
      input.autoSafe === true,
      input.approvalId ?? null,
    ]
  );
  return { id: rows[0].id };
}

export async function applySeoOverride(input: {
  path: string;
  field: SeoOverrideField;
  oldValue?: string | null;
  newValue: string;
  experimentId: string;
}): Promise<void> {
  const path = normalizeOverridePath(input.path);
  let newValue = input.newValue;
  if (input.field === "internal_links") {
    const { rows } = await adsQuery<{ new_value: string | null }>(
      `SELECT new_value FROM ads.seo_override WHERE path = $1 AND field = 'internal_links'`,
      [path]
    );
    newValue = JSON.stringify(
      mergeInternalLinks(parseInternalLinksJson(rows[0]?.new_value), parseInternalLinksJson(newValue))
    );
  } else if (input.field === "schema_json") {
    const safe = sanitizeSchemaJson(newValue);
    if (!safe) throw new Error("schema_json_rejected");
    newValue = safe;
  } else if (input.field === "canonical") {
    const pinned = pinCanonicalToAppOrigin(newValue);
    if (!pinned) throw new Error("canonical_off_site");
    newValue = pinned;
  }
  await adsQuery(
    `INSERT INTO ads.seo_override (path, field, old_value, new_value, experiment_id, applied, updated_at)
     VALUES ($1,$2,$3,$4,$5,TRUE,NOW())
     ON CONFLICT (path, field) DO UPDATE SET
       old_value = COALESCE(ads.seo_override.old_value, EXCLUDED.old_value),
       new_value = EXCLUDED.new_value,
       experiment_id = EXCLUDED.experiment_id,
       applied = TRUE,
       updated_at = NOW()`,
    [path, input.field, input.oldValue ?? null, newValue, input.experimentId]
  );
  await adsQuery(
    `UPDATE ads.seo_experiment SET applied_at = NOW(), result = 'PENDING' WHERE id = $1::uuid`,
    [input.experimentId]
  );
}

async function recentOverrideExists(path: string, field: string): Promise<boolean> {
  const { rows } = await adsQuery<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM ads.seo_override
     WHERE path = $1 AND field = $2 AND updated_at >= NOW() - INTERVAL '14 days'`,
    [path, field]
  );
  return Number(rows[0]?.n || 0) > 0;
}

function pathLabel(path: string): string {
  const slug = path.replace(/^\//, "").replace(/\//g, " · ").replace(/-/g, " ").trim();
  return slug || "Zovus";
}

async function applyTechnicalAutoSafe(): Promise<{ autoApplied: number; approvals: number }> {
  let autoApplied = 0;
  let approvals = 0;
  let report;
  try {
    report = await runSeoLandingAudit();
  } catch {
    return { autoApplied: 0, approvals: 0 };
  }
  const base = (report.baseUrl || getAppUrl()).replace(/\/$/, "");

  for (const landing of report.landings as LandingAudit[]) {
    if (!isLandingWhitelisted(landing.path) || !landing.ok) continue;
    const issues = landing.issues || [];

    if (issues.includes("missing_canonical") && !(await recentOverrideExists(landing.path, "canonical"))) {
      const canonical = `${base}${landing.path}`;
      const exp = await createSeoExperiment({
        url: landing.path,
        action: "canonical",
        reason: `S1 auto-safe missing canonical ${landing.path}`,
        autoSafe: true,
        oldValue: landing.canonical,
        newValue: { field: "canonical", newValue: canonical },
      });
      await applySeoOverride({
        path: landing.path,
        field: "canonical",
        oldValue: landing.canonical,
        newValue: canonical,
        experimentId: exp.id,
      });
      autoApplied++;
    }

    if (issues.includes("noindex") && !(await recentOverrideExists(landing.path, "robots"))) {
      const exp = await createSeoExperiment({
        url: landing.path,
        action: "robots",
        reason: `S1 auto-safe accidental noindex on whitelist ${landing.path}`,
        autoSafe: true,
        oldValue: landing.robots,
        newValue: { field: "robots", newValue: "index, follow" },
      });
      await applySeoOverride({
        path: landing.path,
        field: "robots",
        oldValue: landing.robots,
        newValue: "index, follow",
        experimentId: exp.id,
      });
      autoApplied++;
    }

    if (issues.includes("missing_schema") && !(await recentOverrideExists(landing.path, "schema_json"))) {
      const schema = JSON.stringify({
        "@context": "https://schema.org",
        "@type": "WebPage",
        name: landing.title || landing.h1 || pathLabel(landing.path),
        url: `${base}${landing.path}`,
      });
      const exp = await createSeoExperiment({
        url: landing.path,
        action: "schema",
        reason: `S1 auto-safe missing schema ${landing.path}`,
        autoSafe: true,
        newValue: { field: "schema_json", newValue: schema },
      });
      await applySeoOverride({
        path: landing.path,
        field: "schema_json",
        newValue: schema,
        experimentId: exp.id,
      });
      autoApplied++;
    }

    const emptyTitle = issues.includes("missing_title");
    const emptyDesc = issues.includes("missing_description");
    if (emptyTitle && !(await recentOverrideExists(landing.path, "title"))) {
      const title = (landing.h1 || pathLabel(landing.path)).slice(0, 70);
      const exp = await createSeoExperiment({
        url: landing.path,
        action: "metadata",
        reason: `S1 auto-safe empty title ${landing.path}`,
        autoSafe: true,
        newValue: { field: "title", newValue: title },
      });
      await applySeoOverride({
        path: landing.path,
        field: "title",
        newValue: title,
        experimentId: exp.id,
      });
      autoApplied++;
    }

    if (emptyDesc && !(await recentOverrideExists(landing.path, "description"))) {
      const description = (landing.title || landing.h1 || pathLabel(landing.path)).slice(0, 160);
      const exp = await createSeoExperiment({
        url: landing.path,
        action: "metadata",
        reason: `S1 auto-safe empty description ${landing.path}`,
        autoSafe: true,
        newValue: { field: "description", newValue: description },
      });
      await applySeoOverride({
        path: landing.path,
        field: "description",
        newValue: description,
        experimentId: exp.id,
      });
      autoApplied++;
    }

    if (issues.includes("missing_h1") && !(await recentOverrideExists(landing.path, "h1"))) {
      await createApprovalRequest({
        kind: "seo_content_change",
        targetLevel: "seo",
        targetId: landing.path,
        currentValue: { h1: landing.h1 },
        proposedValue: {
          action: "metadata",
          field: "h1",
          url: landing.path,
          newValue: landing.title || pathLabel(landing.path),
          note: "H1 только через approval",
        },
        rationale: { rule: "S1", issue: "missing_h1" },
      });
      approvals++;
    }
  }

  return { autoApplied, approvals };
}

export async function evaluateSeoRules(): Promise<{
  proposals: number;
  autoApplied: number;
  approvals: number;
  error?: string;
}> {
  try {
    const { rows } = await adsQuery<{
      query: string;
      target_url: string | null;
      opportunity_score: number;
      status: string;
      current_position: string | number | null;
      clicks: number;
      impressions: number;
      ctr: string | number | null;
    }>(
      `SELECT query, target_url, opportunity_score, status, current_position, clicks, impressions, ctr
       FROM ads.search_query_organic
       WHERE status IN ('PUSH','EXPAND','PROTECT')
       ORDER BY opportunity_score DESC
       LIMIT 40`
    );

    let proposals = 0;
    let autoApplied = 0;
    let approvals = 0;

    for (const row of rows) {
      if (!row.target_url) continue;
      const already = await adsQuery<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM ads.seo_experiment
         WHERE query = $1 AND url = $2 AND created_at >= NOW() - INTERVAL '14 days'`,
        [row.query, row.target_url]
      );
      if (Number(already.rows[0]?.n || 0) > 0) continue;

      const pos = row.current_position == null ? null : Number(row.current_position);

      if (row.status === "PUSH" && row.target_url) {
        const hub =
          row.target_url === "/taro" || row.target_url.startsWith("/taro")
            ? null
            : row.target_url.startsWith("/runy")
              ? "/runy"
              : row.target_url.startsWith("/numerology")
                ? "/numerology"
                : row.target_url.startsWith("/prognoz")
                  ? "/prognoz"
                  : row.target_url.startsWith("/statyi")
                    ? "/statyi"
                    : null;
        const reason = `S1 PUSH «${row.query}» score=${row.opportunity_score} pos=${pos ?? "—"} landing=${row.target_url}`;
        if (hub && hub !== row.target_url) {
          const exp = await createSeoExperiment({
            query: row.query,
            url: hub,
            action: "internal_link",
            reason: `${reason} → safe internal link ${hub} → ${row.target_url}`,
            score: row.opportunity_score,
            positionBefore: pos,
            clicksBefore: row.clicks,
            impressionsBefore: row.impressions,
            ctrBefore: row.ctr == null ? null : Number(row.ctr),
            autoSafe: true,
            newValue: { from: hub, to: row.target_url, anchor: row.query },
          });
          await applySeoOverride({
            path: hub,
            field: "internal_links",
            newValue: JSON.stringify([{ href: row.target_url, anchor: row.query }]),
            experimentId: exp.id,
          });
          autoApplied++;
        } else {
          await createApprovalRequest({
            kind: "seo_content_change",
            targetLevel: "seo",
            targetId: row.target_url,
            currentValue: { position: pos },
            proposedValue: {
              action: "content",
              query: row.query,
              url: row.target_url,
              note: "Основной текст и новые SEO-маршруты только через approval. Thin/duplicate pages запрещены.",
            },
            rationale: { rule: "S1", score: row.opportunity_score, status: row.status },
          });
          approvals++;
        }
        proposals++;
      }

      if (row.status === "EXPAND" || (row.status === "PUSH" && !row.target_url)) {
        const kind = approvalKindFor("content");
        await createApprovalRequest({
          kind,
          targetLevel: "seo",
          targetId: row.target_url || row.query,
          currentValue: { position: pos, url: row.target_url },
          proposedValue: {
            action: "content",
            query: row.query,
            url: row.target_url,
            note: "Изменение основного текста только через approval. Новые страницы не создаём.",
          },
          rationale: {
            rule: "S1",
            score: row.opportunity_score,
            status: row.status,
          },
        });
        approvals++;
        proposals++;
      }
    }

    const tech = await applyTechnicalAutoSafe();
    autoApplied += tech.autoApplied;
    approvals += tech.approvals;
    proposals += tech.autoApplied + tech.approvals;

    await adsQuery(
      `INSERT INTO ads.rule_log (rule, decision, reason_json, applied)
       VALUES ('S1', $1, $2::jsonb, $3)`,
      [
        autoApplied > 0 ? "autofix" : approvals > 0 ? "approval" : "ok",
        JSON.stringify({ proposals, autoApplied, approvals }),
        autoApplied > 0,
      ]
    );

    return { proposals, autoApplied, approvals };
  } catch (e) {
    return {
      proposals: 0,
      autoApplied: 0,
      approvals: 0,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function listSeoExperiments(limit = 100) {
  const { rows } = await adsQuery(
    `SELECT e.*,
            EXISTS (
              SELECT 1 FROM ads.seo_override o
              WHERE o.experiment_id = e.id AND o.applied = TRUE
            ) AS on_site
     FROM ads.seo_experiment e
     ORDER BY e.created_at DESC
     LIMIT $1`,
    [limit]
  );
  return rows;
}

export async function decideExperiment(
  id: string,
  result: "KEEP" | "ROLLBACK" | "NEXT"
): Promise<void> {
  if (result === "ROLLBACK") {
    await adsQuery(
      `UPDATE ads.seo_override SET applied = FALSE, updated_at = NOW()
       WHERE experiment_id = $1::uuid`,
      [id]
    );
  }
  if (result === "KEEP") {
    await adsQuery(
      `UPDATE ads.search_query_organic o
       SET status = 'PROTECT'
       FROM ads.seo_experiment e
       WHERE e.id = $1::uuid AND o.query = e.query`,
      [id]
    );
  }
  await adsQuery(
    `UPDATE ads.seo_experiment SET result = $2 WHERE id = $1::uuid`,
    [id, result]
  );
  if (result === "NEXT") {
    await evaluateSeoRules();
  }
}
