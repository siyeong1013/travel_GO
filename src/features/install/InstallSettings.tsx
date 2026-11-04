import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { PageSection } from '@/components/ui/PageSection';
import { needsInstallGuide } from '@/features/install/installGuide';
import { InstallGuideSheet } from '@/features/install/InstallGuideSheet';

/** Settings section on iOS in the browser: the home screen steps, any time. */
export function InstallSettings() {
  const [needed] = useState(needsInstallGuide);
  const [guideOpen, setGuideOpen] = useState(false);

  if (!needed) return null;

  return (
    <>
      <PageSection
        title="홈 화면에 추가"
        description="홈 화면에 추가하면 앱처럼 바로 열리고, 여행 기록도 안전하게 남아요. Safari는 한동안 열지 않은 사이트의 데이터를 지울 수 있어요."
      >
        <Button variant="secondary" block onClick={() => setGuideOpen(true)}>
          추가하는 방법 보기
        </Button>
      </PageSection>
      {guideOpen && <InstallGuideSheet onClose={() => setGuideOpen(false)} />}
    </>
  );
}
