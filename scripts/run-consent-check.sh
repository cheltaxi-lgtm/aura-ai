#!/bin/bash
set -euo pipefail
cat /tmp/check-consent-columns.sql | docker exec -i auraai-postgres psql -U auraai -d auraai -t
