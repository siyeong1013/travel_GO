import { useParams } from 'react-router';
import { PageHeader } from '@/components/ui/PageHeader';
import { JoinTrip } from '@/features/sharing/JoinTrip';

export function JoinPage() {
  const { token = '' } = useParams();
  return (
    <>
      <PageHeader title="여행 초대" back />
      <main className="flex flex-1 flex-col">
        <JoinTrip token={token} />
      </main>
    </>
  );
}
