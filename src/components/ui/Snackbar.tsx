import { useEffect, useEffectEvent } from 'react';

interface SnackbarProps {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  /** Called when the time is up. */
  onClose: () => void;
  duration?: number;
}

/** Short notice floating above the bottom bar. Give it a new `key` for each message. */
export function Snackbar({ message, actionLabel, onAction, onClose, duration = 4000 }: SnackbarProps) {
  const timeUp = useEffectEvent(onClose);

  useEffect(() => {
    const timer = setTimeout(timeUp, duration);
    return () => clearTimeout(timer);
  }, [duration]);

  return (
    <div
      role="status"
      className="animate-fade-in fixed inset-x-4 bottom-[calc(5.5rem_+_env(safe-area-inset-bottom))] z-30 mx-auto flex max-w-[398px] items-center gap-3 rounded-2xl bg-gray-900 py-3 pr-2 pl-4 text-sm text-white shadow-lg"
    >
      <p className="line-clamp-2 min-w-0 flex-1">{message}</p>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="h-9 shrink-0 rounded-lg px-3 font-bold text-brand-100 active:bg-white/10"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
