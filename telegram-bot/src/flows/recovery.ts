import { InlineKeyboard, type Bot, type Context } from 'grammy';
import { recoverableOperations, userOperation, savePaidResult, deliveredOperation } from '../domain/paid-operation.js';
import { siteCatalogSpread, siteSpread, sitePhoto, siteNumerology, type SitePhotoRedrawSpread } from '../domain/site-client.js';
import { drawnCardsFromSiteCards, presentReadingToTelegram } from '../domain/reading/present.js';
import { ensureSiteLinked } from './site-account.js';
import { sendMatrixDiagram } from './cabinet.js';

async function showRecovery(ctx: Context) {
  if (!ctx.from || !await ensureSiteLinked(ctx)) return;
  const operations = recoverableOperations(ctx.from.id);
  if (!operations.length) { await ctx.reply('Все последние запросы завершены. Сохранённые разборы доступны в Профиле → История.'); return; }
  const kb = new InlineKeyboard();
  const labels: Record<string,string> = { spread: 'Расклад', catalog: 'Расклад из каталога', photo: 'Фото-расклад', matrix: 'Матрица' };
  for (const [index, op] of operations.entries()) kb.text(`${index + 1}. ${labels[op.kind] || 'Разбор'} · ${op.status === 'ready' ? 'получить результат' : 'продолжить запрос'}`, `op:resume:${op.id}`).row();
  await ctx.reply('Можно продолжить незавершённый запрос с прежним номером операции или получить уже сохранённый ответ.', { reply_markup: kb });
}

export function registerRecoveryFlows(bot: Bot) {
  bot.command('resume', showRecovery);
  bot.hears('Восстановить', showRecovery);
  bot.callbackQuery('op:list', async ctx => { await ctx.answerCallbackQuery().catch(() => undefined); await showRecovery(ctx); });
  bot.callbackQuery(/^op:resume:([a-f0-9-]{36})$/, async ctx => {
    await ctx.answerCallbackQuery({ text: 'Восстанавливаю запрос…' }).catch(() => undefined);
    if (!ctx.from || !await ensureSiteLinked(ctx)) return;
    const op = userOperation(ctx.from.id, ctx.match[1]);
    if (!op) { await ctx.reply('Запрос не найден. Откройте /resume заново.'); return; }
    if (op.status === 'failed') { await ctx.reply('Этот запрос завершился без результата. Начните новый разбор из меню.'); return; }
    const input = JSON.parse(op.input) as Record<string, unknown>;
    try {
      let result = op.result ? JSON.parse(op.result) : null;
      if (!result) {
        if (op.kind === 'spread') result = (await siteSpread(ctx.from.id, String(input.question), op.id)).data;
        else if (op.kind === 'catalog') result = (await siteCatalogSpread(ctx.from.id, String(input.slug), op.id)).data;
        else if (op.kind === 'photo') result = (await sitePhoto(ctx.from.id, 'interpret', { characterId: String(input.characterId), question: String(input.question), confirmedSpread: input.confirmedSpread as SitePhotoRedrawSpread, idempotencyKey: op.id })).data;
        else if (op.kind === 'matrix') result = (await siteNumerology(ctx.from.id, 'run', undefined, { replace: true, subjectId: typeof input.subjectId === 'string' ? input.subjectId : undefined, operationId: op.id })).data;
        else { await ctx.reply('Проверьте готовый разбор в Профиле → История. Повторная покупка для восстановления не требуется.'); return; }
        savePaidResult(op.id, result);
      }
      if (!result.ok) { await ctx.reply(result.message || 'Запрос пока не завершён. Повторите /resume позже.'); return; }
      const reading = result.reading || result.analysis || result.content;
      if (typeof reading !== 'string' || !reading.trim()) { await ctx.reply('Результат ещё формируется. Повторите /resume позже.'); return; }
      await presentReadingToTelegram(ctx, { reading, question: String(input.question || ''), sessionId: result.sessionId,
        cards: Array.isArray(result.cards) && typeof result.cards[0] === 'object' ? drawnCardsFromSiteCards(result.cards) : undefined,
        cardNames: Array.isArray(result.cards) && typeof result.cards[0] === 'string' ? result.cards : undefined,
        matrixActions: op.kind === 'matrix', matrixPaging: op.kind === 'matrix', matrixReportId: result.reportId, matrixSubjectId: result.subject?.id });
      if (op.kind === 'matrix' && result.diagramUnavailable) await ctx.reply('Текст исходного разбора восстановлен. Схема этой старой версии недоступна.');
      if (op.kind === 'matrix' && !result.diagramUnavailable && !await sendMatrixDiagram(ctx, { diagram: result.diagram, birthDate: result.birthDate, name: result.subject?.displayName })) {
        await ctx.reply('Текст восстановлен. Схема пока недоступна — повторите /resume позже.'); return;
      }
      deliveredOperation(op.id);
    } catch (err) {
      console.error('[recovery] operation failed', op.id, err instanceof Error ? err.message : 'unknown');
      await ctx.reply('Связь прервалась. Номер запроса сохранён — повторите /resume позже.');
    }
  });
}
