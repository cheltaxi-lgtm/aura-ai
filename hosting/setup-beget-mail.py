#!/usr/bin/env python3
"""Create zovus.ru mailboxes on Beget and configure prod SMTP env."""
import json
import re
import secrets
import string
import subprocess
import sys
import urllib.parse
import urllib.request

CONF = sys.argv[1] if len(sys.argv) > 1 else "/home/ubuntu/.acme.sh/account.conf"
APP_IP = sys.argv[2] if len(sys.argv) > 2 else "217.12.37.32"
YANDEX_VERIFY = sys.argv[3] if len(sys.argv) > 3 else "7902ba7dfdb76ac3"
PROD_ENV = sys.argv[4] if len(sys.argv) > 4 else "/opt/aura-ai/.env.local"

text = open(CONF, encoding="utf-8").read()
login = re.search(r"SAVED_Beget_Username='([^']+)'", text).group(1)
passwd = re.search(r"SAVED_Beget_Password='([^']+)'", text).group(1)
DOMAIN = "zovus.ru"

MAILBOXES = ["noreply", "support", "admin"]
FORWARD_TO_SUPPORT = ["privacy", "claims"]


def gen_password(n: int = 24) -> str:
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(n))


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


def api_ok(resp: dict) -> bool:
    return resp.get("answer", {}).get("status") == "success" or resp.get("status") == "success"


existing = {
    m["mailbox"]
    for m in beget("mail/getMailboxList", {"domain": DOMAIN}).get("answer", {}).get("result", [])
}
print("existing mailboxes:", sorted(existing))

passwords: dict[str, str] = {}

for box in MAILBOXES + FORWARD_TO_SUPPORT:
    if box in existing:
        print(f"skip create {box} (exists)")
        continue
    pw = gen_password()
    resp = beget(
        "mail/createMailbox",
        {"domain": DOMAIN, "mailbox": box, "mailbox_password": pw},
    )
    print(f"create {box}:", json.dumps(resp, ensure_ascii=False)[:300])
    if not api_ok(resp):
        err = json.dumps(resp)
        if "already" not in err.lower() and "exist" not in err.lower():
            raise SystemExit(f"createMailbox failed for {box}: {err}")
    passwords[box] = pw

for alias in FORWARD_TO_SUPPORT:
    if alias in existing:
        continue
    resp = beget(
        "mail/forwardListAddMailbox",
        {
            "domain": DOMAIN,
            "mailbox": alias,
            "forward_mailbox": f"support@{DOMAIN}",
        },
    )
    print(f"forward {alias} -> support:", json.dumps(resp, ensure_ascii=False)[:300])

# DNS: Beget mail + site A + yandex verify + SPF (Beget + Resend SES)
SPF = "v=spf1 include:_spf.beget.com include:amazonses.com ~all"
YANDEX_TXT = f"yandex-verification: {YANDEX_VERIFY}"
DMARC = f"v=DMARC1; p=quarantine; rua=mailto:admin@{DOMAIN}; fo=1"

for fqdn, records in {
    DOMAIN: {
        "A": [{"priority": 10, "value": APP_IP}],
        "MX": [
            {"priority": 10, "value": "mx1.beget.com."},
            {"priority": 20, "value": "mx2.beget.com."},
        ],
        "TXT": [
            {"priority": 10, "value": YANDEX_TXT},
            {"priority": 20, "value": SPF},
        ],
    },
    f"www.{DOMAIN}": {"A": [{"priority": 10, "value": APP_IP}]},
    f"_dmarc.{DOMAIN}": {"TXT": [{"priority": 10, "value": DMARC}]},
}.items():
    resp = beget("dns/changeRecords", {"fqdn": fqdn, "records": records})
    print("dns", fqdn, json.dumps(resp, ensure_ascii=False)[:200])

if "noreply" not in passwords:
    # Reset password for existing noreply so we know SMTP creds
    pw = gen_password()
    resp = beget(
        "mail/changeMailboxPassword",
        {"domain": DOMAIN, "mailbox": "noreply", "mailbox_password": pw},
    )
    print("reset noreply pw:", json.dumps(resp, ensure_ascii=False)[:200])
    if api_ok(resp):
        passwords["noreply"] = pw

if "noreply" not in passwords:
    raise SystemExit("noreply mailbox password unknown — create or reset failed")

noreply_pass = passwords["noreply"]
env_lines = {
    "EMAIL_FROM": f"Zovus <noreply@{DOMAIN}>",
    "SMTP_HOST": "smtp.beget.com",
    "SMTP_PORT": "465",
    "SMTP_SECURE": "true",
    "SMTP_USER": f"noreply@{DOMAIN}",
    "SMTP_PASS": noreply_pass,
    "MAIL_SUPPORT": f"support@{DOMAIN}",
    "MAIL_PRIVACY": f"privacy@{DOMAIN}",
    "MAIL_CLAIMS": f"claims@{DOMAIN}",
    "MAIL_ADMIN_NOTIFY": f"admin@{DOMAIN}",
}

# Write credentials for server-side merge (run on prod via ssh)
out = {"domain": DOMAIN, "env": env_lines, "passwords_created": list(passwords.keys())}
print("===ENV_JSON_START===")
print(json.dumps(out))
print("===ENV_JSON_END===")
