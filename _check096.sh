#!/bin/bash
echo "--- port 3000 owner:"
ss -tlnp | grep ':3000'
echo "--- all next-server processes:"
ps aux | grep -E 'next-server|next start' | grep -v grep
