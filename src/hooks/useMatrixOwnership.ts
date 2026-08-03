"use client";

import { useCallback, useEffect, useState } from "react";
import { readStoredProfile } from "@/lib/home-flow-storage";
import { parseBirthDate } from "@/lib/numerology/constants";

export function toIsoBirthDateClient(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const parsed = parseBirthDate(raw.trim());
  if (!parsed) return null;
  return `${parsed.year}-${String(parsed.month).padStart(2, "0")}-${String(parsed.day).padStart(2, "0")}`;
}

type MatrixOwnershipState = {
  loading: boolean;
  owned: boolean;
  birthDate: string | null;
  subjectId: string | null;
  reportId: string | null;
  refetch: () => void;
};

/**
 * Shared buy-once Full Matrix ownership check (site banners / session flow / chat).
 * Uses quality-gated GET ?birthDate=; list=1 only as birthDate-scoped metadata fallback.
 */
export function useMatrixOwnership(options?: {
  enabled?: boolean;
  /** When set, skip profile fetch and use this birth date. */
  birthDate?: string | null;
  /** Look up ownership for a saved matrix subject. */
  subjectId?: string | null;
}): MatrixOwnershipState {
  const enabled = options?.enabled !== false;
  const birthOverride = options?.birthDate;
  const subjectId = options?.subjectId?.trim() || null;
  const [tick, setTick] = useState(0);
  const [loading, setLoading] = useState(Boolean(enabled));
  const [owned, setOwned] = useState(false);
  const [birthDate, setBirthDate] = useState<string | null>(null);
  const [reportId, setReportId] = useState<string | null>(null);

  const refetch = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    if (!enabled) {
      setOwned(false);
      setBirthDate(null);
      setReportId(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    void (async () => {
      setLoading(true);
      let birth = toIsoBirthDateClient(birthOverride) ?? toIsoBirthDateClient(readStoredProfile()?.birthDate);

      if (!birthOverride) {
        try {
          const profileRes = await fetch("/api/profile", { credentials: "include" });
          if (profileRes.ok) {
            const data = (await profileRes.json()) as {
              profile?: { birthDate?: string } | null;
            };
            birth = toIsoBirthDateClient(data.profile?.birthDate) ?? birth;
          }
        } catch {
          /* keep local */
        }
      }

      if (cancelled) return;
      setBirthDate(birth);

      try {
        if (subjectId || birth) {
          const res = await fetch(
            subjectId
              ? `/api/numerology/matrix-report?subjectId=${encodeURIComponent(subjectId)}`
              : `/api/numerology/matrix-report?birthDate=${encodeURIComponent(birth!)}`,
            { credentials: "include" }
          );
          if (res.ok) {
            const data = (await res.json()) as {
              owned?: boolean;
              report?: { id?: string; hasContent?: boolean } | null;
            };
            if (!cancelled) {
              const isOwned = Boolean(data.owned && data.report?.hasContent !== false);
              setOwned(isOwned);
              setReportId(isOwned ? data.report?.id ?? null : null);
              setLoading(false);
              return;
            }
          }
        }

        // Metadata fallback (no full report bodies).
        const listRes = await fetch(`/api/numerology/matrix-report?list=1`, {
          credentials: "include",
        });
        if (!listRes.ok || cancelled) {
          if (!cancelled) {
            setOwned(false);
            setReportId(null);
          }
          return;
        }
        const listData = (await listRes.json()) as {
          reports?: Array<{
            id?: string;
            birthDate?: string;
            subjectId?: string;
            hasContent?: boolean;
            legacyVersion?: boolean;
            content?: string;
          }>;
        };
        const birthKey = birth?.slice(0, 10) ?? null;
        const match = listData.reports?.find((r) => {
          const has =
            r.hasContent === true || Boolean(String(r.content ?? "").trim());
          if (!has) return false;
          // A pre-v3 row owes a free rebuild and cannot be opened, so surfacing it as
          // owned would promise a saved report the chat then refuses to show.
          if (r.legacyVersion === true) return false;
          if (subjectId) return false;
          if (!birthKey) return true;
          return r.birthDate === birthKey || r.birthDate === birth;
        });
        if (!cancelled) {
          setOwned(Boolean(match));
          setReportId(match?.id ?? null);
        }
      } catch {
        if (!cancelled) {
          setOwned(false);
          setReportId(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, birthOverride, subjectId, tick]);

  return { loading, owned, birthDate, subjectId, reportId, refetch };
}
