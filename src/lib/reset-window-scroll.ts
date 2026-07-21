/** Reset document scroll — used when soft-navigating without a pathname change. */
export function resetWindowScroll(): void {
  if (typeof window === "undefined") return;
  const html = document.documentElement;
  const previous = html.style.scrollBehavior;
  html.style.scrollBehavior = "auto";
  window.scrollTo(0, 0);
  html.scrollTop = 0;
  document.body.scrollTop = 0;
  // Nested app shells / iOS WebView occasionally keep a different scroller.
  const root = document.scrollingElement;
  if (root && root !== html && root !== document.body) {
    root.scrollTop = 0;
  }
  html.style.scrollBehavior = previous;
}

/** Reset now and again after layout/paint (session lists grow after fetch). */
export function resetWindowScrollSoon(): void {
  resetWindowScroll();
  if (typeof window === "undefined") return;
  window.requestAnimationFrame(() => {
    resetWindowScroll();
    window.setTimeout(resetWindowScroll, 0);
    window.setTimeout(resetWindowScroll, 50);
    window.setTimeout(resetWindowScroll, 200);
  });
}
