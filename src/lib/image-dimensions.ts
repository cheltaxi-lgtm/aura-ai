/** Best-effort width/height from base64 image bytes (JPEG/PNG). */
export function getImageDimensionsFromBase64(
  imageBase64: string,
  mimeType?: string
): { width: number; height: number } | null {
  try {
    const buf = Buffer.from(imageBase64.replace(/^data:[^;]+;base64,/, ""), "base64");
    if (buf.length < 24) return null;

    const isPng = mimeType?.includes("png") || buf[0] === 0x89;
    if (isPng) {
      return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    }

    if (buf[0] === 0xff && buf[1] === 0xd8) {
      let offset = 2;
      while (offset + 8 < buf.length) {
        if (buf[offset] !== 0xff) break;
        const marker = buf[offset + 1];
        const segmentLength = buf.readUInt16BE(offset + 2);
        if (segmentLength < 2) break;
        if (marker === 0xc0 || marker === 0xc2) {
          return {
            height: buf.readUInt16BE(offset + 5),
            width: buf.readUInt16BE(offset + 7),
          };
        }
        offset += 2 + segmentLength;
      }
    }
  } catch {
    return null;
  }
  return null;
}

export function isLandscapePhotoBase64(imageBase64: string, mimeType?: string): boolean {
  const dims = getImageDimensionsFromBase64(imageBase64, mimeType);
  if (!dims) return false;
  return dims.width > dims.height * 1.05;
}
