import {describe,expect,it} from 'vitest';
import {proGenerationIdentity} from '@/modules/pro/db/hd-generation';
import {proManualDraftCoversCards} from '@/modules/pro/ai/draft';
describe('Pro immutable purchase identity',()=>{
  const input={type:'manual_spread',question:'Question',clientId:'1',alias:'Client',practitionerContext:'Context',payload:{birthDate:'1990-01-01',cards:[{name:'Маг',position:'1',reversed:false},{name:'Шут',position:'2',reversed:true}]}};
  it('ignores JSON property order and delivery metadata only',()=>{
    expect(proGenerationIdentity(input)).toBe(proGenerationIdentity({...input,payload:{cards:input.payload.cards,birthDate:'1990-01-01',premiumJobId:'job',chartSnapshot:{anything:true},reportSourceIdentity:'hash'}}));
  });
  it.each(['question','alias','clientId','practitionerContext'])('binds %s',field=>{expect(proGenerationIdentity({...input,[field]:'Changed'})).not.toBe(proGenerationIdentity(input));});
  it('binds date, card order and orientation',()=>{
    for(const payload of [{...input.payload,birthDate:'2000-01-01'},{...input.payload,cards:[...input.payload.cards].reverse()},{...input.payload,cards:input.payload.cards.map(c=>({...c,reversed:!c.reversed}))}])expect(proGenerationIdentity({...input,payload})).not.toBe(proGenerationIdentity(input));
  });
});
describe('Pro manual report card coverage',()=>{
  const cards=[{name:'Маг'},{name:'Шут'}],block={id:'a',title:'Title',body:'Содержательное предложение с подробным объяснением карты и отдельной практикой. '.repeat(3)};
  it('requires a distinct substantive position for every saved card',()=>{
    expect(proManualDraftCoversCards([{...block,position_ref:'1'},{...block,id:'b',position_ref:'2'}],cards)).toBe(true);
    expect(proManualDraftCoversCards([{...block,position_ref:'1'}],cards)).toBe(false);
    expect(proManualDraftCoversCards([{...block,position_ref:'1'},{...block,id:'b',position_ref:'1'}],cards)).toBe(false);
    expect(proManualDraftCoversCards([{...block,position_ref:'1'},{...block,id:'b',position_ref:'2',body:'Обрезано'}],cards)).toBe(false);
    expect(proManualDraftCoversCards([block],[])).toBe(false);
  });
});
