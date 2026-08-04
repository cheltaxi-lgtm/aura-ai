#!/bin/bash
curl -sv -m 30 "http://127.0.0.1:3000/dizayn-cheloveka/karta/abc123/opengraph-image" -o /dev/null 2>&1 | grep -E '^[*<>]' | head -20
