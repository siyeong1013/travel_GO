import type { ReactNode } from 'react';
import { iconButtonClass } from '@/components/ui/buttonClass';
import { ChevronLeftIcon } from '@/components/ui/icons';
import { useGoBack } from '@/lib/useGoBack';

interface PageHeaderProps {
  title: string;
  /** Show a back button. */
  back?: boolean;
  /** Where "back" goes when there is no history to go back to. */
  backFallback?: string;
  right?: ReactNode;
}

export function PageHeader({ title, back = false, backFallback = '/', right }: PageHeaderProps) {
  const goBack = useGoBack(backFallback);

  return (
    <header className="pt-safe sticky top-0 z-10 border-b border-gray-100 bg-white/95 backdrop-blur">
      <div className="flex h-14 items-center gap-1 px-2">
        {back ? (
          <button
            type="button"
            onClick={goBack}
            aria-label="뒤로"
            className={iconButtonClass}
          >
            <ChevronLeftIcon />
          </button>
        ) : (
          <span className="w-2" />
        )}
        <h1 className="flex-1 truncate text-lg font-bold">{title}</h1>
        {right}
      </div>
    </header>
  );
}
