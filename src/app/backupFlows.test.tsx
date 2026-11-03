/** @vitest-environment happy-dom */
import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { repositories } from '@/data';
import type { Trip } from '@/data/models';
import { createBackupFile, parseBackupFile } from '@/data/rules/backupFormat';
import { renderApp, resetApp } from '@/test/app';
import { backupData, makeItem, makeTrip, namedPlace, T0, typedCity } from '@/test/fixtures';

vi.mock('@/data', async () => {
  const { createTestRepositories } = await import('@/test/fixtures');
  return { repositories: createTestRepositories().repos };
});

let osaka: Trip;

beforeEach(async () => {
  await resetApp();
  osaka = await repositories.trips.create({
    title: '오사카 여행',
    city: typedCity('오사카'),
    startDate: '2026-11-10',
    endDate: '2026-11-11',
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, 'share');
  Reflect.deleteProperty(navigator, 'canShare');
});

/** What a download would save: the files handed to the link, with the names it gives them. */
function catchDownloads() {
  const files: File[] = [];
  const names: string[] = [];
  vi.spyOn(URL, 'createObjectURL').mockImplementation((file) => {
    files.push(file as File);
    return 'blob:backup';
  });
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    names.push(this.download);
  });
  return { files, names };
}

const jsonFile = (value: unknown, name = 'travel-go-backup.json') =>
  new File([JSON.stringify(value)], name, { type: 'application/json' });

describe('backup export', () => {
  it('saves everything as a file, and remembers when', async () => {
    await repositories.schedule.create({
      tripId: osaka.id,
      date: '2026-11-10',
      place: namedPlace('도톤보리'),
      memo: '',
    });
    const { files, names } = catchDownloads();
    const { user } = renderApp('/settings');
    expect(await screen.findByText('아직 내보낸 적이 없어요.')).toBeInTheDocument();
    // happy-dom has no share sheet.
    expect(screen.queryByRole('button', { name: '공유' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '파일로 저장' }));

    expect(await screen.findByText('백업 파일을 저장했어요.')).toBeInTheDocument();
    expect(names).toEqual([expect.stringMatching(/^travel-go-backup-\d{4}-\d\d-\d\d-\d{4}\.json$/)]);
    const saved = parseBackupFile(JSON.parse(await files[0]!.text()));
    expect(saved.trips.map((trip) => trip.title)).toEqual(['오사카 여행']);
    expect(saved.scheduleItems.map((item) => item.place.name)).toEqual(['도톤보리']);
    expect(screen.getByText(/^마지막으로 내보낸 때: /)).toBeInTheDocument();
    expect(localStorage.getItem('travel-go:last-backup')).toBe(saved.exportedAt);
  });

  it('shares the file where the share sheet takes files', async () => {
    const share = vi.fn<(data: ShareData) => Promise<void>>();
    share.mockRejectedValueOnce(new DOMException('closed', 'AbortError'));
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true });
    const { user } = renderApp('/settings');

    // Closing the share sheet: nothing left the device.
    await user.click(await screen.findByRole('button', { name: '공유' }));
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    expect(screen.getByText('아직 내보낸 적이 없어요.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '공유' }));
    expect(await screen.findByText(/^마지막으로 내보낸 때: /)).toBeInTheDocument();
    const [file] = share.mock.calls[1]![0].files!;
    expect(parseBackupFile(JSON.parse(await file!.text())).trips).toEqual([osaka]);
  });
});

describe('backup import', () => {
  it('merges a backup after showing what it will do, and every screen shows the result', async () => {
    const tokyo = makeTrip({ title: '도쿄 여행', startDate: '2026-12-01', endDate: '2026-12-03' });
    // The device's own trip is newer: its shorter dates stay, and the file's last-day item goes to
    // the inbox.
    const olderOsaka = { ...osaka, endDate: '2026-11-12', updatedAt: T0 };
    const backup = createBackupFile(
      backupData({
        trips: [olderOsaka, tokyo],
        scheduleItems: [
          makeItem({ tripId: osaka.id, date: '2026-11-12', place: namedPlace('공항') }),
          makeItem({ tripId: tokyo.id, date: '2026-12-01', place: namedPlace('시부야') }),
        ],
      }),
      '2026-11-03T05:20:00.000Z',
    );
    const { user } = renderApp('/');
    expect(await screen.findByRole('link', { name: /오사카 여행/ })).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: '설정' }));

    await user.upload(await screen.findByLabelText('백업 파일'), jsonFile(backup));

    const sheet = await screen.findByRole('dialog', { name: '백업 가져오기' });
    expect(sheet).toHaveTextContent('travel-go-backup.json');
    expect(sheet).toHaveTextContent('여행 2개 · 일정 2개 · 동행자 2개');
    expect(within(sheet).getByRole('radio', { name: '병합' })).toBeChecked();
    const preview = within(sheet).getByRole('region', { name: '미리보기' });
    await waitFor(() =>
      expect(preview).toHaveTextContent('새로 추가 4개여행 1개 · 일정 2개 · 동행자 1개'),
    );
    expect(preview).toHaveTextContent('갱신 0개');
    expect(preview).toHaveTextContent('유지 2개여행 1개 · 동행자 1개');
    expect(preview).toHaveTextContent('여행 기간 밖에 놓이는 일정 1개는 보관함으로 옮겨요.');

    await user.click(within(sheet).getByRole('button', { name: '병합하기' }));

    expect(await screen.findByText('가져왔어요. 새로 추가 4개, 갱신 0개.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(await repositories.schedule.listByTrip(osaka.id)).toEqual([
      expect.objectContaining({ date: null, place: namedPlace('공항') }),
    ]);
    // The list was loaded before the import, and shows what it brought.
    await user.click(screen.getByRole('button', { name: '뒤로' }));
    expect(await screen.findByRole('link', { name: /도쿄 여행/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /오사카 여행/ })).toBeInTheDocument();
  });

  it('replaces everything with a backup, or leaves it all when cancelled', async () => {
    const tokyo = makeTrip({ title: '도쿄 여행', startDate: '2026-12-01', endDate: '2026-12-03' });
    const backup = createBackupFile(
      backupData({
        trips: [tokyo],
        scheduleItems: [
          makeItem({ tripId: tokyo.id, date: '2026-12-01', place: namedPlace('시부야') }),
        ],
      }),
      T0,
    );
    const { user } = renderApp('/settings');
    const input = await screen.findByLabelText('백업 파일');

    await user.upload(input, jsonFile(backup));
    await user.click(
      within(await screen.findByRole('dialog', { name: '백업 가져오기' })).getByRole('button', {
        name: '취소',
      }),
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect((await repositories.trips.list()).map((trip) => trip.title)).toEqual(['오사카 여행']);

    await user.upload(input, jsonFile(backup));
    const sheet = await screen.findByRole('dialog', { name: '백업 가져오기' });
    await user.click(within(sheet).getByRole('radio', { name: '덮어쓰기' }));
    const preview = within(sheet).getByRole('region', { name: '미리보기' });
    await waitFor(() => expect(preview).toHaveTextContent('지워짐 2개여행 1개 · 동행자 1개'));
    expect(preview).toHaveTextContent('가져옴 3개여행 1개 · 일정 1개 · 동행자 1개');
    expect(sheet).toHaveTextContent('지금 데이터를 모두 지우고 파일 내용으로 바꿔요.');

    await user.click(within(sheet).getByRole('button', { name: '덮어쓰기' }));

    expect(await screen.findByText('백업 파일의 내용으로 바꿨어요.')).toBeInTheDocument();
    expect((await repositories.trips.list()).map((trip) => trip.title)).toEqual(['도쿄 여행']);
  });

  it('says what is wrong with a file that is not a backup it can read', async () => {
    const { user } = renderApp('/settings');
    const input = await screen.findByLabelText('백업 파일');

    await user.upload(input, new File(['{ trips: '], 'broken.json', { type: 'application/json' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('올바른 travel GO 백업 파일이 아니에요.');
    expect(alert).not.toHaveTextContent('문제 위치');

    const backup = createBackupFile(backupData({ trips: [makeTrip()] }), T0);
    const badDate = { ...backup, trips: [{ ...backup.trips[0], startDate: '2026-02-30' }] };
    await user.upload(input, jsonFile(badDate));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('문제 위치: $.trips[0].startDate'),
    );

    await user.upload(input, jsonFile({ ...backup, schemaVersion: 99 }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        '더 새로운 버전의 앱에서 만든 백업 파일이에요.',
      ),
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    // A good file clears the message.
    await user.upload(input, jsonFile(backup));
    expect(await screen.findByRole('dialog', { name: '백업 가져오기' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
