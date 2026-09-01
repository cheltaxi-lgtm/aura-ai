import type { PalmLineKey, PalmMountKey } from "@/lib/palm-constants";

/** Right palm facing the viewer, fingers up, thumb on the right. Left is a scaleX flip. */
export const PALM_MAP_VB = { w: 240, h: 340 };

export const PALM_MAP_OUTLINE =
  "M78 328 C62 300 54 268 50 232 C46 198 44 168 40 138 C36 112 28 88 32 68 C36 50 52 44 64 52 C74 58 78 78 80 98 C78 78 76 48 86 30 C96 12 114 12 122 28 C128 42 126 70 124 96 C126 68 128 32 140 16 C152 2 170 6 176 24 C182 40 176 72 170 100 C176 78 186 46 200 34 C214 22 230 32 228 52 C226 72 212 100 198 124 C214 128 232 148 236 176 C240 204 228 228 206 236 C190 242 176 230 170 214 C176 250 182 286 176 328 C154 336 100 336 78 328 Z";

export const PALM_MAP_LINES: Record<PalmLineKey, { d: string; color: string }> = {
  life: {
    d: "M186 142 C168 168 148 210 138 248 C128 278 118 304 108 322",
    color: "#e8a87c",
  },
  head: {
    d: "M176 158 C140 168 100 172 62 178",
    color: "#b8c8e6",
  },
  heart: {
    d: "M192 116 C150 108 100 112 56 126",
    color: "#e08a8a",
  },
  fate: {
    d: "M120 316 C128 260 138 190 150 118",
    color: "#d4b06a",
  },
};

export const PALM_MAP_MOUNTS: Record<PalmMountKey, { cx: number; cy: number }> = {
  venus: { cx: 158, cy: 228 },
  jupiter: { cx: 196, cy: 126 },
  saturn: { cx: 156, cy: 108 },
  apollo: { cx: 118, cy: 108 },
  mercury: { cx: 72, cy: 120 },
  mars: { cx: 108, cy: 176 },
  luna: { cx: 72, cy: 248 },
};
