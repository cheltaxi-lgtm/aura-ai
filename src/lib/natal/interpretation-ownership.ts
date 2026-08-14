import { getGuestNatalArtifactMeta } from "@/lib/services/natal-guest-service";
import { userHasNatalInterpretationForChart } from "@/lib/services/natal-chart-service";

const ARTIFACT_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Server-only exact-artifact ownership. Returns boolean only. */
export async function hasOwnedNatalInterpretationForArtifact(opts: {
  userId: string;
  artifactId: string;
}): Promise<boolean> {
  const artifactId = opts.artifactId.trim();
  if (!opts.userId || !ARTIFACT_ID_RE.test(artifactId)) return false;

  const guest = await getGuestNatalArtifactMeta(artifactId);
  if (!guest) return false;
  if (guest.claimedUserId && guest.claimedUserId !== opts.userId) return false;

  return userHasNatalInterpretationForChart(opts.userId, {
    birthFingerprint: guest.birthFingerprint,
    engineVersion: guest.engineVersion,
  });
}
