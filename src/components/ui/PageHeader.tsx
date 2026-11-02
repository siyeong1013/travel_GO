import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { iconButtonClass } from '@/components/ui/buttonClass';
import { ChevronLeftIcon } from '@/components/ui/icons';

interface PageHeaderProps {
  title: string;
  /** Show a back button. Falls back to `/` when there is no history. */
  back?: boolean;
  right?: ReactNode;
}

export function PageHeader({ title, back = false, right }: PageHeaderProps) {
  const navigate = useNavigate();

  const goBack = () => {
    if (window.history.state?.idx > 0) navigate(-1);
    else navigate('/', { replace: true });
  };

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
