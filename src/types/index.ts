export interface Character {
  id: string;
  name: string;
  title: string;
  specialty: string;
  style: string;
  emoji: string;
  gradient: string;
  glowColor: string;
  borderColor: string;
  priceFrom: string;
  /** Только реальные метрики из БД; для AI-мастеров не задаётся */
  rating?: number;
  sessions?: string;
  /** Divination deck system for this master */
  system: import("@/lib/decks/types").DeckSystem;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  audioUrl?: string;
  sceneImageUrl?: string;
  /** Numerology UI attachments (e.g. Pythagoras square grid). */
  numerologyUi?: {
    pythagorasSquare?: import("@/lib/numerology/pythagoras-square").PythagorasSquareResult;
  };
}

export interface ChatState {
  characterId: string | null;
  messages: Message[];
  questionCount: number;
  isLoading: boolean;
}
