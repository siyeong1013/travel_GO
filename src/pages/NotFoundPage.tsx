import { Link } from 'react-router';
import { buttonClass } from '@/components/ui/buttonClass';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';

export function NotFoundPage() {
  return (
    <>
      <PageHeader title="travel GO" back />
      <main className="flex flex-1 flex-col items-center">
        <EmptyState title="페이지를 찾을 수 없어요" />
        <Link to="/" replace className={`${buttonClass('secondary')} mb-16`}>
          여행 목록으로
        </Link>
      </main>
    </>
  );
}
