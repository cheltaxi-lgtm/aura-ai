import type { IncomingMessage } from "node:http";

/** Trusted internal endpoints still need bounded memory for malformed requests. */
export function readInternalBody(req: IncomingMessage, maximumBytes = 256 * 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let bytes = 0;
    let rejected = false;
    req.on("data", (chunk) => {
      if (rejected) return;
      const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      bytes += data.length;
      if (bytes > maximumBytes) {
        rejected = true;
        chunks.length = 0;
        reject(new Error("body_too_large"));
      } else chunks.push(data);
    });
    req.on("end", () => { if (!rejected) resolve(Buffer.concat(chunks).toString("utf8")); });
    req.on("error", reject);
    req.on("aborted", () => reject(new Error("request_aborted")));
  });
}
