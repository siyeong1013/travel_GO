import { useState } from 'react';
import { BottomSheet, SheetAction } from '@/components/ui/BottomSheet';
import { iconButtonClass } from '@/components/ui/buttonClass';
import { ConfirmSheet } from '@/components/ui/ConfirmSheet';
import { MoreIcon, TrashIcon } from '@/components/ui/icons';
import type { Trip } from '@/data/models';
import { errorMessage } from '@/lib/errorMessage';

interface TripActionsProps {
  trip: Trip;
  /** Number of schedule items deleted along with the trip (shown in the confirmation). */
  itemCount: number;
  /** Errors thrown here are shown in the confirmation sheet. */
  onDelete: () => Promise<void>;
}

/** Header "⋯" button with the trip menu and the delete confirmation. */
export function TripActions({ trip, itemCount, onDelete }: TripActionsProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setBusy(true);
    setError(null);
    try {
      await onDelete();
    } catch (err) {
      console.error(err);
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        aria-label="여행 메뉴"
        className={iconButtonClass}
        onClick={() => setMenuOpen(true)}
      >
        <MoreIcon />
      </button>

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
        description={
          itemCount > 0
            ? `이 여행의 일정 ${itemCount}개도 함께 삭제되고, 되돌릴 수 없어요.`
            : '되돌릴 수 없어요.'
        }
        confirmLabel="삭제"
        tone="danger"
        busy={busy}
        error={error}
        onConfirm={() => void handleConfirm()}
        onClose={() => {
          setConfirmOpen(false);
          setError(null);
        }}
      />
    </>
  );
}
