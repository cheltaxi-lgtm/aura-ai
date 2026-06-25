#!/usr/bin/env python3
import sqlite3
from datetime import datetime

db = "/opt/homeserver/npm/data/database.sqlite"
advanced = """client_max_body_size 10m;
proxy_read_timeout 180s;
proxy_send_timeout 180s;
proxy_connect_timeout 60s;"""
conn = sqlite3.connect(db)
conn.execute(
    "UPDATE proxy_host SET advanced_config=?, modified_on=? WHERE id=61",
    (advanced, datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")),
)
conn.commit()
row = conn.execute("SELECT advanced_config FROM proxy_host WHERE id=61").fetchone()
print(row[0] if row else "missing")
