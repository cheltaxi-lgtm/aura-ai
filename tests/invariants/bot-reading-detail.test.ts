import { describe, expect, it } from 'vitest';
import { botReadingDetail } from '@/lib/telegram/bot-product-service';
import { createSession } from '@/lib/session';
import { query } from '@/lib/db';
import { createTestUser } from './db/fixtures';
import { hasTestDb, installDbLifecycle } from './db/setup';

describe.skipIf(!hasTestDb)('owned Telegram reading details', () => {
  installDbLifecycle();
  it('preserves reversed cards and uses neutral positions when no saved spread exists', async () => {
    const user = await createTestUser();
    const session = await createSession(undefined, user.id);
    await query("UPDATE sessions SET cards=$2::jsonb, spread_id=NULL WHERE id=$1", [session.id, JSON.stringify(['Луна (перев.)', 'Солнце'])]);
    const detail = await botReadingDetail(user.id, session.id);
    expect(detail?.structuredCards).toEqual([
      { name: 'Луна', reversed: true, position: 0, positionLabel: 'Карта 1' },
      { name: 'Солнце', reversed: false, position: 1, positionLabel: 'Карта 2' },
    ]);
    expect(detail?.matrixReportId).toBeNull();
  });
  it('never reveals another owner’s cards or matrix identity', async () => {
    const owner = await createTestUser(), stranger = await createTestUser();
    const session = await createSession(undefined, owner.id);
    expect(await botReadingDetail(stranger.id, session.id)).toBeNull();
  });
});
