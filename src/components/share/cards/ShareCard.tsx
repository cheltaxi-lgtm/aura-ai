"use client";

import type { ShareCardAspect } from "@/lib/share/card-layout";
import type { SharePayload } from "@/lib/share/types";
import ShareCardReading from "./ShareCardReading";
import ShareCardDaily from "./ShareCardDaily";
import ShareCardTriplet from "./ShareCardTriplet";
import ShareCardRitual from "./ShareCardRitual";
import ShareCardJoint from "./ShareCardJoint";

interface Props {
  payload: SharePayload;
  aspect?: ShareCardAspect;
}

export default function ShareCard({ payload, aspect = "story" }: Props) {
  switch (payload.kind) {
    case "daily":
      return <ShareCardDaily payload={payload} aspect={aspect} />;
    case "triplet":
      return <ShareCardTriplet payload={payload} aspect={aspect} />;
    case "ritual":
      return <ShareCardRitual payload={payload} aspect={aspect} />;
    case "joint":
      return <ShareCardJoint payload={payload} aspect={aspect} />;
    case "reading":
    case "session":
    default:
      return <ShareCardReading payload={payload} aspect={aspect} />;
  }
}
