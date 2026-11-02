import { Link } from 'react-router';
import { BottomActionBar } from '@/components/ui/BottomActionBar';
import { Button } from '@/components/ui/Button';
import { buttonClass, iconButtonClass } from '@/components/ui/buttonClass';
import { EmptyState } from '@/components/ui/EmptyState';
import { MapPinIcon, PlusIcon, SettingsIcon } from '@/components/ui/icons';
import { PageHeader } from '@/components/ui/PageHeader';
import type { LocalDate, Trip } from '@/data/models';
import { TripCard } from '@/features/trips/TripCard';
import { splitTrips } from '@/features/trips/tripDisplay';
import { useTrips } from '@/features/trips/useTrips';
import { toLocalDate } from '@/lib/dates';

export function TripListPage() {
  const { trips, status, error, reload } = useTrips();
  const today = toLocalDate();
  const { current, past } = splitTrips(trips, today);

  let content;
  if (status === 'error' && trips.length === 0) {
    content = (
      <div className="flex flex-1 flex-col items-center">
        <EmptyState title="여행 목록을 불러오지 못했어요" description={error ?? undefined} />
        <Button variant="secondary" onClick={() => void reload()}>
          다시 시도
        </Button>
      </div>
    );
  } else if (trips.length === 0) {
    content =
      status === 'ready' ? (
        <EmptyState
          icon={<MapPinIcon width={48} height={48} />}
          title="아직 여행이 없어요"
          description="아래 버튼으로 첫 여행을 만들어 보세요."
        />
      ) : (
        <ListSkeleton />
      );
  } else {
    content = (
      <div className="flex flex-col gap-8 px-4 py-5">
        <TripSection title="다가오는 여행" trips={current} today={today} />
        <TripSection title="지난 여행" trips={past} today={today} />
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title="travel GO"
        right={
          <Link to="/settings" aria-label="설정" className={iconButtonClass}>
            <SettingsIcon />
          </Link>
        }
      />
      <main className="flex flex-1 flex-col">{content}</main>
      <BottomActionBar>
        <Link to="/trips/new" className={buttonClass('primary', true)}>
          <PlusIcon width={20} height={20} />새 여행 만들기
        </Link>
      </BottomActionBar>
    </>
  );
}

function TripSection({ title, trips, today }: { title: string; trips: Trip[]; today: LocalDate }) {
  if (trips.length === 0) return null;
  return (
    <section>
      <h2 className="mb-3 text-sm font-bold text-gray-500">
        {title} <span className="font-semibold text-gray-400">{trips.length}</span>
      </h2>
      <ul className="flex flex-col gap-3">
        {trips.map((trip) => (
          <li key={trip.id}>
            <TripCard trip={trip} today={today} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-3 px-4 py-5" aria-hidden="true">
      {[0, 1].map((i) => (
        <div key={i} className="h-[94px] animate-pulse rounded-2xl bg-gray-100" />
      ))}
    </div>
  );
}
