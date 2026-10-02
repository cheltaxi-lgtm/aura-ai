import {execFileSync} from 'node:child_process';
import {describe,expect,it} from 'vitest';
import {hasTestDb} from './db/setup-env';
describe.runIf(hasTestDb)('HD Pro test database isolation',()=>{
  it('redirects a primary Pro URL before the separate pool can be created',()=>{
    const result=execFileSync(process.execPath,['--import','tsx','-e',"require('./tests/invariants/db/setup-env.ts'); const {getProPool}=require('./src/modules/pro/db.ts'); const pool=getProPool(); console.log(pool.options.connectionString===process.env.TEST_DATABASE_URL); pool.end();"],{env:{...process.env,PRO_DATABASE_URL:'postgresql://placeholder:placeholder@primary.invalid/primary'},encoding:'utf8'});
    expect(result.trim()).toBe('true');
  });
});
