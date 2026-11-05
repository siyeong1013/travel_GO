import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { BottomActionBar } from '@/components/ui/BottomActionBar';
import { Button } from '@/components/ui/Button';
import { buttonClass, iconButtonClass } from '@/components/ui/buttonClass';
import { EmptyState } from '@/components/ui/EmptyState';
import { GlobeIcon, MapPinIcon, PlusIcon, SettingsIcon, UserIcon } from '@/components/ui/icons';
import { PageHeader } from '@/components/ui/PageHeader';
import type { LocalDate, Trip } from '@/data/models';
import { InstallBanner } from '@/features/install/InstallBanner';
import { TripCard, TripHeroCard } from '@/features/trips/TripCard';
import { splitTrips } from '@/features/trips/tripDisplay';
import { useTrips } from '@/features/trips/useTrips';
import { toLocalDate } from '@/lib/dates';
import { supabaseConfig } from '@/lib/supabase';

export function TripListPage() {
  const { trips, status, error, reload } = useTrips();
  const today = toLocalDate();
  const { current, past, next } = splitTrips(trips, today);

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
      <div className="flex flex-col gap-8 px-4 pt-5 pb-6">
        {current.length > 0 && (
          <TripSection title="다가오는 여행" count={current.length}>
            {next && <TripHeroCard trip={next} today={today} />}
            <TripRows trips={next ? current.slice(1) : current} today={today} />
          </TripSection>
        )}
        {past.length > 0 && (
          <TripSection title="지난 여행" count={past.length}>
            <TripRows trips={past} today={today} />
          </TripSection>
        )}
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title="travel GO"
        right={
          <>
            <Link to="/countries" aria-label="다녀온 나라" className={iconButtonClass}>
              <GlobeIcon />
            </Link>
            {supabaseConfig() && (
              <Link to="/account" aria-label="계정" className={iconButtonClass}>
                <UserIcon />
              </Link>
            )}
            <Link to="/settings" aria-label="설정" className={iconButtonClass}>
              <SettingsIcon />
            </Link>
          </>
        }
      />
      <main className="flex flex-1 flex-col">
        <InstallBanner />
        {content}
      </main>
      <BottomActionBar>
        <Link to="/trips/new" className={buttonClass('primary', true)}>
          <PlusIcon width={20} height={20} />새 여행 만들기
        </Link>
      </BottomActionBar>
    </>
  );
}

function TripSection({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-3 text-lg font-bold">
        {title} <span className="font-semibold text-gray-400">{count}</span>
      </h2>
      {children}
    </section>
  );
}

function TripRows({ trips, today }: { trips: Trip[]; today: LocalDate }) {
  if (trips.length === 0) return null;
  return (
    <ul className="mt-2 flex flex-col">
      {trips.map((trip) => (
        <li key={trip.id}>
          <TripCard trip={trip} today={today} />
        </li>
      ))}
    </ul>
  );
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-3 px-4 pt-14 pb-5" aria-hidden="true">
      <div className="h-[184px] animate-pulse rounded-3xl bg-gray-100" />
      <div className="h-[76px] animate-pulse rounded-2xl bg-gray-100" />
    </div>
  );
}
