import { PageHeader } from '@/components/ui/PageHeader';

export function SettingsPage() {
  return (
    <>
      <PageHeader title="설정" back />
      <main className="flex-1 px-4 py-6 text-sm text-gray-500">
        데이터 내보내기·가져오기, 설치 안내가 들어갈 자리입니다. (8~9단계)
      </main>
    </>
  );
}
