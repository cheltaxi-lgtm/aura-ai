#!/usr/bin/env bash
set -euo pipefail
BASE="${1:-https://zovus.ru}"
OUT="/tmp/zovus_ux_audit_$$.txt"
: >"$OUT"

check() {
  local path="$1"
  local code bytes final
  code=$(curl -sS -o /tmp/zovus_body -w "%{http_code}" -L --max-time 30 "$BASE$path" || echo "000")
  bytes=$(wc -c </tmp/zovus_body | tr -d ' ')
  final=$(curl -sS -o /dev/null -w "%{url_effective}" -L --max-time 30 "$BASE$path" || echo "?")
  printf '%s\t%s\t%s\t%s\n' "$code" "$bytes" "$path" "$final" | tee -a "$OUT"
}

echo "=== PAGE ROUTES ==="
for u in \
  / \
  /auth \
  /auth/user/login \
  /auth/user/register \
  /cabinet \
  /cabinet/human-design \
  /cabinet/astrology \
  /cabinet/support \
  /dizayn-cheloveka \
  /dizayn-cheloveka/rasschitat \
  /dizayn-cheloveka/sovmestimost \
  /dizayn-cheloveka/sovmestimost/rasschitat \
  /dizayn-cheloveka/tipy \
  /numerology \
  /numerology/destiny-matrix \
  /numerology/pythagoras-square \
  /numerology/compatibility \
  /matrix-destiny \
  /natalnaya-karta \
  /astrology \
  /obryady \
  /obryady/pritjazhenie \
  /photo-rasklad \
  /joint-reading \
  /rasklady \
  /rasklady/lyubov \
  /taro \
  /gadanie \
  /gadanie/da-net \
  /pro \
  /zovus-pro \
  /offer \
  /offer-pro \
  /faq \
  /diary \
  /about \
  /cards \
  /lenormand \
  /runy \
  /prognoz \
  /partners \
  /telegram \
  /app \
  /maintenance \
  /session/intention
do
  check "$u"
done

echo "=== PUBLIC APIs ==="
for u in \
  /api/auth/me \
  /api/platform/features \
  /api/pro/health \
  /api/human-design/transits \
  /api/runes/config \
  /api/ritual/config \
  /api/ritual/moon \
  /api/runes/packages
do
  check "$u"
done

echo "=== RESULT APIs (expect auth/validation, not 500) ==="
# POST empty bodies — we care about status class
post_check() {
  local path="$1"
  local code
  code=$(curl -sS -o /tmp/zovus_body -w "%{http_code}" -L --max-time 30 \
    -X POST -H 'content-type: application/json' -d '{}' "$BASE$path" || echo "000")
  bytes=$(wc -c </tmp/zovus_body | tr -d ' ')
  snippet=$(head -c 180 /tmp/zovus_body | tr '\n' ' ')
  printf 'POST %s\t%s\t%s\t%s\n' "$code" "$bytes" "$path" "$snippet" | tee -a "$OUT"
}

post_check /api/human-design/chart
post_check /api/human-design/places
post_check /api/reading
post_check /api/guest-triplet/complete
post_check /api/numerology/matrix-report
post_check /api/natal-chart
post_check /api/chat

echo "=== HD chart happy path (known sample) ==="
code=$(curl -sS -o /tmp/zovus_hd.json -w "%{http_code}" -L --max-time 60 \
  -X POST -H 'content-type: application/json' \
  -d '{"birthDate":"1979-09-18","birthTime":null,"timezone":"Asia/Yekaterinburg","placeName":"Asbest, Sverdlovsk Oblast, Russia","lat":57.0103,"lon":61.4575,"subjectKind":"self"}' \
  "$BASE/api/human-design/chart" || echo "000")
echo "HD_CHART $code $(wc -c </tmp/zovus_hd.json | tr -d ' ')"
node -e '
const fs=require("fs");
try {
  const j=JSON.parse(fs.readFileSync("/tmp/zovus_hd.json","utf8"));
  const c=j.chart?.chart || j.chart;
  console.log(JSON.stringify({
    hasChart:Boolean(c),
    type:c?.type||c?.chart?.type,
    profile:c?.profile||c?.chart?.profile,
    authority:c?.authority||c?.chart?.authority,
    id:j.chart?.id||null,
    error:j.error||null
  },null,2));
} catch(e) { console.log("parse_fail", e.message); }
'

echo "=== Destiny matrix preview path (GET page HTML markers) ==="
curl -sS -L --max-time 30 "$BASE/numerology/destiny-matrix" -o /tmp/zovus_matrix.html || true
rg -n "матриц|Destiny|расчёт|Матрица" /tmp/zovus_matrix.html -i | head -20 || true

echo "=== DONE report: $OUT ==="
