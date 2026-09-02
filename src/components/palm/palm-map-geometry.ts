import type { PalmLineKey, PalmLineLength, PalmMountKey } from "@/lib/palm-constants";

export interface PalmLineGeometry {
  d: string;
  forkD: Record<PalmLineLength, string>;
}

export interface PalmMountGeometry {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  rotate?: number;
}

/** Native dimensions of the approved photorealistic right-palm asset. */
export const PALM_MAP_VB = { w: 1024, h: 1536 };

/** Classical lines registered directly to the photographed palm. */
export const PALM_MAP_LINES: Record<PalmLineKey, PalmLineGeometry> = {
  heart: {
    d: "M230 705 C338 699 441 664 543 613 C610 580 665 570 716 586",
    forkD: {
      short: "M450 660 C475 640 494 616 507 588",
      medium: "M577 598 C604 577 624 551 638 520",
      long: "M676 575 C704 552 725 525 739 493",
    },
  },
  head: {
    d: "M725 652 C630 691 531 724 428 742 C351 756 293 768 250 783",
    forkD: {
      short: "M523 726 C499 700 480 672 467 641",
      medium: "M382 751 C352 725 328 695 310 661",
      long: "M294 771 C264 743 239 710 221 675",
    },
  },
  life: {
    d: "M736 628 C650 676 603 779 617 883 C629 967 602 1018 557 1055",
    forkD: {
      short: "M611 807 C639 827 661 851 678 880",
      medium: "M618 930 C646 951 666 978 679 1009",
      long: "M570 1044 C581 1074 598 1099 622 1121",
    },
  },
  fate: {
    d: "M505 1025 C503 932 493 831 474 742 C466 691 473 642 491 605",
    forkD: {
      short: "M498 882 C470 855 449 825 435 791",
      medium: "M476 754 C448 728 427 697 413 663",
      long: "M485 626 C457 598 436 566 423 531",
    },
  },
};

/** Soft interactive territories aligned to the real thenar, pads and outer palm. */
export const PALM_MAP_MOUNTS: Record<PalmMountKey, PalmMountGeometry> = {
  venus: { cx: 746, cy: 842, rx: 143, ry: 224, rotate: -16 },
  jupiter: { cx: 676, cy: 562, rx: 78, ry: 68 },
  saturn: { cx: 518, cy: 528, rx: 72, ry: 65 },
  apollo: { cx: 357, cy: 545, rx: 69, ry: 62 },
  mercury: { cx: 218, cy: 593, rx: 65, ry: 61 },
  mars: { cx: 494, cy: 781, rx: 104, ry: 96 },
  luna: { cx: 276, cy: 932, rx: 101, ry: 176, rotate: -8 },
};
