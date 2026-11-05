import { type SyncStatus, useSyncStore } from '@/features/sync/syncStore';

function message(status: SyncStatus, pending: number): string {
  switch (status) {
    case 'synced':
      return '모든 여행을 서버에 저장했어요.';
    case 'pending':
      return `서버에 올리지 못한 변경이 ${pending}개 있어요.`;
    case 'offline':
      return pending > 0
        ? `인터넷에 연결되면 변경 ${pending}개를 서버에 올려요.`
        : '인터넷에 연결되면 서버와 맞춰요.';
    case 'error':
      return '서버와 맞추지 못했어요.';
    case 'needsUpdate':
      return '새 버전이 나왔어요. 앱을 닫았다가 다시 열어 주세요.';
    default:
      return '서버와 맞추고 있어요.';
  }
}

/** How syncing with the account goes, under the profile; "다시 시도" when it didn't go through. */
export function SyncNote() {
  const status = useSyncStore((state) => state.status);
  const pending = useSyncStore((state) => state.pending);
  const syncNow = useSyncStore((state) => state.syncNow);
  const retry = status === 'error' || status === 'pending';

  return (
    <p aria-live="polite" className="mt-4 text-sm break-keep text-gray-500">
      {message(status, pending)}
      {retry && (
        <>
          {' '}
          <button
            type="button"
            onClick={() => void syncNow()}
            className="-my-3 h-11 px-1 font-semibold text-brand-600"
          >
            다시 시도
          </button>
        </>
      )}
    </p>
  );
}
