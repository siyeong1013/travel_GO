import type { ReactNode } from 'react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { ShareIcon } from '@/components/ui/icons';

/** How to add the app to the home screen on iOS, and why: the browser may clear a site's data. */
export function InstallGuideSheet({ onClose }: { onClose: () => void }) {
  return (
    <BottomSheet open onClose={onClose} title="홈 화면에 추가하기">
      <div className="px-3 pb-2">
        <p className="text-sm leading-relaxed break-keep text-gray-600">
          홈 화면에 추가하면 앱처럼 바로 열리고, 여행 기록도 안전하게 남아요. Safari는 한동안 열지
          않은 사이트의 데이터를 지울 수 있어요.
        </p>
        <ol className="mt-4 flex flex-col gap-3">
          <Step number={1}>
            Safari의 공유 버튼
            <ShareIcon width={18} height={18} className="ml-1 inline-block align-[-3px]" />을
            눌러요. 안 보이면 ⋯ 버튼을 먼저 눌러요.
          </Step>
          <Step number={2}>‘홈 화면에 추가’를 골라요. 안 보이면 목록을 위로 밀어 보세요.</Step>
          <Step number={3}>
            오른쪽 위의 ‘추가’를 누르면 홈 화면에{' '}
            <span className="whitespace-nowrap">travel GO가</span> 생겨요.
          </Step>
        </ol>
        <p className="mt-4 rounded-xl bg-gray-50 px-3.5 py-3 text-sm leading-relaxed break-keep text-gray-600">
          이미 만든 여행이 있다면, 추가하기 전에 설정의 ‘백업 내보내기’로 파일을 저장해 두세요. 홈
          화면 앱에서 여행이 보이지 않으면 ‘백업 가져오기’로 그 파일을 불러오면 돼요.
        </p>
        <Button block className="mt-5" onClick={onClose}>
          확인
        </Button>
      </div>
    </BottomSheet>
  );
}

function Step({ number, children }: { number: number; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span
        aria-hidden="true"
        className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-500 text-xs font-bold text-white"
      >
        {number}
      </span>
      <p className="min-w-0 flex-1 text-[15px] leading-6 break-keep">{children}</p>
    </li>
  );
}
