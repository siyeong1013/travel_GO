import { useState } from 'react';
import { useNavigate } from 'react-router';
import { BottomSheet, SheetAction } from '@/components/ui/BottomSheet';
import { iconButtonClass } from '@/components/ui/buttonClass';
import { ConfirmSheet } from '@/components/ui/ConfirmSheet';
import { MoreIcon, PencilIcon, TrashIcon } from '@/components/ui/icons';
import type { Trip } from '@/data/models';
import { errorMessage } from '@/lib/errorMessage';
import { josa } from '@/lib/format';

interface TripActionsProps {
  trip: Trip;
  /** Schedule items and expenses deleted along with the trip (shown in the confirmation). */
  itemCount: number;
  expenseCount: number;
  /** Errors thrown here are shown in the confirmation sheet. */
  onDelete: () => Promise<void>;
}

/** Header "⋯" button with the trip menu and the delete confirmation. */
export function TripActions({ trip, itemCount, expenseCount, onDelete }: TripActionsProps) {
  const navigate = useNavigate();
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
          icon={<PencilIcon width={20} height={20} />}
          onClick={() => {
            setMenuOpen(false);
            void navigate(`/trips/${trip.id}/edit`);
          }}
        >
          여행 정보 수정
        </SheetAction>
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
        description={deleteDescription(itemCount, expenseCount)}
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

/** `이 여행의 일정 2개와 지출 3건도 함께 삭제되고, 되돌릴 수 없어요.` */
function deleteDescription(itemCount: number, expenseCount: number): string {
  const parts = [];
  if (itemCount > 0) parts.push(`일정 ${itemCount}개`);
  if (expenseCount > 0) parts.push(`지출 ${expenseCount}건`);
  if (parts.length === 0) return '되돌릴 수 없어요.';
  const what = parts.length === 2 ? `${josa(parts[0]!, '과/와')} ${parts[1]}` : parts[0];
  return `이 여행의 ${what}도 함께 삭제되고, 되돌릴 수 없어요.`;
}
