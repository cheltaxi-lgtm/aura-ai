import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("private PostgreSQL ingress", () => {
  it("blocks IPv4 and IPv6 before Docker and repairs a jump behind ACCEPT without a gap", () => {
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),"zovus-ingress-test-"));
    try {
      const trace=path.join(dir,"trace.log");
      fs.writeFileSync(path.join(dir,"ip"),'#!/usr/bin/env bash\nprintf "default via 10.0.0.1 dev eth0 proto dhcp\\n"\n',{mode:0o755});
      const tool='#!/usr/bin/env bash\nprintf "%s %s\\n" "$(basename "$0")" "$*" >> "$GUARD_TRACE"\ncase " $* " in *" -C "*|*" -nL "*) exit 1;; *" -S PREROUTING "*) printf "%s\\n" "-A PREROUTING -j ZOVUS-PG-INGRESS" "-A PREROUTING -j ACCEPT" "-A PREROUTING -j ZOVUS-PG-INGRESS";; esac\n';
      for(const name of ["iptables","ip6tables"])fs.writeFileSync(path.join(dir,name),tool,{mode:0o755});
      const bash=process.platform==="win32"?"C:/Program Files/Git/bin/bash.exe":"bash";
      const command='fixture_bin="$GUARD_BIN"; if command -v cygpath >/dev/null; then fixture_bin="$(cygpath -u "$fixture_bin")"; fi; export PATH="$fixture_bin:$PATH"; bash hosting/postgres-ingress-guard.sh';
      const result=spawnSync(bash,["-c",command],{encoding:"utf8",env:{...process.env,GUARD_BIN:dir,GUARD_TRACE:trace}});
      expect(result.status,result.stderr).toBe(0);
      const calls=fs.readFileSync(trace,"utf8");
      for(const tool of ["iptables","ip6tables"]){
        expect(calls).toContain(`${tool} -w -t raw -A ZOVUS-PG-INGRESS -i eth0 -p tcp --dport 5432 -j DROP`);
        const insert=calls.indexOf(`${tool} -w -t raw -I PREROUTING 1 -j ZOVUS-PG-INGRESS`);
        const remove=calls.indexOf(`${tool} -w -t raw -D PREROUTING 3`);
        expect(insert).toBeGreaterThanOrEqual(0);
        expect(remove).toBeGreaterThan(insert);
      }
      expect(calls).not.toMatch(/-F|-X|--dport (?:22|80|443)|-i lo/);
    } finally {
      const base=fs.realpathSync(os.tmpdir()),resolved=fs.realpathSync(dir);
      if(path.dirname(resolved)!==base||!path.basename(resolved).startsWith("zovus-ingress-test-"))throw Error("Unexpected cleanup target");
      fs.rmSync(resolved,{recursive:true,force:true});
    }
  });

  it("binds fresh development databases and pgadmin to loopback", () => {
    const compose=fs.readFileSync("docker-compose.yml","utf8");
    expect(compose).toContain('"127.0.0.1:5432:5432"');
    expect(compose).toContain('"127.0.0.1:5050:80"');
    const unit=fs.readFileSync("hosting/zovus-postgres-ingress.service","utf8");
    expect(unit).toContain("Before=docker.service");
    expect(unit).toContain("RequiredBy=docker.service");
    expect(unit).not.toMatch(/^After=.*docker.service/m);
  });
});
