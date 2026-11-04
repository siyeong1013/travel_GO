import { useEffect } from 'react';
import { useRouteError } from 'react-router';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';

/**
 * A screen that failed to load or broke while showing. Mostly its code couldn't be loaded (offline
 * before the app kept it, or an update removed it and reloading once didn't help), so the way out
 * is to try again.
 */
export function RouteError() {
  const error = useRouteError();
  useEffect(() => console.error(error), [error]);

  return (
    <>
      <PageHeader title="travel GO" back />
      <main className="flex flex-1 flex-col items-center">
        <EmptyState
          title="화면을 불러오지 못했어요"
          description="다시 시도해 보고, 계속 안 되면 인터넷 연결을 확인해 주세요."
        />
        <Button variant="secondary" className="mb-16" onClick={() => window.location.reload()}>
          다시 시도
        </Button>
      </main>
    </>
  );
}
