import { PageHeader } from '@/components/ui/PageHeader';
import { VisitedCountries } from '@/features/countries/VisitedCountries';

export function CountriesPage() {
  return (
    <>
      <PageHeader title="다녀온 나라" back />
      <main className="flex-1 pb-8">
        <VisitedCountries />
      </main>
    </>
  );
}
