import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SharingRefusedError } from '@/data/sharing/sharing';
import type { SyncChange } from '@/data/sync/records';
import { createSyncDatabase, type SyncDatabase } from '@/test/syncDatabase';
import sharingMigration from '../../../supabase/migrations/20261105200000_sharing.sql?raw';
import syncMigration from '../../../supabase/migrations/20261105120000_sync.sql?raw';

// Sharing a trip (supabase/migrations/*_sharing.sql) on a real Postgres (PGlite), through the
// app's calls (createSharingServer).

const OWNER = 'aaaaaaaa-0000-4000-8000-000000000001';
const FRIEND = 'bbbbbbbb-0000-4000-8000-000000000002';
const STRANGER = 'cccccccc-0000-4000-8000-000000000003';
const TRIP = '11111111-0000-4000-8000-000000000001';
const ITEM = '22222222-0000-4000-8000-000000000001';
const T1 = '2026-11-05T01:00:00.000Z';
const T2 = '2026-11-05T02:00:00.000Z';
const DAY = 24 * 60 * 60 * 1000;

const tripChange = (updatedAt: string): SyncChange =>
  ({
    id: TRIP,
    tripId: TRIP,
    kind: 'trip',
    format: 4,
    updatedAt,
    deleted: false,
    data: { id: TRIP, title: '오사카 여행', city: { name: '오사카' }, startDate: '2026-12-01', endDate: '2026-12-03', updatedAt },
  }) as unknown as SyncChange;

const itemChange = (updatedAt: string, memo = ''): SyncChange =>
  ({
    id: ITEM,
    tripId: TRIP,
    kind: 'scheduleItem',
    format: 4,
    updatedAt,
    deleted: false,
    data: { id: ITEM, tripId: TRIP, memo, updatedAt },
  }) as unknown as SyncChange;

const tripDeletion = (updatedAt: string): SyncChange => ({
  id: TRIP,
  tripId: TRIP,
  kind: 'trip',
  format: 4,
  updatedAt,
  deleted: true,
});

let server: SyncDatabase;

beforeEach(async () => {
  server = await createSyncDatabase();
  await server.addUser(OWNER, { full_name: '김여행', avatar_url: 'http://k.kakaocdn.net/me.jpg' });
  await server.addUser(FRIEND, { name: 'Min', picture: 'https://lh3.googleusercontent.com/min' });
  await server.addUser(STRANGER);
});
afterEach(() => server.close());

const owner = () => server.sharingFor(OWNER);
const friend = () => server.sharingFor(FRIEND);
const visitor = () => server.sharingFor(null);

const upload = () => server.serverFor(OWNER).push([tripChange(T1), itemChange(T1)]);
const statuses = async (results: Promise<{ status: string }[]>) => (await results).map((r) => r.status);
const refusal = (promise: Promise<unknown>) =>
  promise.then(
    () => 'done',
    (error: unknown) => (error instanceof SharingRefusedError ? error.reason : error),
  );

describe('invite links', () => {
  it('gives the owner one link per trip, good for 7 days', async () => {
    await upload();
    const invite = await owner().createInvite(TRIP);
    expect(invite.token).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(Math.abs(Date.parse(invite.expiresAt) - (Date.now() + 7 * DAY))).toBeLessThan(60_000);
    expect(await owner().createInvite(TRIP)).toEqual(invite);
    expect(await owner().currentInvite(TRIP)).toEqual(invite);
  });

  it('is only for the owner of a trip on the server', async () => {
    expect(await refusal(owner().createInvite(TRIP))).toBe('no_trip');
    await upload();
    expect(await refusal(friend().createInvite(TRIP))).toBe('forbidden');
    expect(await refusal(friend().currentInvite(TRIP))).toBe('forbidden');
    expect(await refusal(friend().revokeInvite(TRIP))).toBe('forbidden');
    await expect(visitor().createInvite(TRIP)).rejects.toThrow(/permission denied/);

    await server.serverFor(OWNER).push([tripDeletion(T2)]);
    expect(await refusal(owner().createInvite(TRIP))).toBe('gone');
  });

  it('stops working once cut, and the next link is a new one', async () => {
    await upload();
    const { token } = await owner().createInvite(TRIP);
    await owner().revokeInvite(TRIP);
    expect(await owner().currentInvite(TRIP)).toBeNull();
    expect(await visitor().preview(token)).toBeNull();
    expect(await friend().join(token)).toBeNull();
    expect((await owner().createInvite(TRIP)).token).not.toBe(token);
  });

  it('stops working after 7 days, and the next link is a new one', async () => {
    await upload();
    const { token } = await owner().createInvite(TRIP);
    await server.db.query(`update public.invites set expires_at = now() - interval '1 second'`);
    expect(await owner().currentInvite(TRIP)).toBeNull();
    expect(await visitor().preview(token)).toBeNull();
    expect(await friend().join(token)).toBeNull();
    expect((await owner().createInvite(TRIP)).token).not.toBe(token);
  });

  it('stops working when the owner deletes the trip', async () => {
    await upload();
    const { token } = await owner().createInvite(TRIP);
    await server.serverFor(OWNER).push([tripDeletion(T2)]);
    expect(await visitor().preview(token)).toBeNull();
    expect(await friend().join(token)).toBeNull();
  });

  it('shows what it is for, also to someone not signed in', async () => {
    await upload();
    const { token, expiresAt } = await owner().createInvite(TRIP);
    expect(await visitor().preview(token)).toEqual({
      tripId: TRIP,
      title: '오사카 여행',
      city: '오사카',
      startDate: '2026-12-01',
      endDate: '2026-12-03',
      inviter: '김여행',
      expiresAt,
    });
    expect(await visitor().preview('not-a-link')).toBeNull();
  });
});

describe('joining', () => {
  it('lets a friend read and change the trip like its owner, but not delete it', async () => {
    await upload();
    const { token } = await owner().createInvite(TRIP);
    expect(await friend().join(token)).toEqual({ tripId: TRIP, role: 'member', joined: true });
    expect(await friend().join(token)).toEqual({ tripId: TRIP, role: 'member', joined: false });
    expect(await owner().join(token)).toEqual({ tripId: TRIP, role: 'owner', joined: false });
    await expect(visitor().join(token)).rejects.toThrow(/permission denied/);

    const friends = server.serverFor(FRIEND);
    expect(await friends.memberships()).toEqual([{ tripId: TRIP, role: 'member' }]);
    expect((await friends.pullTrip(TRIP, 0, 100)).map((row) => row.kind)).toEqual(['trip', 'scheduleItem']);
    expect(await statuses(friends.push([itemChange(T2, 'from Min')]))).toEqual(['applied']);
    expect(await statuses(friends.push([tripDeletion(T2)]))).toEqual(['forbidden']);

    const ownerRows = await server.serverFor(OWNER).pull(0, 100);
    expect(ownerRows.find((row) => row.id === ITEM)?.data).toMatchObject({ memo: 'from Min' });
    expect(await server.serverFor(STRANGER).pull(0, 100)).toEqual([]);
    expect(await statuses(server.serverFor(STRANGER).push([itemChange(T2)]))).toEqual(['forbidden']);
  });

  it('shows who is in the trip, the owner first, to them only', async () => {
    await upload();
    await friend().join((await owner().createInvite(TRIP)).token);
    const people = [
      { userId: OWNER, role: 'owner', name: '김여행', avatarUrl: 'https://k.kakaocdn.net/me.jpg' },
      { userId: FRIEND, role: 'member', name: 'Min', avatarUrl: 'https://lh3.googleusercontent.com/min' },
    ];
    expect(await owner().people(TRIP)).toMatchObject(people);
    expect(await friend().people(TRIP)).toMatchObject(people);
    expect(await refusal(server.sharingFor(STRANGER).people(TRIP))).toBe('forbidden');
  });

  it('lets a member leave, and the owner take one out', async () => {
    await upload();
    const { token } = await owner().createInvite(TRIP);
    const friends = server.serverFor(FRIEND);

    await friend().join(token);
    await friend().leave(TRIP);
    expect(await friends.memberships()).toEqual([]);
    expect(await friends.pull(0, 100)).toEqual([]);
    expect(await statuses(friends.push([itemChange(T2)]))).toEqual(['forbidden']);
    expect(await refusal(owner().leave(TRIP))).toBe('forbidden');

    await friend().join(token);
    expect(await refusal(friend().removeMember(TRIP, OWNER))).toBe('forbidden');
    expect(await refusal(owner().removeMember(TRIP, OWNER))).toBe('forbidden');
    await owner().removeMember(TRIP, FRIEND);
    expect(await friends.memberships()).toEqual([]);
    expect((await owner().people(TRIP)).map((person) => person.userId)).toEqual([OWNER]);
  });

  it('keeps the links out of reach but through the calls', async () => {
    await upload();
    await owner().createInvite(TRIP);
    await expect(
      server.as(OWNER, (tx) => tx.query('select * from public.invites')),
    ).rejects.toThrow(/permission denied/);
    await expect(
      server.as(FRIEND, (tx) => tx.query('select private.new_token()')),
    ).rejects.toThrow(/permission denied/);
  });
});

describe('the migrations', () => {
  it('put the records on Realtime, and change nothing when run again', async () => {
    const { rows } = await server.db.query<{ tablename: string }>(
      `select tablename from pg_publication_tables where pubname = 'supabase_realtime'`,
    );
    expect(rows).toEqual([{ tablename: 'records' }]);

    await upload();
    const { token } = await owner().createInvite(TRIP);
    await server.db.exec(syncMigration);
    await server.db.exec(sharingMigration);
    expect(await owner().currentInvite(TRIP)).toMatchObject({ token });
  });
});
