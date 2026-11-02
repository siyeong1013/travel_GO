import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { BottomSheet, SheetAction } from '@/components/ui/BottomSheet';
import { buttonClass, iconButtonClass } from '@/components/ui/buttonClass';
import { ConfirmSheet } from '@/components/ui/ConfirmSheet';
import { EmptyState } from '@/components/ui/EmptyState';
import { MapPinIcon, MoreIcon, TrashIcon } from '@/components/ui/icons';
import { PageHeader } from '@/components/ui/PageHeader';
import { TripPhaseBadge } from '@/features/trips/TripPhaseBadge';
import { useTripStore } from '@/features/trips/tripStore';
import { useTrips } from '@/features/trips/useTrips';
import { toLocalDate } from '@/lib/dates';
import { errorMessage } from '@/lib/errorMessage';
import { formatDateRange, formatTripLength } from '@/lib/format';

export function TripDetailPage() {
  const { tripId } = useParams();
  const navigate = useNavigate();
  const { trips, status } = useTrips();
  const removeTrip = useTripStore((state) => state.remove);
  const trip = trips.find((t) => t.id === tripId);

  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  if (!trip) {
    // Right after deleting, until the navigation below lands.
    if (deleting) return null;
    if (status === 'idle' || status === 'loading') return <PageHeader title="" back />;
    return (
      <>
        <PageHeader title="travel GO" back />
        <main className="flex flex-1 flex-col items-center">
          <EmptyState title="여행을 찾을 수 없어요" description="삭제되었거나 잘못된 주소예요." />
          <Link to="/" replace className={`${buttonClass('secondary')} mb-16`}>
            여행 목록으로
          </Link>
        </main>
      </>
    );
  }

  const today = toLocalDate();

  async function handleDelete(id: string) {
    setDeleting(true);
    setDeleteError(null);
    try {
      await removeTrip(id);
      navigate('/', { replace: true });
    } catch (error) {
      console.error(error);
      setDeleteError(errorMessage(error));
      setDeleting(false);
    }
  }

  return (
    <>
      <PageHeader
        title={trip.title}
        back
        right={
          <button
            type="button"
            aria-label="여행 메뉴"
            className={iconButtonClass}
            onClick={() => setMenuOpen(true)}
          >
            <MoreIcon />
          </button>
        }
      />
      <main className="flex flex-1 flex-col">
        <section className="border-b border-gray-100 px-4 py-4">
          <div className="flex items-center gap-2">
            <TripPhaseBadge trip={trip} today={today} />
            <p className="flex min-w-0 items-center gap-1 text-sm text-gray-600">
              <MapPinIcon width={14} height={14} className="shrink-0 text-gray-400" />
              <span className="truncate">{trip.city.name}</span>
            </p>
          </div>
          <p className="mt-2 text-base font-semibold">
            {formatDateRange(trip.startDate, trip.endDate, today)} ·{' '}
            {formatTripLength(trip.startDate, trip.endDate)}
          </p>
        </section>
        <p className="px-4 py-6 text-sm text-gray-500">날짜별 일정이 들어갈 자리입니다. (3단계)</p>
      </main>

      <BottomSheet open={menuOpen} onClose={() => setMenuOpen(false)} title="여행 관리">
        <SheetAction
          tone="danger"
          icon={<TrashIcon width={20} height={20} />}
          onClick={() => {
            setMenuOpen(false);
            setConfirmOpen(true);
          }}
        >
          여행 삭제
        </SheetAction>
      </BottomSheet>

      <ConfirmSheet
        open={confirmOpen}
        title={`'${trip.title}' 여행을 삭제할까요?`}
        description="이 여행의 일정도 모두 함께 삭제되고, 되돌릴 수 없어요."
        confirmLabel="삭제"
        tone="danger"
        busy={deleting}
        error={deleteError}
        onConfirm={() => void handleDelete(trip.id)}
        onClose={() => {
          setConfirmOpen(false);
          setDeleteError(null);
        }}
      />
    </>
  );
}
