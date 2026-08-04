#!/bin/bash
find /opt/aura-ai/.next -path '*karta*' -name '*.meta' 2>/dev/null | head -10
echo "---"
find /opt/aura-ai/.next -path '*karta*' \( -name '*.body' -o -name '*.html' -o -name '*.rsc' \) 2>/dev/null | head -10
echo "--- cache dir:"
ls /opt/aura-ai/.next/server/app/dizayn-cheloveka/karta/ 2>/dev/null
ls "/opt/aura-ai/.next/server/app/dizayn-cheloveka/karta/[fingerprint]/" 2>/dev/null
ls "/opt/aura-ai/.next/server/app/dizayn-cheloveka/karta/[fingerprint]/opengraph-image/" 2>/dev/null
