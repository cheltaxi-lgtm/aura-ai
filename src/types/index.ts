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
  rating: number;
  sessions: string;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  audioUrl?: string;
  sceneImageUrl?: string;
}

export interface ChatState {
  characterId: string | null;
  messages: Message[];
  questionCount: number;
  isLoading: boolean;
}
