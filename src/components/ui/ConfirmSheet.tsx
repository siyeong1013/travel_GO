import type { ReactNode } from 'react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';

interface ConfirmSheetProps {
  open: boolean;
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  tone?: 'primary' | 'danger';
  /** Disables the buttons while the action runs. */
  busy?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onClose: () => void;
}

/** Confirmation step for destructive actions, with both buttons in the thumb zone. */
export function ConfirmSheet({
  open,
  title,
  description,
  confirmLabel,
  tone = 'primary',
  busy = false,
  error,
  onConfirm,
  onClose,
}: ConfirmSheetProps) {
  return (
    <BottomSheet open={open} onClose={busy ? () => {} : onClose} title={title}>
      <div className="px-3 pb-2">
        {description && <p className="text-sm leading-relaxed text-gray-600">{description}</p>}
        {error && (
          <p role="alert" className="mt-3 text-sm text-red-500">
            {error}
          </p>
        )}
        <div className="mt-5 grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            취소
          </Button>
          <Button variant={tone} onClick={onConfirm} disabled={busy}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
}
