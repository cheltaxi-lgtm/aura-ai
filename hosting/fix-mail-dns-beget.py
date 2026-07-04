#!/usr/bin/env python3
"""Fix zovus.ru DNS: A + MX + SPF + Yandex verify + DMARC (Beget API)."""
import json
import re
import sys
import urllib.parse
import urllib.request

CONF = sys.argv[1] if len(sys.argv) > 1 else "/home/ubuntu/.acme.sh/account.conf"
APP_IP = sys.argv[2] if len(sys.argv) > 2 else "217.12.37.32"
YANDEX_VERIFY = sys.argv[3] if len(sys.argv) > 3 else "7902ba7dfdb76ac3"
MAIL_PROVIDER = sys.argv[4] if len(sys.argv) > 4 else "yandex"

text = open(CONF, encoding="utf-8").read()
login = re.search(r"SAVED_Beget_Username='([^']+)'", text).group(1)
passwd = re.search(r"SAVED_Beget_Password='([^']+)'", text).group(1)


def beget(endpoint: str, payload: dict) -> dict:
    data = urllib.parse.urlencode(
        {
            "login": login,
            "passwd": passwd,
            "input_format": "json",
            "output_format": "json",
            "input_data": json.dumps(payload),
        }
    )
    url = f"https://api.beget.com/api/{endpoint}?" + data
    body = urllib.request.urlopen(url, timeout=30).read().decode()
    return json.loads(body)


def change(fqdn: str, records: dict) -> None:
    resp = beget("dns/changeRecords", {"fqdn": fqdn, "records": records})
    print(fqdn, json.dumps(resp, ensure_ascii=False)[:500])
    ok = resp.get("answer", {}).get("status") == "success" or resp.get("status") == "success"
    if not ok:
        raise SystemExit(f"DNS update failed for {fqdn}")


if MAIL_PROVIDER == "beget":
    mx = [
        {"priority": 10, "value": "mx1.beget.com."},
        {"priority": 20, "value": "mx2.beget.com."},
    ]
    spf = "v=spf1 include:_spf.beget.com include:amazonses.com ~all"
else:
    mx = [{"priority": 10, "value": "mx.yandex.net."}]
    spf = "v=spf1 include:_spf.yandex.net include:amazonses.com ~all"

YANDEX_TXT = f"yandex-verification: {YANDEX_VERIFY}"
DMARC = "v=DMARC1; p=quarantine; rua=mailto:admin@zovus.ru; fo=1"

change(
    "zovus.ru",
    {
        "A": [{"priority": 10, "value": APP_IP}],
        "MX": mx,
        "TXT": [{"priority": 10, "value": YANDEX_TXT}, {"priority": 20, "value": spf}],
    },
)
change("www.zovus.ru", {"A": [{"priority": 10, "value": APP_IP}]})
change("_dmarc.zovus.ru", {"TXT": [{"priority": 10, "value": DMARC}]})

print("=== verify zovus.ru ===")
print(json.dumps(beget("dns/getData", {"fqdn": "zovus.ru"}), ensure_ascii=False, indent=2))

