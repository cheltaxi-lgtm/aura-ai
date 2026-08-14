import type { UserFact } from "@/lib/memory/user-facts";
import type { MemoryDepth } from "@/lib/memory/memory-budget";

export type GoldenFact = {
  id: string;
  fact: string;
  predicateKey: string;
  entityKey?: string | null;
  status: "active" | "superseded";
  archiveTier: "hot" | "warm" | "archived";
  eventDate?: string | null;
  captureTier: "draft" | "durable" | "user_confirmed";
  sourceType: "user" | "chat" | "profile";
  sourceCharacter?: string | null;
  salience: number;
  category: string;
  evidenceQuote: string;
  sensitivity: "normal" | "sensitive";
  subjectKey?: string;
  markers: string[];
  critical?: boolean;
  manual?: boolean;
};

export type CaptureTurn = {
  userMessage: string;
  assistantReply?: string;
  goldFacts: GoldenFact[];
  /** Extra model rows that must be dropped (predictions, ungrounded). */
  contamination?: Array<{
    fact: string;
    evidenceQuote: string;
    predicateKey?: string;
  }>;
};

export type RetrievalQuery = {
  id: string;
  query: string;
  product?: string;
  depth?: MemoryDepth;
  characterId?: string;
  mustInclude: string[];
  optional?: string[];
  mustNotInclude: string[];
  expectArchivedRecovery?: boolean;
  expectCurrentNot?: string[];
  critical?: boolean;
  manual?: boolean;
  entity?: boolean;
  timeline?: boolean;
  archived?: boolean;
  crossMaster?: boolean;
  crossProduct?: boolean;
  irrelevance?: boolean;
};

export type GoldenScenario = {
  id: string;
  category: string;
  turns: CaptureTurn[];
  memory: GoldenFact[];
  queries: RetrievalQuery[];
};

export type CaptureRow = {
  scenarioId: string;
  gold: number;
  extracted: number;
  matched: number;
  falseFacts: number;
  missed: number;
  wrongEntity: number;
  wrongPredicate: number;
  wrongDate: number;
  predictionContamination: number;
  entityGold: number;
  entityHit: number;
  dateGold: number;
  dateHit: number;
  predicateGold: number;
  predicateHit: number;
  sensitiveGold: number;
  sensitiveCorrect: number;
};

export type RetrievalRow = {
  scenarioId: string;
  queryId: string;
  must: number;
  mustHit: number;
  mustNot: number;
  mustNotViolations: number;
  optional: number;
  optionalHit: number;
  criticalMiss: number;
  manualMust: number;
  manualHit: number;
  manualMiss: number;
  entityMiss: number;
  timelineMiss: number;
  archivedMiss: number;
  irrelevantHits: number;
  chars: number;
  selected: number;
  candidates: number;
  droppedRelevant: number;
  securityPreserved: boolean;
  ms: number;
};

export type QualityFailure = {
  gate: string;
  detail: string;
};

export type MemoryStore = UserFact[];
