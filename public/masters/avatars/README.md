# Master avatar assets

Unified portrait slots for Aura masters. Drop final artwork as WebP without code changes.

## Files per master

| Master ID | Portrait | Thumb | Final art slot |
|-----------|----------|-------|----------------|
| `ragnar` | `ragnar.svg` | `ragnar-thumb.svg` | `ragnar.webp` (400×520) |
| `veronika` | `veronika.svg` | `veronika-thumb.svg` | `veronika.webp` |
| `agafya` | `agafya.svg` | `agafya-thumb.svg` | `agafya.webp` |
| `shri-raj` | `shri-raj.svg` | `shri-raj-thumb.svg` | `shri-raj.webp` |
| `gadalka_marina` | `marina.svg` | `marina-thumb.svg` | `marina.webp` |

Art direction for each master is documented in `src/data/master-avatars.ts`.

## Regenerate SVG placeholders

```bash
npm run generate:avatars
```

## Style guide

- Same portrait crop (head + shoulders, center-top focal point)
- Gold frame gradient `#E8C77E` → `#C9A24A`, subtle glow, dark mystical backdrop
- One cohesive illustration style across all masters

When adding `.webp` files, update `portrait` / `thumb` paths in `master-avatars.ts` or add a build step that prefers WebP if present.
