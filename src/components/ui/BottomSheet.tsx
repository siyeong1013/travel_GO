import { type ButtonHTMLAttributes, type ReactNode, useEffect, useId, useRef } from 'react';

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}

/**
 * Modal sheet anchored to the bottom (thumb zone). Built on `<dialog>`, so focus is trapped
 * and Esc closes it. Mounted only while open; closes on backdrop tap or Esc.
 */
export function BottomSheet({ open, ...props }: BottomSheetProps) {
  return open ? <SheetDialog {...props} /> : null;
}

/** Open sheets. The page scrolls again when the last one closes, whatever the order. */
let openSheets = 0;

/** Stops the page behind the sheets from scrolling. Returns the release. */
function lockPageScroll() {
  if (openSheets++ === 0) document.documentElement.style.overflow = 'hidden';
  return () => {
    if (--openSheets === 0) document.documentElement.style.overflow = '';
  };
}

function SheetDialog({ onClose, title, children }: Omit<BottomSheetProps, 'open'>) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current!;
    if (!dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    }
    // A count, not "restore what was there": a sheet on a sheet (delete confirmation over the
    // editor) can unmount together with it, parent first, which restored the lock for good.
    const release = lockPageScroll();
    return () => {
      release();
      if (dialog.open) dialog.close?.();
    };
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={title ? titleId : undefined}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        // The backdrop belongs to the dialog element itself; the panel covers the rest.
        if (event.target === event.currentTarget) onClose();
      }}
      className="animate-sheet-in mx-auto mt-auto mb-0 max-h-[85dvh] w-full max-w-[430px] bg-transparent p-0 backdrop:bg-black/40 motion-reduce:animate-none"
    >
      <div className="pb-safe flex max-h-[85dvh] flex-col rounded-t-3xl bg-white shadow-xl">
        <div className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-gray-300" />
        {title && (
          <h2 id={titleId} className="shrink-0 px-5 pt-4 pb-1 text-lg font-bold">
            {title}
          </h2>
        )}
        <div className="overflow-y-auto px-2 pt-2">{children}</div>
      </div>
    </dialog>
  );
}

interface SheetActionProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: ReactNode;
  tone?: 'default' | 'danger';
}

/** Full-width row button for action menus inside a `BottomSheet`. */
export function SheetAction({ icon, tone = 'default', children, className, ...props }: SheetActionProps) {
  return (
    <button
      type="button"
      className={`flex h-14 w-full items-center gap-3 rounded-xl px-3 text-left text-base font-medium active:bg-gray-100 ${
        tone === 'danger' ? 'text-red-500' : 'text-gray-900'
      } ${className ?? ''}`}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
}
