#!/usr/bin/env python3
from pathlib import Path

conf = Path("/opt/homeserver/npm/data/nginx/proxy_host/61.conf")
text = conf.read_text()
block = """
  client_max_body_size 10m;
  proxy_read_timeout 180s;
  proxy_send_timeout 180s;
  proxy_connect_timeout 60s;
"""
if "proxy_read_timeout 180s" not in text:
    marker = "  error_log /data/logs/proxy-host-61_error.log warn;\n"
    if marker not in text:
        raise SystemExit("marker not found in conf")
    text = text.replace(marker, marker + block + "\n")
    conf.write_text(text)
    print("patched conf")
else:
    print("conf already patched")
