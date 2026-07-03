/** Full mystic room scene — card zone aligned to the carved table top (571×1024). */

export const MYSTIC_TABLE_SCENE = {
  src: "/decor/mystic-table.jpg",
  width: 571,
  height: 1024,
  /** Interactive area on the wooden table (avoid books & props). */
  cardsZone: {
    left: 0.185,
    top: 0.435,
    width: 0.645,
    height: 0.265,
  },
} as const;
