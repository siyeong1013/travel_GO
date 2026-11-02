import { BottomActionBar } from '@/components/ui/BottomActionBar';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';

export function TripCreatePage() {
  return (
    <>
      <PageHeader title="새 여행" back />
      <main className="flex-1 px-4 py-6 text-sm text-gray-500">
        여행 이름, 도시, 기간 입력 폼이 들어갈 자리입니다. (2단계)
      </main>
      <BottomActionBar>
        <Button block disabled>
          만들기
        </Button>
      </BottomActionBar>
    </>
  );
}
