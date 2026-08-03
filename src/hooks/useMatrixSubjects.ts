"use client";

import { useCallback, useEffect, useState } from "react";
import type { MatrixSubject, MatrixSubjectKind } from "@/lib/services/matrix-subject-service";

export type MatrixSubjectInput = {
  kind: Exclude<MatrixSubjectKind, "self">;
  displayName?: string;
  birthDate: string;
  birthTime?: string;
  birthCity?: string;
};

type MatrixSubjectCosts = { subject?: number; child?: number };

export function useMatrixSubjects(options?: { enabled?: boolean }) {
  const enabled = options?.enabled !== false;
  const [loading, setLoading] = useState(Boolean(enabled));
  const [subjects, setSubjects] = useState<MatrixSubject[]>([]);
  const [limit, setLimit] = useState<number | null>(null);
  const [costs, setCosts] = useState<MatrixSubjectCosts | undefined>();

  const refetch = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/numerology/matrix-subjects", {
        credentials: "include",
      });
      if (!res.ok) throw new Error("subjects_failed");
      const data = (await res.json()) as {
        subjects?: MatrixSubject[];
        limit?: number;
        costs?: MatrixSubjectCosts;
      };
      setSubjects(Array.isArray(data.subjects) ? data.subjects : []);
      setLimit(typeof data.limit === "number" ? data.limit : null);
      setCosts(data.costs);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const create = useCallback(async (body: MatrixSubjectInput): Promise<MatrixSubject> => {
    const res = await fetch("/api/numerology/matrix-subjects", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as {
      subject?: MatrixSubject;
      error?: string;
    };
    if (!res.ok || !data.subject) {
      throw new Error(data.error || "Не удалось сохранить человека.");
    }
    setSubjects((current) => [...current, data.subject!]);
    return data.subject;
  }, []);

  const remove = useCallback(async (subjectId: string) => {
    const res = await fetch(
      `/api/numerology/matrix-subjects?subjectId=${encodeURIComponent(subjectId)}`,
      { method: "DELETE", credentials: "include" }
    );
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error || "Не удалось удалить профиль.");
    }
    setSubjects((current) => current.filter((subject) => subject.id !== subjectId));
  }, []);

  return { loading, subjects, limit, costs, refetch, create, remove };
}
