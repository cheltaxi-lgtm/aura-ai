import { describe, expect, it, vi } from 'vitest';
const ID='11111111-1111-4111-8111-111111111111';
const DOB='1990-08-04';
vi.mock('@/lib/db',()=>({query:vi.fn(),withTransaction:async(fn:(client: unknown) => Promise<unknown>)=>fn({}),queryClient:async(_client:unknown,sql:string)=>({rows:sql.includes('birth_date::text')?[{id:'11111111-1111-4111-8111-111111111111',birth_date:'1990-08-04',matrix_snapshot:null}]:sql.includes('SELECT birth_date')?[{birth_date:'1990-08-04'}]:sql.includes('SELECT id FROM matrix_subjects')?[{id:'11111111-1111-4111-8111-111111111111'}]:[],rowCount:1})}));
import { persistOwnedMatrixSnapshot } from '@/lib/services/matrix-snapshot-persist';
import { hydrateDestinyMatrixFromSnapshot } from '@/lib/numerology/matrix-snapshot';
import { destinyMatrix, matrixToStructuredData } from '@/lib/numerology/destiny-matrix';
describe('Matrix snapshot persistence normalization',()=>{
 it.each([{}, {version:'matrix-v4'}])('persists a full bound snapshot from metadata-only input %j',async snapshot=>{
  const result=await persistOwnedMatrixSnapshot({userId:ID,subjectId:ID,birthDate:DOB,snapshot});
  expect(hydrateDestinyMatrixFromSnapshot(result.snapshot)).not.toBeNull();
  expect(result.snapshot.birthDate).toBe(DOB);
  expect(result.calculationVersion).toBe('version' in snapshot?'matrix-v4':'matrix-v5');
 });
 it('rejects another birth even when core numbers collide before persistence',async()=>{
  const snapshot=matrixToStructuredData(destinyMatrix(DOB,{asOfDate:'2026-09-30'})!,DOB);
  await expect(persistOwnedMatrixSnapshot({userId:ID,subjectId:ID,birthDate:'1990-08-31',snapshot})).rejects.toThrow('invalid_matrix_snapshot');
 });
});
