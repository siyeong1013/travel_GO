import { type ReactNode, useId } from 'react';

/** For a button or link in a section's title row: a 44px target that keeps the row low. */
export const sectionActionClass =
  '-my-3 -mr-2 flex h-11 shrink-0 items-center rounded-full px-3 text-sm font-semibold text-brand-600 active:bg-brand-50';

interface PageSectionProps {
  title: string;
  description?: ReactNode;
  /** Small control at the end of the title row (see `sectionActionClass`). */
  action?: ReactNode;
  children: ReactNode;
}

/** A titled block of a full-screen page, separated by a hairline; a landmark named by its title. */
export function PageSection({ title, description, action, children }: PageSectionProps) {
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className="border-b border-gray-100 px-4 py-5">
      <div className="flex min-h-5 items-center justify-between gap-3">
        <h2 id={titleId} className="text-[15px] font-bold">
          {title}
        </h2>
        {action}
      </div>
      {/* Korean wraps between any syllables by default; keep words whole. */}
      {description && (
        <p className="mt-1 text-sm break-keep text-pretty text-gray-500">{description}</p>
      )}
      <div className="mt-3">{children}</div>
    </section>
  );
}
