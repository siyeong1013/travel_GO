import { useParams } from 'react-router';
import { PageHeader } from '@/components/ui/PageHeader';

export function TripDetailPage() {
  const { tripId } = useParams();

  return (
    <>
      <PageHeader title="여행 상세" back />
      <main className="flex-1 px-4 py-6 text-sm text-gray-500">
        여행 <code className="rounded bg-gray-100 px-1">{tripId}</code>의 날짜별 일정이 들어갈
        자리입니다. (3단계)
      </main>
    </>
  );
}
