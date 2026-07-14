export type AppShellHomeNavHandlers = {
  goHome: () => void;
  openPhotoReading: () => void;
  openDecksModal: () => void;
  openRitualFlow: () => void;
  scrollToSection: (sectionId: string) => void;
};

let handlers: Partial<AppShellHomeNavHandlers> = {};

export function registerAppShellHomeNavHandlers(
  next: Partial<AppShellHomeNavHandlers>
): () => void {
  handlers = { ...handlers, ...next };
  return () => {
    for (const key of Object.keys(next) as (keyof AppShellHomeNavHandlers)[]) {
      if (handlers[key] === next[key]) {
        delete handlers[key];
      }
    }
  };
}

export function getAppShellHomeNavHandlers(): Partial<AppShellHomeNavHandlers> {
  return handlers;
}
