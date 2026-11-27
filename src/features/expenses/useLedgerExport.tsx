import { useState } from 'react';
import { Snackbar } from '@/components/ui/Snackbar';
import type { Companion, ExpenseWithShares, Trip } from '@/data/models';
import { ledgerCsv, ledgerFileName } from '@/features/expenses/ledgerCsv';
import { downloadFile } from '@/lib/download';
import { canShareFile, shareFile } from '@/lib/share';

export interface LedgerExportProps {
  trip: Trip;
  companions: Companion[];
  expenses: ExpenseWithShares[];
}

/**
 * Saving the expenses as a CSV that Excel opens: `save` downloads it; `share` opens the share
 * sheet where the browser takes files (Safari: "파일에 저장", send to oneself). `notice` is the
 * snackbar to render.
 */
export function useLedgerExport({ trip, companions, expenses }: LedgerExportProps) {
  // Asked once with a stand-in: Chrome shares only some file types.
  const [shareable] = useState(() =>
    canShareFile(new File([''], 'travel-go.csv', { type: 'text/csv' })),
  );
  const [notice, setNotice] = useState<{ id: number; message: string } | null>(null);

  function notify(message: string) {
    setNotice((current) => ({ id: (current?.id ?? 0) + 1, message }));
  }

  const toFile = () =>
    new File([ledgerCsv(trip, companions, expenses)], ledgerFileName(trip), { type: 'text/csv' });

  function save() {
    downloadFile(toFile());
    notify('가계부 파일을 저장했어요.');
  }

  async function share() {
    if ((await shareFile(toFile())) === 'failed') {
      notify('공유하지 못했어요. "파일로 저장"으로 저장해 주세요.');
    }
  }

  return {
    shareable,
    save,
    share,
    /** The share sheet where there is one (a download when it fails), else a download. */
    saveOrShare: () => {
      if (!shareable) return save();
      void shareFile(toFile()).then((result) => {
        if (result === 'failed') save();
      });
    },
    notice: notice && (
      <Snackbar key={notice.id} message={notice.message} onClose={() => setNotice(null)} />
    ),
  };
}
