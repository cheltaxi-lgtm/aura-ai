/** Light haptic feedback in the native app shell (no-op on web). */
export type AppHapticStyle = "light" | "medium" | "heavy";

export async function triggerAppHaptic(style: AppHapticStyle = "light"): Promise<void> {
  try {
    const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
    const map = {
      light: ImpactStyle.Light,
      medium: ImpactStyle.Medium,
      heavy: ImpactStyle.Heavy,
    } as const;
    await Haptics.impact({ style: map[style] });
  } catch {
    /* web or plugin unavailable */
  }
}
