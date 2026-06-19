import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import {
  getUserChatHistory,
  getUserPayments,
  getUserSubscription,
  getUserReadingHistory,
  getProfileUserIdForAccount,
} from "@/lib/accounts";
import { getUserById, serializeUserProfile } from "@/lib/users";
import { getUserMemoryPreview } from "@/lib/user-memory";

export async function GET() {
  const auth = await getAuth();
  if (!auth || auth.role !== "user") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profileUserId = await getProfileUserIdForAccount(auth.sub);

  if (!profileUserId) {
    return NextResponse.json({
      profile: { name: auth.name, email: auth.email },
      astroProfile: null,
      profileUserId: null,
      latestAnalysis: null,
      readings: [],
      history: [],
      payments: [],
      subscription: null,
    });
  }

  const [astroRow, readings, history, payments, subscription, memory] = await Promise.all([
    getUserById(profileUserId),
    getUserReadingHistory(profileUserId),
    getUserChatHistory(profileUserId),
    getUserPayments(profileUserId),
    getUserSubscription(profileUserId),
    getUserMemoryPreview(profileUserId),
  ]);

  const mappedReadings = readings.map((r) => ({
    id: r.id,
    characterName: r.character_name,
    contextData: r.context_data,
    isPaid: r.is_paid,
    createdAt: r.created_at,
  }));

  const latestTriplet = mappedReadings.find((r) => r.characterName === "triplet");
  const latestReading = mappedReadings.find(
    (r) =>
      (r.contextData?.type === "reading" || r.contextData?.type === "photo_reading") &&
      typeof (r.contextData.reading ?? r.contextData.analysis) === "string"
  );

  const latestAnalysis = latestReading
    ? {
        id: latestReading.id,
        type: latestReading.contextData?.type === "photo_reading" ? ("photo" as const) : ("reading" as const),
        masterId: latestReading.characterName,
        text: (latestReading.contextData.reading ?? latestReading.contextData.analysis) as string,
        detectedCards: latestReading.contextData.detectedCards as string[] | undefined,
        deckType: latestReading.contextData.deckType as string | undefined,
        spreadType: latestReading.contextData.spreadType as string | undefined,
        tarotCards: latestReading.contextData.tarotCards as
          | { name: string; meaning?: string }[]
          | undefined,
        isPaid: latestReading.isPaid,
        createdAt: latestReading.createdAt,
      }
    : latestTriplet
      ? {
          id: latestTriplet.id,
          type: "teaser" as const,
          text:
            (typeof latestTriplet.contextData.teaser === "string"
              ? latestTriplet.contextData.teaser
              : null) ??
            "Расклад готов — выберите мастера для полной расшифровки на главной.",
          tarotCards: latestTriplet.contextData.tarotCards as
            | { name: string; meaning?: string }[]
            | undefined,
          isPaid: latestTriplet.isPaid,
          createdAt: latestTriplet.createdAt,
        }
      : null;

  return NextResponse.json({
    profile: { name: auth.name, email: auth.email },
    astroProfile: astroRow ? serializeUserProfile(astroRow) : null,
    profileUserId,
    latestAnalysis,
    readings: mappedReadings,
    history,
    payments,
    subscription,
    memory,
  });
}
