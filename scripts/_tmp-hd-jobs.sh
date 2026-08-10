#!/bin/bash
set -u
DB_URL=$(grep -E '^DATABASE_URL=' /opt/aura-ai/.env.async-jobs | head -1 | cut -d= -f2-)
psql "$DB_URL" -f /tmp/_hd-jobs.sql
