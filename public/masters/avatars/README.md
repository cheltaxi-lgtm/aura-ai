# Master avatar assets

AI-generated portraits via OpenRouter (Seedream 4.5), unified Aura gallery style.

## Generate / regenerate

Requires `OPENROUTER_API_KEY` in `.env.local` (same as deck builder).

```bash
npm run generate:avatars          # skip existing .webp
npm run generate:avatars -- --force   # regenerate all
npm run generate:avatars -- --only=ragnar
```

Outputs `public/masters/avatars/{master}.webp` + `{master}-thumb.webp` (400×520 / 120×120).

## Files

| Master ID | Portrait | Thumb |
|-----------|----------|-------|
| `ragnar` | `ragnar.webp` | `ragnar-thumb.webp` |
| `veronika` | `veronika.webp` | `veronika-thumb.webp` |
| `agafya` | `agafya.webp` | `agafya-thumb.webp` |
| `shri-raj` | `shri-raj.webp` | `shri-raj-thumb.webp` |
| `gadalka_marina` | `marina.webp` | `marina-thumb.webp` |

Registry: `src/data/master-avatars.ts`. SVG files remain as offline fallback only.
