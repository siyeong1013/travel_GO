import { useParams, useSearchParams } from 'react-router';
import { PageHeader } from '@/components/ui/PageHeader';
import { countryName } from '@/features/countries/countryNames';
import { CountryCities } from '@/features/countries/CountryCities';
import { regionCount } from '@/features/countries/regionMaps';
import { NotFoundPage } from '@/pages/NotFoundPage';

export function CountryCitiesPage() {
  const { code = '' } = useParams();
  const [params] = useSearchParams();
  if (regionCount(code) === 0) return <NotFoundPage />;
  return (
    <>
      <PageHeader title={countryName(code)} back backFallback="/countries" />
      <main className="flex-1 pb-8">
        <CountryCities country={code} query={params.get('q') ?? ''} />
      </main>
    </>
  );
}
