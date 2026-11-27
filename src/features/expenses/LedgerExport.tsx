import { Button } from '@/components/ui/Button';
import { PageSection } from '@/components/ui/PageSection';
import { type LedgerExportProps, useLedgerExport } from '@/features/expenses/useLedgerExport';

/** The summary page's section: save (or, in Safari, share) the expenses for Excel. */
export function LedgerExport(props: LedgerExportProps) {
  const { shareable, save, share, notice } = useLedgerExport(props);

  return (
    <PageSection
      title="엑셀로 내보내기"
      description="지출 목록을 CSV 파일로 저장해요. 엑셀, 넘버스, 구글 시트에서 열 수 있어요."
    >
      <div className="flex gap-2">
        <Button block onClick={save}>
          파일로 저장
        </Button>
        {shareable && (
          <Button variant="secondary" block onClick={() => void share()}>
            공유
          </Button>
        )}
      </div>
      {notice}
    </PageSection>
  );
}
