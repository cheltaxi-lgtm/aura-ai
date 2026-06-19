import { NextRequest, NextResponse } from "next/server";

import { ensureDb } from "@/lib/db";

import { requireUserAuth } from "@/lib/require-auth";

import { getProfileUserIdForAccount, getUserReadingHistory } from "@/lib/accounts";

import { getMessages, getSession } from "@/lib/session";

import { buildPhotoReadingUserMessage } from "@/lib/photo-chat";

import { randomUUID } from "crypto";



const MIN_READING_CHARS = 120;



function hasSpreadReading(

  messages: { role: string; content: string }[]

): boolean {

  return messages.some(

    (m) => m.role === "assistant" && m.content.trim().length >= MIN_READING_CHARS

  );

}



function readingContentPrefix(content: string): string {

  return content.trim().slice(0, 200);

}



function findHistoryReading(

  readings: Awaited<ReturnType<typeof getUserReadingHistory>>,

  characterId: string,

  cardsKey: string | null

) {

  return readings.find((r) => {

    if (r.character_name !== characterId || r.context_data?.type !== "reading") return false;

    if (typeof r.context_data.reading !== "string") return false;

    if (!cardsKey) return true;

    const readingCards = r.context_data.tarotCards as { name: string }[] | undefined;

    return (readingCards ?? []).map((c) => c.name).join("|") === cardsKey;

  });

}



function findHistoryPhotoReading(

  readings: Awaited<ReturnType<typeof getUserReadingHistory>>,

  characterId: string

) {

  return readings.find((r) => {

    if (r.character_name !== characterId || r.context_data?.type !== "photo_reading") return false;

    return typeof r.context_data.analysis === "string" && r.context_data.analysis.trim().length > 0;

  });

}



function sessionMatchesSpreadReading(

  sessionRows: { role: string; content: string }[],

  expectedReading: string

): boolean {

  const firstAssistant = sessionRows.find((r) => r.role === "assistant");

  if (!firstAssistant) return false;

  return (

    readingContentPrefix(firstAssistant.content) === readingContentPrefix(expectedReading)

  );

}



function appendPhotoReadingFromHistory(

  messages: { id: string; role: "user" | "assistant"; content: string; timestamp: string }[],

  entry: NonNullable<ReturnType<typeof findHistoryPhotoReading>>

) {

  const detected = (entry.context_data.detectedCards as string[] | undefined) ?? [];

  const question = (entry.context_data.question as string | undefined) ?? "";

  const analysis = entry.context_data.analysis as string;

  const ts = new Date(entry.created_at).toISOString();



  messages.push({

    id: randomUUID(),

    role: "user",

    content: buildPhotoReadingUserMessage(question, detected),

    timestamp: ts,

  });

  messages.push({

    id: randomUUID(),

    role: "assistant",

    content: analysis,

    timestamp: ts,

  });

}



function mapSessionRows(

  rows: Awaited<ReturnType<typeof getMessages>>

): { id: string; role: "user" | "assistant"; content: string; timestamp: string }[] {

  return rows.map((row, i) => ({

    id: `db-${i}-${row.role}`,

    role: row.role as "user" | "assistant",

    content: row.content,

    timestamp: new Date().toISOString(),

  }));

}



export async function GET(request: NextRequest) {

  const auth = await requireUserAuth();

  if (!auth) {

    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  }



  const sessionId = request.nextUrl.searchParams.get("sessionId");

  const characterId = request.nextUrl.searchParams.get("characterId");

  const cardsKey = request.nextUrl.searchParams.get("cardsKey");



  if (!characterId) {

    return NextResponse.json({ error: "characterId required" }, { status: 400 });

  }



  if (!(await ensureDb())) {

    return NextResponse.json({ messages: [] });

  }



  const messages: { id: string; role: "user" | "assistant"; content: string; timestamp: string }[] =

    [];



  const profileUserId = await getProfileUserIdForAccount(auth.sub);

  const readings = profileUserId ? await getUserReadingHistory(profileUserId) : [];



  const photoEntry = profileUserId ? findHistoryPhotoReading(readings, characterId) : undefined;

  if (photoEntry) {

    appendPhotoReadingFromHistory(messages, photoEntry);

    return NextResponse.json({ messages });

  }



  const spreadReading = findHistoryReading(readings, characterId, cardsKey);



  if (cardsKey) {

    let sessionRows: Awaited<ReturnType<typeof getMessages>> = [];

    if (sessionId) {

      const session = await getSession(sessionId);

      if (session) {

        sessionRows = await getMessages(sessionId, characterId);

      }

    }



    if (

      spreadReading &&

      sessionRows.length > 0 &&

      sessionMatchesSpreadReading(

        sessionRows,

        spreadReading.context_data.reading as string

      )

    ) {

      return NextResponse.json({ messages: mapSessionRows(sessionRows) });

    }



    if (spreadReading) {

      messages.push({

        id: randomUUID(),

        role: "assistant",

        content: spreadReading.context_data.reading as string,

        timestamp: new Date(spreadReading.created_at).toISOString(),

      });

    }



    return NextResponse.json({ messages });

  }



  if (sessionId) {

    const session = await getSession(sessionId);

    if (session) {

      const rows = await getMessages(sessionId, characterId);

      for (const row of mapSessionRows(rows)) {

        messages.push(row);

      }

    }

  }



  if (messages.length === 0 && spreadReading) {

    messages.push({

      id: randomUUID(),

      role: "assistant",

      content: spreadReading.context_data.reading as string,

      timestamp: new Date(spreadReading.created_at).toISOString(),

    });

  } else if (messages.length > 0 && !hasSpreadReading(messages) && spreadReading) {

    messages.unshift({

      id: randomUUID(),

      role: "assistant",

      content: spreadReading.context_data.reading as string,

      timestamp: new Date(spreadReading.created_at).toISOString(),

    });

  }



  return NextResponse.json({ messages });

}

