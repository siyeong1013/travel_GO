import { PageHeader } from '@/components/ui/PageHeader';
import { AccountProfile } from '@/features/account/AccountProfile';

export function AccountPage() {
  return (
    <>
      <PageHeader title="계정" back />
      <main className="flex-1">
        <AccountProfile />
      </main>
    </>
  );
}
