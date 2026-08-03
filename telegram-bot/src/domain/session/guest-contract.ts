/**
 * Canonical guest-triplet contract shared with aura-ai site fingerprint.
 * system string must equal site DeckSystem "tarot-veronika".
 */
export const GUEST_SYSTEM = "tarot-veronika" as const;
export const GUEST_MASTER_ID = "veronika" as const;
export const GUEST_SPREAD_ID = "triplet" as const;
/** Sessions created with this schema are claimable on the site. */
export const GUEST_SCHEMA_VERSION = 1;

export type SiteGuestSymbol = {
  id: number;
  name: string;
  position: number;
  reversed: boolean;
};

export function toSiteGuestSymbols(
  cards: Array<{ id: number; name: string; position: number; reversed: boolean }>
): SiteGuestSymbol[] {
  return cards.map((c) => ({
    id: c.id,
    name: c.name,
    position: c.position,
    reversed: c.reversed,
  }));
}
