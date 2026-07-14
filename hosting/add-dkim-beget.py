#!/usr/bin/env python3
"""Add Yandex DKIM TXT for zovus.ru via Beget API."""
import json
import re
import sys
import urllib.parse
import urllib.request

DKIM = (
    "v=DKIM1; k=rsa; t=s; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDjooTIGyh89K6YzAWMRv5soxwIGPZ4pzPd7bhO7tgX1p7fJDyoTs3PFmFO7BAl1qZC+jghrEWfTTiwazUhek820RMQaPswx/u7+WPisrDCMOj6vr/IHDz38xYEYJ/G8cQBLjV4gVeyF+OktytkjeYE3ECATSQ7G1c2aeyE4WKWcwIDAQAB"
)
FQDN = "mail._domainkey.zovus.ru"
CONF = sys.argv[1] if len(sys.argv) > 1 else "/home/ubuntu/.acme.sh/account.conf"

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
    return json.loads(urllib.request.urlopen(url, timeout=30).read().decode())


resp = beget(
    "dns/changeRecords",
    {"fqdn": FQDN, "records": {"TXT": [{"priority": 10, "value": DKIM}]}},
)
print(json.dumps(resp, ensure_ascii=False, indent=2))
print("=== verify ===")
print(json.dumps(beget("dns/getData", {"fqdn": FQDN}), ensure_ascii=False, indent=2))
