import { registerPlugin } from "@capacitor/core";

export interface AppUpdateProgressEvent {
  percent: number;
}

export interface AppUpdatePlugin {
  downloadAndInstall(options: { url: string }): Promise<void>;
  installApk(options: { uri: string }): Promise<void>;
  openPlayStore(options: { url: string }): Promise<void>;
  openAppDetails(): Promise<void>;
  openExternalUrl(options: { url: string }): Promise<void>;
  getInstalledCertSha256(): Promise<{ sha256: string }>;
  addListener(
    eventName: "downloadProgress",
    listenerFunc: (event: AppUpdateProgressEvent) => void
  ): Promise<{ remove: () => void }>;
}

export const AppUpdateNative = registerPlugin<AppUpdatePlugin>("AppUpdate");
