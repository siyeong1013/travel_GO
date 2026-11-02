import { useState } from 'react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { InboxIcon } from '@/components/ui/icons';
import type { LocalDate } from '@/data/models';
import type { TripUpdateOptions } from '@/data/repositories';
import { errorMessage } from '@/lib/errorMessage';
import { formatDate } from '@/lib/format';

type OutOfRangeAction = NonNullable<TripUpdateOptions['outOfRangeItems']>;

interface OutOfRangeSheetProps {
  /** Items that would end up outside the new dates. */
  count: number;
  /** Days of those items, in order. */
  dates: LocalDate[];
  /** Saves the trip with the chosen action; errors are shown in the sheet. */
  onChoose: (action: OutOfRangeAction) => Promise<void>;
  onClose: () => void;
}

function formatDates(dates: LocalDate[]): string {
  const shown = dates.slice(0, 3).map((date) => formatDate(date));
  return dates.length > 3 ? `${shown.join(', ')} 외 ${dates.length - 3}일` : shown.join(', ');
}

/** Asked when shortened trip dates leave scheduled items outside: inbox (safe default) or delete. */
export function OutOfRangeSheet({ count, dates, onChoose, onClose }: OutOfRangeSheetProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function choose(action: OutOfRangeAction) {
    setBusy(true);
    setError(null);
    try {
      await onChoose(action);
    } catch (err) {
      console.error(err);
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <BottomSheet open onClose={busy ? () => {} : onClose} title={`여행 기간 밖 일정 ${count}개`}>
      <div className="px-3 pb-2">
        <p className="text-sm leading-relaxed text-gray-600">
          {dates.length > 0 && (
            <>
              빠지는 날짜: {formatDates(dates)}
              <br />
            </>
          )}
          이 일정들을 어떻게 할까요?
        </p>
        {error && (
          <p role="alert" className="mt-3 text-sm text-red-500">
            {error}
          </p>
        )}
        <div className="mt-5 flex flex-col gap-2">
          <Button block disabled={busy} onClick={() => void choose('moveToInbox')}>
            <InboxIcon width={20} height={20} />
            보관함으로 옮기기
          </Button>
          <Button
            block
            variant="secondary"
            className="text-red-500"
            disabled={busy}
            onClick={() => void choose('delete')}
          >
            일정 {count}개 삭제
          </Button>
          <Button block variant="secondary" disabled={busy} onClick={onClose}>
            취소
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
}
