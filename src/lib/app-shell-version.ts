export type AndroidReleaseInfo = {
  versionCode: number;
  versionName: string;
  minVersionCode: number;
  apkUrl: string;
  releaseNotes: string;
};

export async function fetchAndroidReleaseInfo(): Promise<AndroidReleaseInfo | null> {
  try {
    const res = await fetch("/api/app/android-version", { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as AndroidReleaseInfo;
  } catch {
    return null;
  }
}
