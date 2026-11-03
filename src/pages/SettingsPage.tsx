import { PageHeader } from '@/components/ui/PageHeader';
import { BackupSettings } from '@/features/backup/BackupSettings';

export function SettingsPage() {
  return (
    <>
      <PageHeader title="설정" back />
      <main className="flex-1">
        <BackupSettings />
      </main>
    </>
  );
}
