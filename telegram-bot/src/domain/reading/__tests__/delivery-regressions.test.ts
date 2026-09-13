import assert from 'node:assert/strict';
import { migrate } from '../../../db/client.js';
import { migrateUp, ensureCriticalColumns } from '../../../db/migrate-runner.js';
import { getFlow, setFlow, setVoiceMode, upsertUser } from '../../../db/repos.js';
import { getDb } from '../../../db/client.js';
import { presentReadingToTelegram, handleReadingPagerCallback } from '../present.js';
import { ttsProvider } from '../../tts/openrouter-provider.js';
import { CB, chatConfirmKeyboard } from '../../../keyboards/index.js';
import { confirmChatFollowUp } from '../../../flows/cabinet.js';
import type { Context } from 'grammy';
migrate(); migrateUp(); ensureCriticalColumns();
const uid = 990109;
upsertUser({ telegramUserId: uid, chatId: uid, firstName: 'Test' });
const messages: Array<{text:string,opts:any}> = [];
const ctx = { from:{id:uid}, reply:async(text:string,opts:any)=>{messages.push({text,opts});return {message_id:messages.length,chat:{id:uid}};} } as unknown as Context;
await presentReadingToTelegram(ctx,{reading:'Прошлое: REPORT_A.\n\nБудущее: NEXT_A.',sessionId:'session-a'});
const a = messages[0]!;
const nativeAsk = a.opts.reply_markup.inline_keyboard.flat().find((b:any)=>b.text==='💬 Уточнить в боте');
assert.equal(nativeAsk?.callback_data, `${CB.chatAskPrefix}session-a`, 'reading must expose native follow-up');
const confirmation = chatConfirmKeyboard(12, 'tg-42:12').inline_keyboard.flat()
  .find((b:any)=>b.callback_data===`${CB.chatConfirmPrefix}tg-42:12`);
assert.equal(confirmation?.text, '✅ Отправить · 12ᚢ', 'paid chat turn must require an explicit priced confirmation');
setFlow(uid, 'chat', 'await_confirm', {
  sessionId: 'session-a', message: 'new question', clientEventId: 'tg-43', cost: 12,
  confirmationId: 'tg-43:12',
});
let staleReply = '';
await confirmChatFollowUp({from:{id:uid},reply:async(text:string)=>{staleReply=text;return {message_id:6,chat:{id:uid}};}} as unknown as Context,'tg-42:12');
assert.match(staleReply,/уже отправлен или отменён/i,'stale confirmation must be rejected');
assert.equal(getFlow(uid)?.data.confirmationId,'tg-43:12','stale confirmation must not replace current intent');
const next = a.opts.reply_markup.inline_keyboard.flat().find((b:any)=>b.text==='›').callback_data;
await presentReadingToTelegram(ctx,{reading:'Прошлое: REPORT_B.\n\nБудущее: NEXT_B.',sessionId:'session-b'});
let edited='';
await handleReadingPagerCallback({from:{id:uid},callbackQuery:{message:{message_id:1,chat:{id:uid}}},answerCallbackQuery:async()=>{},editMessageText:async(text:string)=>{edited=text;}} as unknown as Context,next);
assert.match(edited,/NEXT_A/,'A callback must retain A after navigation and another reading');
assert.doesNotMatch(edited,/NEXT_B/);
const plain:string[]=[];
await presentReadingToTelegram({from:{id:uid},reply:async(text:string,opts:any)=>{if(opts?.parse_mode==='HTML')throw Error('bad HTML');plain.push(text);return {message_id:7,chat:{id:uid}};}} as unknown as Context,{reading:('Совет карт: **Текст & смысл**.\n\n').repeat(600)});
assert.ok(plain.length>1);
assert.ok(plain.every(t=>t.length<=4096 && !/<\/?(?:b|i)>|&amp;/.test(t)),'plain fallback chunks are valid Telegram text');

setVoiceMode(uid, 'text_voice');
getDb().prepare('DELETE FROM bot_tts_usage WHERE telegram_user_id = ?').run(uid);
const originalSynthesize = ttsProvider.synthesize.bind(ttsProvider);
ttsProvider.synthesize = async () => ({ ok: true, ogg: Buffer.alloc(200), durationSec: 5 });
let voiceDelivered = 0;
const beforeTts = (getDb().prepare('SELECT COALESCE(SUM(calls),0) AS calls FROM bot_tts_usage WHERE telegram_user_id = ?').get(uid) as {calls:number}).calls;
await presentReadingToTelegram({
  from:{id:uid},
  reply:async()=>({message_id:8,chat:{id:uid}}),
  replyWithVoice:async()=>{voiceDelivered++;return {message_id:9,chat:{id:uid}};},
} as unknown as Context,{reading:'Короткий текст для голосовой версии.'});
const afterTts = (getDb().prepare('SELECT COALESCE(SUM(calls),0) AS calls FROM bot_tts_usage WHERE telegram_user_id = ?').get(uid) as {calls:number}).calls;
assert.equal(voiceDelivered,1,'text_voice mode must deliver one voice companion');
assert.equal(afterTts,beforeTts+1,'TTS quota is consumed only after voice delivery');
ttsProvider.synthesize = originalSynthesize;
setVoiceMode(uid, 'text');
getDb().prepare('DELETE FROM bot_tts_usage WHERE telegram_user_id = ?').run(uid);
console.log('reading delivery regressions PASS');
