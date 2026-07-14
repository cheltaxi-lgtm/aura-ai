#!/usr/bin/env python3
"""Yandex 360 mail bootstrap for zovus.ru (DNS via Beget API + optional prod SMTP secret).

Usage (on machine with ~/.acme.sh/account.conf or BEGET creds):
  python3 hosting/setup-yandex-mail-from-zero.py
  python3 hosting/setup-yandex-mail-from-zero.py --smtp-pass 'app-password' --prod-env /opt/aura-ai/.env.local

Steps this script automates:
  1. DNS: A + MX (mx.yandex.net) + SPF + yandex-verification TXT + DMARC
  2. Optional: merge SMTP_PASS into prod .env.local and restart aura-ai

Manual steps (Yandex 360 admin — cannot be fully automated without API token):
  1. https://admin.yandex.ru → Домены → Подключить zovus.ru (TXT already in DNS)
  2. Сотрудники → Добавить: noreply@, support@, admin@zovus.ru
  3. id.yandex.ru → Безопасность → Пароли приложений → для noreply@ → SMTP
  4. Run this script with --smtp-pass or scripts/push-mail-secret-to-prod.ps1
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DOMAIN = "zovus.ru"
APP_IP = "217.12.37.32"
YANDEX_VERIFY = "7902ba7dfdb76ac3"


def load_beget_creds() -> tuple[str, str]:
    import os

    login = os.environ.get("BEGET_LOGIN", "").strip()
    passwd = os.environ.get("BEGET_PASSWORD", "").strip()
    if login and passwd:
        return login, passwd
    conf = Path.home() / ".acme.sh/account.conf"
    if len(sys.argv) > 1 and Path(sys.argv[1]).is_file():
        conf = Path(sys.argv[1])
    text = conf.read_text(encoding="utf-8")
    login = re.search(r"SAVED_Beget_Username='([^']+)'", text).group(1)
    passwd = re.search(r"SAVED_Beget_Password='([^']+)'", text).group(1)
    return login, passwd


def beget(login: str, passwd: str, endpoint: str, payload: dict) -> dict:
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


def change_dns(login: str, passwd: str) -> None:
    mx = [{"priority": 10, "value": "mx.yandex.net."}]
    spf = "v=spf1 include:_spf.yandex.net include:amazonses.com ~all"
    yandex_txt = f"yandex-verification: {YANDEX_VERIFY}"
    dmarc = f"v=DMARC1; p=quarantine; rua=mailto:admin@{DOMAIN}; fo=1"

    for fqdn, records in {
        DOMAIN: {
            "A": [{"priority": 10, "value": APP_IP}],
            "MX": mx,
            "TXT": [{"priority": 10, "value": yandex_txt}, {"priority": 20, "value": spf}],
        },
        f"www.{DOMAIN}": {"A": [{"priority": 10, "value": APP_IP}]},
        f"_dmarc.{DOMAIN}": {"TXT": [{"priority": 10, "value": dmarc}]},
    }.items():
        resp = beget(login, passwd, "dns/changeRecords", {"fqdn": fqdn, "records": records})
        ok = resp.get("answer", {}).get("status") == "success" or resp.get("status") == "success"
        print(f"dns {fqdn}: {'ok' if ok else resp}")
        if not ok:
            raise SystemExit(f"DNS update failed for {fqdn}")


def merge_prod_env(env_file: Path, smtp_pass: str) -> None:
    lines: list[str] = []
    if env_file.exists():
        lines = env_file.read_text(encoding="utf-8").splitlines()
    skip = {
        "EMAIL_FROM",
        "SMTP_HOST",
        "SMTP_PORT",
        "SMTP_SECURE",
        "SMTP_USER",
        "SMTP_PASS",
        "MAIL_SUPPORT",
        "MAIL_PRIVACY",
        "MAIL_CLAIMS",
        "MAIL_ADMIN_NOTIFY",
        "RESEND_API_KEY",
    }
    kept = [ln for ln in lines if not any(ln.startswith(f"{k}=") for k in skip)]
    block = [
        "",
        "# Mail — Yandex 360 SMTP (setup-yandex-mail-from-zero.py)",
        f"EMAIL_FROM=Zovus <noreply@{DOMAIN}>",
        "SMTP_HOST=smtp.yandex.ru",
        "SMTP_PORT=465",
        "SMTP_SECURE=true",
        f"SMTP_USER=noreply@{DOMAIN}",
        f"SMTP_PASS={smtp_pass}",
        f"MAIL_SUPPORT=support@{DOMAIN}",
        f"MAIL_PRIVACY=privacy@{DOMAIN}",
        f"MAIL_CLAIMS=claims@{DOMAIN}",
        f"MAIL_ADMIN_NOTIFY=admin@{DOMAIN}",
    ]
    env_file.write_text("\n".join(kept + block) + "\n", encoding="utf-8")
    print(f"Updated {env_file}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--smtp-pass", help="Yandex app password for noreply@zovus.ru")
    parser.add_argument("--prod-env", default="/opt/aura-ai/.env.local")
    parser.add_argument("--skip-dns", action="store_true")
    parser.add_argument("--restart-service", action="store_true")
    args = parser.parse_args()

    login, passwd = load_beget_creds()
    if not args.skip_dns:
        print(">>> Updating DNS for Yandex 360...")
        change_dns(login, passwd)

    if args.smtp_pass:
        merge_prod_env(Path(args.prod_env), args.smtp_pass.strip())
        if args.restart_service:
            subprocess.run(["systemctl", "restart", "aura-ai.service"], check=True)
            print("aura-ai.service restarted")
    else:
        print("\n>>> Next: Yandex 360 admin (manual)")
        print("  1. https://admin.yandex.ru — connect domain zovus.ru")
        print("  2. Create employees: noreply@, support@, admin@")
        print("  3. App password for noreply@ (SMTP)")
        print("  4. Re-run with --smtp-pass '...' --restart-service")
        print("\nOr: scripts/push-mail-secret-to-prod.ps1 -SmtpPass '...'")


if __name__ == "__main__":
    main()
