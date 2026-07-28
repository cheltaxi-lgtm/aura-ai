export type GuestSymbol = {
  id: number;
  name: string;
  position: number;
  reversed: boolean;
  deck_id?: string;
  spread_id?: string;
  slug?: string;
};

export type TarotCardDef = {
  id: number;
  name: string;
  meaning: string;
  slug: string;
};

export type DrawnCard = GuestSymbol & {
  meaning: string;
  slug: string;
  positionLabel: string;
};

export interface DeckProvider {
  drawTriplet(): DrawnCard[];
  drawOne(): DrawnCard;
  getCard(id: number): TarotCardDef | undefined;
}
