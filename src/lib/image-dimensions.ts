/** Best-effort width/height from base64 image bytes (JPEG/PNG), EXIF-aware for JPEG. */
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
      let sofWidth = 0;
      let sofHeight = 0;
      let exifOrientation: number | null = null;

      while (offset + 8 < buf.length) {
        if (buf[offset] !== 0xff) break;
        const marker = buf[offset + 1];
        if (marker === 0xd9 || marker === 0xda) break;

        const segmentLength = buf.readUInt16BE(offset + 2);
        if (segmentLength < 2) break;

        if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
          sofHeight = buf.readUInt16BE(offset + 5);
          sofWidth = buf.readUInt16BE(offset + 7);
          if (sofWidth && sofHeight) break;
        }

        // APP1 — may contain EXIF Orientation
        if (marker === 0xe1 && exifOrientation == null) {
          exifOrientation = readJpegExifOrientation(buf, offset + 4, segmentLength - 2);
        }

        offset += 2 + segmentLength;
      }

      if (!sofWidth || !sofHeight) return null;

      // Orientations 5–8 swap display width/height relative to SOF.
      if (exifOrientation != null && exifOrientation >= 5 && exifOrientation <= 8) {
        return { width: sofHeight, height: sofWidth };
      }
      return { width: sofWidth, height: sofHeight };
    }
  } catch {
    return null;
  }
  return null;
}

function readJpegExifOrientation(buf: Buffer, start: number, length: number): number | null {
  try {
    if (start + 6 > buf.length) return null;
    if (buf.toString("ascii", start, start + 4) !== "Exif") return null;

    const tiffStart = start + 6;
    if (tiffStart + 8 > buf.length) return null;

    const little = buf.toString("ascii", tiffStart, tiffStart + 2) === "II";
    const readU16 = (off: number) =>
      little ? buf.readUInt16LE(off) : buf.readUInt16BE(off);
    const readU32 = (off: number) =>
      little ? buf.readUInt32LE(off) : buf.readUInt32BE(off);

    const ifd0 = tiffStart + readU32(tiffStart + 4);
    if (ifd0 + 2 > buf.length || ifd0 < tiffStart) return null;

    const entryCount = readU16(ifd0);
    const end = Math.min(buf.length, start + length + 4);

    for (let i = 0; i < entryCount; i++) {
      const entry = ifd0 + 2 + i * 12;
      if (entry + 12 > end) break;
      const tag = readU16(entry);
      if (tag === 0x0112) {
        const value = readU16(entry + 8);
        if (value >= 1 && value <= 8) return value;
        return null;
      }
    }
  } catch {
    return null;
  }
  return null;
}

/** True when the displayed frame is wider than tall (horizontal phone / row of cards). */
export function isLandscapePhotoBase64(imageBase64: string, mimeType?: string): boolean {
  const dims = getImageDimensionsFromBase64(imageBase64, mimeType);
  if (!dims) return false;
  return dims.width > dims.height * 1.05;
}

/** Mildly wide or square frames still trigger the horizontal-row reversed bug. */
export function isWideOrSquarePhotoBase64(imageBase64: string, mimeType?: string): boolean {
  const dims = getImageDimensionsFromBase64(imageBase64, mimeType);
  if (!dims) return false;
  return dims.width >= dims.height * 0.92;
}
