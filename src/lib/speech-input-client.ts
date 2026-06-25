export type SpeechInputPhase = "idle" | "listening" | "transcribing";

export type SpeechRecognitionErrorCode =
  | "aborted"
  | "audio-capture"
  | "bad-grammar"
  | "language-not-supported"
  | "network"
  | "no-speech"
  | "not-allowed"
  | "service-not-allowed";

export function isSecureSpeechContext(): boolean {
  if (typeof window === "undefined") return false;
  return window.isSecureContext;
}

export function getSpeechRecognitionCtor():
  | (new () => SpeechRecognition)
  | null {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

export function isBrowserSpeechRecognitionSupported(): boolean {
  return getSpeechRecognitionCtor() != null;
}

export function mapSpeechRecognitionError(code: string): string {
  switch (code as SpeechRecognitionErrorCode) {
    case "not-allowed":
    case "service-not-allowed":
      return "Нет доступа к микрофону. Разрешите микрофон в настройках браузера.";
    case "no-speech":
      return "Речь не распознана. Попробуйте ещё раз и говорите ближе к микрофону.";
    case "network":
      return "Браузерный распознаватель недоступен — переключаюсь на серверное распознавание…";
    case "audio-capture":
      return "Микрофон не найден или занят другим приложением.";
    case "language-not-supported":
      return "Русский язык не поддерживается в этом браузере.";
    case "aborted":
      return "Запись прервана.";
    default:
      return "Не удалось распознать речь. Попробуйте ещё раз.";
  }
}

export function pickMediaRecorderMimeType(): string {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
  ];
  for (const type of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return "audio/webm";
}

export async function ensureMicrophoneAccess(): Promise<void> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Запись с микрофона не поддерживается в этом браузере.");
  }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  for (const track of stream.getTracks()) track.stop();
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Не удалось прочитать аудио"));
        return;
      }
      const base64 = result.includes(",") ? result.split(",")[1]! : result;
      resolve(base64);
    };
    reader.onerror = () => reject(new Error("Не удалось прочитать аудио"));
    reader.readAsDataURL(blob);
  });
}

export function insecureContextMessage(): string {
  return "Голосовой ввод доступен только по HTTPS или на localhost. Откройте сайт по защищённому адресу или используйте localhost.";
}
