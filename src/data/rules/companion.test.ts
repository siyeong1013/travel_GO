import { describe, expect, it } from 'vitest';
import {
  companionNameFor,
  makeMeCompanion,
  myCompanion,
  myCompanionStep,
} from '@/data/rules/companion';
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

describe('companionNameFor', () => {
  it('is the login’s name, numbered when taken', () => {
    const others = [{ name: '나' }, { name: '민수' }, { name: '민수 2' }];
    expect(companionNameFor(' Jane Doe ', others)).toBe('Jane Doe');
    expect(companionNameFor('민수', others)).toBe('민수 3');
    expect(companionNameFor('', others)).toBe('친구');
  });

  it('keeps to the name length limit', () => {
    const long = 'Christopher Alexander Johnson';
    expect(companionNameFor(long, [])).toBe('Christopher Alexande');
    expect(companionNameFor(long, [{ name: 'Christopher Alexande' }])).toBe('Christopher Alexan 2');
  });
});

describe('myCompanionStep', () => {
  const me = makeMeCompanion(TRIP, T0);
  const minsu = makeCompanion({ tripId: TRIP, name: '민수' });
  const owner = { id: OWNER, name: '김여행' };
  const friend = { id: FRIEND, name: 'Jane Doe' };

  it('makes "나" theirs, under their name, in a trip of theirs', () => {
    expect(myCompanionStep([me, minsu], owner, undefined)).toEqual({
      kind: 'claim',
      id: me.id,
      name: '김여행',
    });
    const linked = { ...me, accountId: OWNER };
    expect(myCompanionStep([linked, minsu], owner, 'owner')).toEqual({
      kind: 'rename',
      id: me.id,
      name: '김여행',
    });
    // Named already: theirs to keep.
    expect(myCompanionStep([{ ...linked, name: '여행자' }], owner, 'owner')).toBeNull();
    // A login without a name: "나" stays.
    expect(myCompanionStep([me], { id: OWNER, name: '' }, 'owner')).toEqual({
      kind: 'claim',
      id: me.id,
      name: null,
    });
  });

  it('adds a friend who joined, or finds them by name', () => {
    const owners = { ...me, name: '김여행', accountId: OWNER };
    expect(myCompanionStep([owners], friend, 'member')).toEqual({ kind: 'add', name: 'Jane Doe' });
    const jane = makeCompanion({ tripId: TRIP, name: 'jane doe' });
    expect(myCompanionStep([owners, jane], friend, 'member')).toEqual({
      kind: 'claim',
      id: jane.id,
      name: null,
    });
    expect(myCompanionStep([owners, { ...jane, accountId: FRIEND }], friend, 'member')).toBeNull();
  });

  it('asks a friend when others in the ledger might be them, and never gives them "나"', () => {
    const owners = { ...me, name: '김여행', accountId: OWNER };
    expect(myCompanionStep([owners, minsu], friend, 'member')).toEqual({ kind: 'ask' });
    // The owner's "나", not linked yet, isn't one they could be.
    expect(myCompanionStep([me], friend, 'member')).toEqual({ kind: 'add', name: 'Jane Doe' });
  });
});
