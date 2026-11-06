import { useParams, useSearchParams } from 'react-router';
import { PageHeader } from '@/components/ui/PageHeader';
import { countryName } from '@/features/countries/countryNames';
import { CountryRegions } from '@/features/countries/CountryRegions';
import { regionCount } from '@/features/countries/regionMaps';
import { NotFoundPage } from '@/pages/NotFoundPage';

export function CountryRegionsPage() {
  const { code = '' } = useParams();
  const [params] = useSearchParams();
  if (regionCount(code) === 0) return <NotFoundPage />;
  return (
    <>
      <PageHeader title={countryName(code)} back backFallback="/countries" />
      <main className="flex-1 pb-8">
        <CountryRegions country={code} query={params.get('q') ?? ''} />
      </main>
    </>
  );
}
