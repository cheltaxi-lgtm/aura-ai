import { describe, expect, it, beforeEach, vi } from 'vitest';
const state=vi.hoisted(()=>({birthDate:'1990-08-15',kind:'self',version:'matrix-v5',asOf:'2024-01-01',snapshot:null as Record<string,unknown>|null,updates:[] as unknown[][]}));
vi.mock('@/lib/db',()=>{
 const row=()=>({id:'11111111-1111-4111-8111-111111111111',birth_date:state.birthDate,kind:state.kind,as_of_date:state.asOf,calculation_version:state.version,matrix_snapshot:state.snapshot});
 const run=async(sql:string,params:unknown[]=[]):Promise<{rows:unknown[];rowCount:number}>=>{
  if(sql.includes('UPDATE matrix_subjects')){state.updates.push(params);state.snapshot=JSON.parse(String(params[2]));return {rows:[],rowCount:1};}
  if(sql.includes('matrix_subjects'))return {rows:[row()],rowCount:1};
  return {rows:[{id:'11111111-1111-4111-8111-111111111111',birth_date:state.birthDate}],rowCount:1};
 };
 return {query:run,queryClient:(_client:unknown,sql:string,params:unknown[])=>run(sql,params),withTransaction:async(fn:(client:unknown)=>Promise<unknown>)=>fn({})};
});
import { destinyMatrix,matrixToStructuredData } from '@/lib/numerology/destiny-matrix';
import { ensureOwnedMatrixSnapshot } from '@/lib/services/matrix-snapshot-persist';
import { resolveMatrixForEngine } from '@/lib/numerology/matrix-snapshot';
import { buildNumerologSessionResult } from '@/lib/numerology/session-result';
const ID='11111111-1111-4111-8111-111111111111';
beforeEach(()=>{state.birthDate='1990-08-15';state.kind='self';state.version='matrix-v5';state.asOf='2024-01-01';state.updates=[];state.snapshot=null;});
describe('recover old cross-person Matrix caches when starting a new session',()=>{
 it.each(['matrix-v4','matrix-v5'])('repairs only invalid cache retaining %s and calendar',async version=>{
  state.version=version;
  state.snapshot=matrixToStructuredData(destinyMatrix('1988-03-03',{asOfDate:state.asOf,calculationVersion:version})!);
  expect(buildNumerologSessionResult({toolId:'destiny_matrix',birthDate:state.birthDate,matrixSnapshot:state.snapshot})).toBeNull();
  const old=state.snapshot;
  const result=await ensureOwnedMatrixSnapshot({userId:ID,subjectId:ID,birthDate:state.birthDate});
  expect(result.calculationVersion).toBe(version);expect(result.asOfDate).toBe(state.asOf);expect(result.snapshot.birthDate).toBe(state.birthDate);
  expect(resolveMatrixForEngine({birthDate:state.birthDate,snapshot:result.snapshot})).not.toBeNull();
  expect(buildNumerologSessionResult({toolId:'destiny_matrix',birthDate:state.birthDate,matrixSnapshot:result.snapshot})?.positions.length).toBeGreaterThan(10);
  expect(state.updates).toHaveLength(1);expect(state.updates[0][0]).toBe(ID);expect(state.updates[0][4]).toBe(JSON.stringify(old));
 });
 it.each(['other','child'])('uses the owned subject kind for %s recovery when caller omits it',async kind=>{
  state.kind=kind;state.birthDate=kind==='child'?'2016-03-03':'1990-08-15';
  state.snapshot=matrixToStructuredData(destinyMatrix('1988-03-03',{asOfDate:state.asOf})!);
  const result=await ensureOwnedMatrixSnapshot({userId:ID,subjectId:ID,birthDate:state.birthDate});
  expect(result.snapshot.birthDate).toBe(state.birthDate);expect(state.updates).toHaveLength(1);
 });
 it('reuses a valid historic snapshot byte for byte without writing',async()=>{
  state.snapshot=matrixToStructuredData(destinyMatrix(state.birthDate,{asOfDate:state.asOf,calculationVersion:'matrix-v4'})!);state.version='matrix-v4';
  const before=JSON.stringify(state.snapshot);const result=await ensureOwnedMatrixSnapshot({userId:ID,subjectId:ID,birthDate:state.birthDate});
  expect(JSON.stringify(result.snapshot)).toBe(before);expect(state.updates).toHaveLength(0);
 });
 it('cannot rewrite the owned subject using a caller supplied different date',async()=>{
  state.snapshot=matrixToStructuredData(destinyMatrix('1988-03-03',{asOfDate:state.asOf})!);
  await expect(ensureOwnedMatrixSnapshot({userId:ID,subjectId:ID,birthDate:'1988-03-03'})).rejects.toThrow('matrix_subject_date_mismatch');
  expect(state.updates).toHaveLength(0);
 });
});
