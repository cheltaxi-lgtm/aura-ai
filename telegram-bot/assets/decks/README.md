# Deck assets

Runtime deck for the autonomous bot. Default path: `tarot-veronika/`.

- Prefer `.webp` (committed). PNG duplicates from the site deck are omitted to keep the package lean (~7 MB vs ~62 MB).
- Override with `BOT_DECK_PATH` if needed.
- Do not point the bot at `../public/` — the package must deploy independently.
