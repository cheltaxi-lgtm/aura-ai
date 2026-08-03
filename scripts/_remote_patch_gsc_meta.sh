#!/bin/bash
set -euo pipefail
TOKEN='2xfoyJJx5rzmo7m9RUmw07wh1Zh3YBveFi71f3aZAqw'
python3 - <<PY
from pathlib import Path
p = Path('/opt/aura-ai/src/lib/seo.ts')
t = p.read_text()
token = '${TOKEN}'
needle = f'google: "{token}"'
if needle in t:
    print('already')
elif 'yandex: "7902ba7dfdb76ac3",' in t:
    t = t.replace(
        'yandex: "7902ba7dfdb76ac3",',
        f'yandex: "7902ba7dfdb76ac3",\n      google: "{token}",',
    )
    p.write_text(t)
    print('patched')
else:
    print('yandex line missing')
    for l in t.splitlines():
        if 'yandex' in l or 'verification' in l:
            print(l)
print([l.strip() for l in p.read_text().splitlines() if 'google' in l or 'yandex' in l][:10])
PY

cd /opt/aura-ai
npm run build > /tmp/gsc-build.log 2>&1
echo "BUILD_EXIT:$?"
tail -30 /tmp/gsc-build.log
systemctl restart aura-ai
sleep 6
curl -s https://zovus.ru/ | grep -oE 'google-site-verification[^>]+' | head -5 || true
curl -sI https://zovus.ru/ | head -5
