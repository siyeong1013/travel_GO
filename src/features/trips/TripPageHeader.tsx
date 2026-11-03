import type { ReactNode, Ref } from 'react';
import { iconButtonClass, iconButtonOnCoverClass } from '@/components/ui/buttonClass';
import { ChevronLeftIcon } from '@/components/ui/icons';
import { useGoBack } from '@/lib/useGoBack';

interface TripPageHeaderProps {
  title: string;
  /** False at the top of the page, over the cover (transparent, white icons). */
  solid: boolean;
  /** Once the cover with its big title has scrolled away. */
  showTitle: boolean;
  right: ReactNode;
  ref?: Ref<HTMLElement>;
}

/**
 * The trip page's header: transparent over the trip cover at the top, a white bar as soon as the
 * page scrolls (so nothing scrolls under its icons), with the title once the cover's is gone.
 */
export function TripPageHeader({ title, solid, showTitle, right, ref }: TripPageHeaderProps) {
  const goBack = useGoBack();

  return (
    <header
      ref={ref}
      className={`pt-safe sticky top-0 z-10 border-b transition-colors duration-200 ${
        solid ? 'border-gray-100 bg-white/95 backdrop-blur' : 'border-transparent'
      }`}
    >
      <div className="flex h-14 items-center gap-1 px-2">
        <button
          type="button"
          onClick={goBack}
          aria-label="뒤로"
          className={solid ? iconButtonClass : iconButtonOnCoverClass}
        >
          <ChevronLeftIcon />
        </button>
        {/* The cover holds the heading; this repeats it once the cover is gone. */}
        <p
          aria-hidden="true"
          className={`flex-1 truncate text-lg font-bold transition-opacity duration-200 ${
            showTitle ? 'opacity-100' : 'opacity-0'
          }`}
        >
          {title}
        </p>
        {right}
      </div>
    </header>
  );
}
