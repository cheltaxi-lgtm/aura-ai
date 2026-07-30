import { renderReadingPageImage } from "./reading-page.js";

type Entry = {
  pages: string[];
  footer?: string;
  buffers: Map<number, Buffer>;
  inflight: Map<number, Promise<Buffer>>;
  updatedAt: number;
};

const TTL_MS = 30 * 60 * 1000;
const MAX_USERS = 40;
const store = new Map<number, Entry>();

function touch(tid: number, entry: Entry): void {
  entry.updatedAt = Date.now();
  store.delete(tid);
  store.set(tid, entry);
  while (store.size > MAX_USERS) {
    const oldest = store.keys().next().value;
    if (oldest === undefined) break;
    store.delete(oldest);
  }
}

function getEntry(tid: number): Entry | null {
  const e = store.get(tid);
  if (!e) return null;
  if (Date.now() - e.updatedAt > TTL_MS) {
    store.delete(tid);
    return null;
  }
  return e;
}

export function bindReadingPageCache(
  tid: number,
  pages: string[],
  footer?: string
): void {
  const prev = getEntry(tid);
  const same =
    prev &&
    prev.footer === footer &&
    prev.pages.length === pages.length &&
    prev.pages.every((p, i) => p === pages[i]);
  if (same && prev) {
    touch(tid, prev);
    return;
  }
  touch(tid, {
    pages: [...pages],
    footer,
    buffers: new Map(),
    inflight: new Map(),
    updatedAt: Date.now(),
  });
}

export function putReadingPageBuffer(tid: number, page: number, buf: Buffer): void {
  const e = getEntry(tid);
  if (!e) return;
  e.buffers.set(page, buf);
  e.inflight.delete(page);
  touch(tid, e);
}

async function renderOne(e: Entry, page: number): Promise<Buffer> {
  const hit = e.buffers.get(page);
  if (hit) return hit;
  const pending = e.inflight.get(page);
  if (pending) return pending;

  const job = renderReadingPageImage({
    bodyHtmlOrText: (() => {
      const body = e.pages[page] || "";
      if (e.footer && page === e.pages.length - 1) {
        return `${body}\n\n${e.footer}`.trim();
      }
      return body;
    })(),
    page,
    total: e.pages.length,
  }).then((buf) => {
    e.buffers.set(page, buf);
    e.inflight.delete(page);
    return buf;
  });
  e.inflight.set(page, job);
  return job;
}

/** Get a page image — from memory cache when possible. */
export async function getReadingPageBuffer(tid: number, page: number): Promise<Buffer> {
  const e = getEntry(tid);
  if (!e) {
    throw new Error("reading_page_cache_miss");
  }
  const idx = Math.min(Math.max(0, page), Math.max(0, e.pages.length - 1));
  const buf = await renderOne(e, idx);
  touch(tid, e);
  return buf;
}

/** After page 0 is sent — bake the rest in background so ‹ › is instant. */
export function prefetchReadingPages(tid: number): void {
  const e = getEntry(tid);
  if (!e || e.pages.length <= 1) return;
  void Promise.all(
    e.pages.map((_, i) => (e.buffers.has(i) ? Promise.resolve() : renderOne(e, i)))
  ).catch((err) => console.warn("[reading-page-cache] prefetch failed", err));
}
