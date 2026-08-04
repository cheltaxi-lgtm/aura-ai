#!/bin/bash
FP=49962ebdadd3002222a9508dc84ffa38645990786ce4134289c51ae28e5336e2
curl -s -m 45 -o /dev/null "http://127.0.0.1:3000/dizayn-cheloveka/karta/$FP/opengraph-image"
sleep 2
journalctl -u aura-ai --since "3 min ago" --no-pager | tail -30
