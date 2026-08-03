export type TtsResult =
  | { ok: true; ogg: Buffer; durationSec: number }
  | { ok: false; reason: string };

export interface TtsProvider {
  synthesize(text: string): Promise<TtsResult>;
}
