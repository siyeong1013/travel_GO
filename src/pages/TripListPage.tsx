import { Link } from 'react-router';
import { BottomActionBar } from '@/components/ui/BottomActionBar';
import { buttonClass } from '@/components/ui/buttonClass';
import { EmptyState } from '@/components/ui/EmptyState';
import { MapPinIcon, PlusIcon, SettingsIcon } from '@/components/ui/icons';
import { PageHeader } from '@/components/ui/PageHeader';

export function TripListPage() {
  return (
    <>
      <PageHeader
        title="travel GO"
        right={
          <Link
            to="/settings"
            aria-label="설정"
            className="flex size-11 items-center justify-center rounded-full text-gray-600 active:bg-gray-100"
          >
            <SettingsIcon />
          </Link>
        }
      />
      <main className="flex flex-1 flex-col">
        <EmptyState
          icon={<MapPinIcon width={48} height={48} />}
          title="아직 여행이 없어요"
          description="아래 버튼으로 첫 여행을 만들어 보세요."
        />
      </main>
      <BottomActionBar>
        <Link to="/trips/new" className={buttonClass('primary', true)}>
          <PlusIcon width={20} height={20} />새 여행 만들기
        </Link>
      </BottomActionBar>
    </>
  );
}
