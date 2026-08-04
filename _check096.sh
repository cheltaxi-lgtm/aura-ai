#!/bin/bash
cd /var/www/zovus
set -a; [ -f .env ] && . ./.env; set +a
psql "$DATABASE_URL" -tAc "SELECT to_regclass('hd_composite_reports')"
