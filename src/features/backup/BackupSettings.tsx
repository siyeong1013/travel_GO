import { type ChangeEvent, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { PageSection } from '@/components/ui/PageSection';
import { Snackbar } from '@/components/ui/Snackbar';
import type { BackupFile } from '@/data/models';
import { BackupFormatError } from '@/data/repositories';
import {
  importedMessage,
  invalidAt,
  readBackupFile,
  toFile,
} from '@/features/backup/backupFile';
import { useBackupStore } from '@/features/backup/backupStore';
import { ImportSheet } from '@/features/backup/ImportSheet';
import { downloadFile } from '@/lib/download';
import { errorMessage } from '@/lib/errorMessage';
import { formatDateTime } from '@/lib/format';
import { canShareFile, shareFile } from '@/lib/share';

interface Notice {
  id: number;
  message: string;
}

/** Settings sections: save or share a backup of everything, and import one. */
export function BackupSettings() {
  const lastExportedAt = useBackupStore((state) => state.lastExportedAt);
  const exportAll = useBackupStore((state) => state.exportAll);
  const markExported = useBackupStore((state) => state.markExported);
  // Asked once with a stand-in: Chrome shares only some file types, not JSON.
  const [shareable] = useState(() =>
    canShareFile(new File(['{}'], 'travel-go-backup.json', { type: 'application/json' })),
  );
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [picked, setPicked] = useState<{ name: string; backup: BackupFile } | null>(null);
  const [readError, setReadError] = useState<{ message: string; at: string | null } | null>(
    null,
  );
  const [notice, setNotice] = useState<Notice | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  function notify(message: string) {
    setNotice((current) => ({ id: (current?.id ?? 0) + 1, message }));
  }

  async function exportBackup(how: 'download' | 'share') {
    setExporting(true);
    setExportError(null);
    try {
      const backup = await exportAll();
      const file = toFile(backup);
      if (how === 'download') {
        downloadFile(file);
        markExported(backup.exportedAt);
        notify('백업 파일을 저장했어요.');
      } else {
        const result = await shareFile(file);
        if (result === 'shared') markExported(backup.exportedAt);
        if (result === 'failed') setExportError('공유하지 못했어요. "파일로 저장"으로 저장해 주세요.');
      }
    } catch (error) {
      console.error(error);
      setExportError(errorMessage(error));
    } finally {
      setExporting(false);
    }
  }

  async function pick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Picking the same file again (after fixing it) must fire another change.
    event.target.value = '';
    if (!file) return;
    setReadError(null);
    try {
      setPicked({ name: file.name, backup: await readBackupFile(file) });
    } catch (error) {
      if (!(error instanceof BackupFormatError)) console.error(error);
      setReadError({ message: errorMessage(error), at: invalidAt(error) });
    }
  }

  return (
    <>
      <PageSection
        title="백업 내보내기"
        description="여행, 일정, 가계부, 표지 사진은 이 브라우저에만 저장돼요. 기기를 바꾸거나 브라우저 데이터를 지우기 전에 파일로 내보내 두세요."
      >
        <div className={shareable ? 'grid grid-cols-2 gap-2' : undefined}>
          <Button block disabled={exporting} onClick={() => void exportBackup('download')}>
            파일로 저장
          </Button>
          {shareable && (
            <Button
              variant="secondary"
              block
              disabled={exporting}
              onClick={() => void exportBackup('share')}
            >
              공유
            </Button>
          )}
        </div>
        <p className="mt-2 text-sm text-gray-500">
          {lastExportedAt
            ? `마지막으로 내보낸 때: ${formatDateTime(lastExportedAt)}`
            : '아직 내보낸 적이 없어요.'}
        </p>
        {exportError && (
          <p role="alert" className="mt-2 text-sm text-red-500">
            {exportError}
          </p>
        )}
      </PageSection>

      <PageSection
        title="백업 가져오기"
        description="내보낸 백업 파일을 불러와요. 지금 데이터에 합치거나, 파일 내용으로 바꿀 수 있어요."
      >
        <Button variant="secondary" block onClick={() => fileInput.current?.click()}>
          백업 파일 고르기
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          aria-label="백업 파일"
          hidden
          onChange={(event) => void pick(event)}
        />
        {readError && (
          <div role="alert" className="mt-2 text-sm text-red-500">
            <p>{readError.message}</p>
            {readError.at && <p className="mt-0.5 text-xs">문제 위치: {readError.at}</p>}
          </div>
        )}
      </PageSection>

      {picked && (
        <ImportSheet
          fileName={picked.name}
          backup={picked.backup}
          onClose={() => setPicked(null)}
          onImported={(summary) => {
            setPicked(null);
            notify(importedMessage(summary));
          }}
        />
      )}
      {notice && (
        <Snackbar key={notice.id} message={notice.message} onClose={() => setNotice(null)} />
      )}
    </>
  );
}
