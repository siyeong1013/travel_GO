import { describe, expect, it } from 'vitest';
import { makeMeCompanion, myCompanion } from '@/data/rules/companion';
import { makeCompanion, T0 } from '@/test/fixtures';

const TRIP = '11111111-0000-4000-8000-000000000001';
const OWNER = 'aaaaaaaa-0000-4000-8000-000000000001';
const FRIEND = 'bbbbbbbb-0000-4000-8000-000000000002';

describe('myCompanion', () => {
  const me = makeMeCompanion(TRIP, T0);
  const minsu = makeCompanion({ tripId: TRIP, name: '민수' });

  it('is "나" in a trip that isn’t shared, signed in or not', () => {
    expect(myCompanion([me, minsu], null, undefined)).toBe(me);
    expect(myCompanion([me, minsu], OWNER, 'owner')).toBe(me);
  });

  it('is the one linked to the account', () => {
    const linked = { ...minsu, accountId: FRIEND };
    const owners = { ...me, accountId: OWNER };
    expect(myCompanion([owners, linked], FRIEND, 'member')).toBe(linked);
    expect(myCompanion([owners, linked], OWNER, 'owner')).toBe(owners);
  });

  it('is nobody yet for a friend who joined and hasn’t picked', () => {
    expect(myCompanion([me, minsu], FRIEND, 'member')).toBeUndefined();
    // Nor "나" of another account.
    expect(myCompanion([{ ...me, accountId: OWNER }, minsu], FRIEND, undefined)).toBeUndefined();
  });
});
