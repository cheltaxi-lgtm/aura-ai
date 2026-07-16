/**
 * Shared helpers for Android release integrity (APK ↔ android-version.json).
 * Used by publish/verify/sync scripts — keep dependency-free (Node builtins only).
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

export const APK_FILENAME = "zovus-latest.apk";
export const MANIFEST_FILENAME = "android-version.json";

export function releasesDir(root) {
  return path.join(root, "public/releases");
}

export function apkPath(root) {
  return path.join(releasesDir(root), APK_FILENAME);
}

export function manifestPath(root) {
  return path.join(releasesDir(root), MANIFEST_FILENAME);
}

export function gradlePath(root) {
  return path.join(root, "mobile/android/app/build.gradle");
}

export function sha256File(file) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(file));
  return hash.digest("hex");
}

export function readGradleVersion(root) {
  try {
    const text = fs.readFileSync(gradlePath(root), "utf8");
    const versionCode = Number.parseInt(text.match(/versionCode\s+(\d+)/)?.[1] ?? "", 10);
    const versionName = text.match(/versionName\s+"([^"]+)"/)?.[1]?.trim() ?? "";
    if (!Number.isFinite(versionCode) || versionCode < 1 || !versionName) return null;
    return { versionCode, versionName };
  } catch {
    return null;
  }
}

export function readManifest(root) {
  try {
    const raw = JSON.parse(fs.readFileSync(manifestPath(root), "utf8"));
    const versionCode = Number.parseInt(String(raw.versionCode ?? ""), 10);
    const versionName = typeof raw.versionName === "string" ? raw.versionName.trim() : "";
    if (!Number.isFinite(versionCode) || versionCode < 1 || !versionName) return null;
    return {
      versionCode,
      versionName,
      builtAt: typeof raw.builtAt === "string" ? raw.builtAt : undefined,
      apkFile: typeof raw.apkFile === "string" ? raw.apkFile : APK_FILENAME,
      apkSha256: typeof raw.apkSha256 === "string" ? raw.apkSha256.toLowerCase() : undefined,
      apkBytes:
        typeof raw.apkBytes === "number" && Number.isFinite(raw.apkBytes)
          ? raw.apkBytes
          : Number.parseInt(String(raw.apkBytes ?? ""), 10) || undefined,
    };
  } catch {
    return null;
  }
}

export function writeManifest(root, data) {
  const out = {
    versionCode: data.versionCode,
    versionName: data.versionName,
    builtAt: data.builtAt ?? new Date().toISOString(),
    apkFile: data.apkFile ?? APK_FILENAME,
    apkSha256: data.apkSha256,
    apkBytes: data.apkBytes,
  };
  fs.mkdirSync(releasesDir(root), { recursive: true });
  fs.writeFileSync(manifestPath(root), `${JSON.stringify(out, null, 2)}\n`);
  return out;
}

export function writeGradleVersion(root, versionCode, versionName) {
  const file = gradlePath(root);
  const text = fs.readFileSync(file, "utf8");
  const next = text
    .replace(/versionCode\s+\d+/, `versionCode ${versionCode}`)
    .replace(/versionName\s+"[^"]+"/, `versionName "${versionName}"`);
  fs.writeFileSync(file, next);
}

function findAapt() {
  const home = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || "/opt/android-sdk";
  const buildTools = path.join(home, "build-tools");
  if (!fs.existsSync(buildTools)) return null;
  const versions = fs
    .readdirSync(buildTools)
    .filter((name) => fs.existsSync(path.join(buildTools, name, "aapt")))
    .sort();
  if (!versions.length) return null;
  return path.join(buildTools, versions[versions.length - 1], "aapt");
}

/** Probe versionCode/versionName from a signed/unsigned APK via aapt (optional). */
export function probeApkVersion(file) {
  if (!fs.existsSync(file)) return null;
  const aapt = findAapt();
  if (!aapt) return null;
  try {
    const out = execFileSync(aapt, ["dump", "badging", file], {
      encoding: "utf8",
      maxBuffer: 2 * 1024 * 1024,
    });
    const line = out.split("\n").find((l) => l.startsWith("package:")) ?? "";
    const versionCode = Number.parseInt(line.match(/versionCode='(\d+)'/)?.[1] ?? "", 10);
    const versionName = line.match(/versionName='([^']+)'/)?.[1]?.trim() ?? "";
    if (!Number.isFinite(versionCode) || versionCode < 1 || !versionName) return null;
    return { versionCode, versionName };
  } catch {
    return null;
  }
}

/**
 * Resolve the version that is actually downloadable.
 * APK file (+ integrity) wins over env/gradle claims.
 */
export function resolveDownloadableRelease(root) {
  const apk = apkPath(root);
  const manifest = readManifest(root);
  const apkExists = fs.existsSync(apk);

  if (!apkExists) {
    return {
      ok: false,
      reason: "missing_apk",
      versionCode: null,
      versionName: null,
      apkPath: apk,
      manifest,
    };
  }

  const st = fs.statSync(apk);
  const hash = sha256File(apk);
  const probed = probeApkVersion(apk);

  if (manifest?.apkSha256) {
    const hashOk = hash === manifest.apkSha256;
    const sizeOk = !manifest.apkBytes || manifest.apkBytes === st.size;
    if (hashOk && sizeOk) {
      // Prefer aapt if present and disagrees — never trust a lying sidecar.
      if (probed && probed.versionCode !== manifest.versionCode) {
        return {
          ok: false,
          reason: "manifest_apk_version_mismatch",
          versionCode: probed.versionCode,
          versionName: probed.versionName,
          apkPath: apk,
          apkSha256: hash,
          apkBytes: st.size,
          manifest,
          probed,
        };
      }
      return {
        ok: true,
        reason: "integrity_ok",
        versionCode: manifest.versionCode,
        versionName: manifest.versionName,
        apkPath: apk,
        apkSha256: hash,
        apkBytes: st.size,
        manifest,
        probed,
      };
    }
    return {
      ok: false,
      reason: "hash_mismatch",
      versionCode: probed?.versionCode ?? null,
      versionName: probed?.versionName ?? null,
      apkPath: apk,
      apkSha256: hash,
      apkBytes: st.size,
      manifest,
      probed,
    };
  }

  // Legacy manifest without hash — trust aapt, else refuse to invent.
  if (probed) {
    const matchesManifest = manifest && probed.versionCode === manifest.versionCode;
    return {
      ok: Boolean(matchesManifest),
      reason: matchesManifest ? "aapt_matches_manifest" : "legacy_no_hash",
      versionCode: probed.versionCode,
      versionName: probed.versionName,
      apkPath: apk,
      apkSha256: hash,
      apkBytes: st.size,
      manifest,
      probed,
    };
  }

  if (manifest) {
    return {
      ok: false,
      reason: "unverified_legacy_manifest",
      versionCode: manifest.versionCode,
      versionName: manifest.versionName,
      apkPath: apk,
      apkSha256: hash,
      apkBytes: st.size,
      manifest,
      probed: null,
    };
  }

  return {
    ok: false,
    reason: "unreadable",
    versionCode: null,
    versionName: null,
    apkPath: apk,
    apkSha256: hash,
    apkBytes: st.size,
    manifest: null,
    probed: null,
  };
}
