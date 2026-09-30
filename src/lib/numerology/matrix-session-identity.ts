/** Authoritative report identity: absent fields must clear the previous subject. */
export function matrixSessionIdentity(data: {
  matrixBirthDate?: unknown;
  matrixCalculationVersion?: unknown;
  matrixStructuredData?: unknown;
  matrixAsOf?: unknown;
  sessionCreatedAt?: unknown;
}) {
  const text = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : null;
  const snapshot = data.matrixStructuredData;
  return {
    birthDate: text(data.matrixBirthDate),
    calculationVersion: text(data.matrixCalculationVersion),
    structuredData: snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)
      ? snapshot as Record<string, unknown> : null,
    asOf: text(data.matrixAsOf) ?? text(data.sessionCreatedAt),
  };
}
