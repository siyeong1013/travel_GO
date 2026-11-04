import { useId, useState } from 'react';
import { iconButtonClass } from '@/components/ui/buttonClass';
import { CloseIcon } from '@/components/ui/icons';
import { closeInstallBanner, showsInstallBanner } from '@/features/install/installGuide';
import { InstallGuideSheet } from '@/features/install/InstallGuideSheet';

/**
 * On iOS in the browser: a suggestion to add the app to the home screen, with the steps. Once
 * closed it stays closed; the steps stay in settings.
 */
export function InstallBanner() {
  const [shown, setShown] = useState(showsInstallBanner);
  const [guideOpen, setGuideOpen] = useState(false);
  const titleId = useId();

  if (!shown) return null;

  return (
    <>
      <section
        aria-labelledby={titleId}
        className="relative mx-4 mt-4 flex gap-3.5 rounded-2xl bg-brand-50 py-4 pr-11 pl-4"
      >
        <img src="/favicon.svg" alt="" className="size-11 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1">
          <h2 id={titleId} className="text-[15px] font-bold">
            홈 화면에 추가해 주세요
          </h2>
          <p className="mt-0.5 text-sm break-keep text-gray-600">
            앱처럼 바로 열리고, 여행 기록도 안전하게 남아요.
          </p>
          <button
            type="button"
            onClick={() => setGuideOpen(true)}
            className="-mx-2 -mb-2.5 h-11 rounded-full px-2 text-sm font-semibold text-brand-600 active:bg-brand-100"
          >
            추가하는 방법 보기
          </button>
        </div>
        <button
          type="button"
          aria-label="설치 안내 닫기"
          onClick={() => {
            closeInstallBanner();
            setShown(false);
          }}
          className={`absolute top-1 right-1 ${iconButtonClass}`}
        >
          <CloseIcon width={20} height={20} />
        </button>
      </section>
      {guideOpen && <InstallGuideSheet onClose={() => setGuideOpen(false)} />}
    </>
  );
}
