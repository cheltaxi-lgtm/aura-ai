/** Resize/compress a photo in-browser before upload (keeps payloads small for nginx + vision LLM). */
export async function compressImageForUpload(
  file: File,
  opts?: { maxWidth?: number; maxHeight?: number; quality?: number; maxBytes?: number }
): Promise<{ base64: string; mimeType: string; blob: Blob }> {
  const maxWidth = opts?.maxWidth ?? 1920;
  const maxHeight = opts?.maxHeight ?? 1920;
  const initialQuality = opts?.quality ?? 0.8;
  const maxBytes = opts?.maxBytes ?? 2_500_000;

  let imageEl: HTMLImageElement | null = null;

  try {
    imageEl = await loadImageElement(file);
  } catch (err) {
    throw new Error("image_load_failed");
  }

  const srcW = imageEl.naturalWidth || 1;
  const srcH = imageEl.naturalHeight || 1;
  const scale = Math.min(1, maxWidth / srcW, maxHeight / srcH);
  let drawW = Math.max(1, Math.round(srcW * scale));
  let drawH = Math.max(1, Math.round(srcH * scale));

  const canvas = document.createElement("canvas");
  const draw = () => {
    canvas.width = drawW;
    canvas.height = drawH;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas_unavailable");
    ctx.drawImage(imageEl!, 0, 0, drawW, drawH);
  };

  draw();
  let blob: Blob | null = null;

  for (let shrink = 0; shrink < 8; shrink++) {
    let quality = initialQuality;
    for (let i = 0; i < 6; i++) {
      blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
      if (!blob || blob.size <= maxBytes) break;
      quality = Math.max(0.55, quality - 0.08);
    }
    if (blob && blob.size <= maxBytes) break;
    drawW = Math.max(640, Math.round(drawW * 0.85));
    drawH = Math.max(640, Math.round(drawH * 0.85));
    draw();
  }

  if (!blob) throw new Error("compress_failed");
  if (blob.size > maxBytes) throw new Error("compress_too_large");

  const base64 = await blobToBase64(blob);
  return { base64, mimeType: "image/jpeg", blob };
}

function loadImageElement(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    let settled = false;
    
    const cleanup = () => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
    };

    img.onload = () => {
      cleanup();
      resolve(img);
    };
    img.onerror = () => {
      cleanup();
      reject(new Error("image_load_failed"));
    };
    
    // Safety timeout: if image doesn't load in 15 seconds, reject
    setTimeout(() => {
      if (!settled) {
        cleanup();
        reject(new Error("image_load_timeout"));
      }
    }, 15000);

    img.src = url;
  });
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const part = result.split(",")[1];
      if (!part) reject(new Error("read_failed"));
      else resolve(part);
    };
    reader.onerror = () => reject(reader.error ?? new Error("read_failed"));
    reader.readAsDataURL(blob);
  });
}

export function blobFromBase64(base64: string, mimeType: string): Blob {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

/** Re-compress an already-encoded JPEG blob (used right before upload). */
export async function compressBlobToLimit(
  blob: Blob,
  opts?: { maxWidth?: number; maxHeight?: number; quality?: number; maxBytes?: number }
): Promise<{ base64: string; mimeType: string; blob: Blob }> {
  const file = new File([blob], "upload.jpg", { type: blob.type || "image/jpeg" });
  return compressImageForUpload(file, opts);
}
