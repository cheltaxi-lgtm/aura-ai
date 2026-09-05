import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const script = readFileSync('scripts/deploy-prod.sh', 'utf8');
const begin = Math.min(script.indexOf('# Enforced HTTP health gate:'), script.indexOf('# New releases must demonstrate'));
const gate = script.slice(begin, script.indexOf('# Keep rollback armed until public traffic'));
const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash';
function runGate(siteFails: boolean) {
  const cwd = mkdtempSync(join(tmpdir(), 'zovus-readiness-'));
  try {
    return spawnSync(bash, ['-c', `set -euo pipefail
sleep() { :; }
curl() {
  case "$*" in
    *3000/api/health*)
      echo site >> calls
      count=0; [ ! -f tries ] || count=$(cat tries)
      count=$((count + 1)); echo "$count" > tries
      if ${siteFails ? 'true' : '[ "$count" -le 3 ]'}; then echo 503; else touch site-ready; echo 200; fi ;;
    *8787/ready*)
      echo bot >> calls
      if [ -f site-ready ]; then echo 200; else echo 503; fi ;;
    *) exit 80 ;;
  esac
}
${gate}
echo ALL_READY
cat calls
`], { cwd, encoding: 'utf8' });
  } finally { rmSync(cwd, { recursive: true, force: true }); }
}
describe('production readiness dependencies', () => {
  it('lets the site finish cold start before checking dependent bot readiness', () => {
    const result = runGate(false);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('ALL_READY\nsite\nsite\nsite\nsite\nbot');
  });
  it('fails the release when site health never recovers', () => {
    const result = runGate(true);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('local /api/health never returned 200');
    expect(result.stdout).not.toContain('ALL_READY');
  });
});
