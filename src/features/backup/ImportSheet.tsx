import { useEffect, useState } from 'react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { ChoiceGroup } from '@/components/ui/ChoiceGroup';
import type { BackupFile, ImportMode, ImportSummary } from '@/data/models';
import { contentsText, previewLines } from '@/features/backup/backupFile';
import { useBackupStore } from '@/features/backup/backupStore';
import { errorMessage } from '@/lib/errorMessage';
import { formatDateTime } from '@/lib/format';

const MODE_OPTIONS = [
  { value: 'merge', label: '병합' },
  { value: 'overwrite', label: '덮어쓰기' },
] as const;

const MODE_HELP: Record<ImportMode, string> = {
  merge:
    '지금 데이터에 파일 내용을 합쳐요. 같은 항목은 더 최근에 고친 쪽이 남고, 이 기기에서 지운 것도 파일에 있으면 다시 생겨요.',
  overwrite: '지금 데이터를 모두 지우고 파일 내용으로 바꿔요. 되돌릴 수 없어요.',
};

interface ImportSheetProps {
  fileName: string;
  backup: BackupFile;
  onClose: () => void;
  onImported: (summary: ImportSummary) => void;
}

/** The confirmation step of an import: what the file holds, merge or overwrite, and a preview. */
export function ImportSheet({ fileName, backup, onClose, onImported }: ImportSheetProps) {
  const preview = useBackupStore((state) => state.preview);
  const importFile = useBackupStore((state) => state.importFile);
  const [mode, setMode] = useState<ImportMode>('merge');
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [previewFailed, setPreviewFailed] = useState<ImportMode | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    preview(backup, mode).then(
      (result) => {
        if (!cancelled) setSummary(result);
      },
      (failure: unknown) => {
        if (cancelled) return;
        console.error(failure);
        setPreviewFailed(mode);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [backup, mode, preview]);

  // A preview of the other mode is on its way out.
  const current = summary?.mode === mode ? summary : null;

  async function run() {
    setBusy(true);
    setError(null);
    try {
      onImported(await importFile(backup, mode));
    } catch (failure) {
      console.error(failure);
      setError(errorMessage(failure));
      setBusy(false);
    }
  }

  return (
    <BottomSheet open onClose={busy ? () => {} : onClose} title="백업 가져오기">
      <div className="px-3 pb-2">
        <div className="rounded-xl bg-gray-50 px-3 py-2.5 text-sm">
          <p className="truncate font-semibold">{fileName}</p>
          <p className="mt-0.5 text-gray-500">{formatDateTime(backup.exportedAt)}에 내보낸 파일</p>
          <p className="break-keep text-gray-500">{contentsText(backup)}</p>
        </div>

        <div className="mt-4">
          <ChoiceGroup<ImportMode>
            legend="가져오는 방법"
            name="importMode"
            columns={2}
            options={MODE_OPTIONS}
            value={mode}
            onChange={setMode}
          />
          <p className="mt-2 text-sm break-keep text-gray-600">{MODE_HELP[mode]}</p>
        </div>

        <section aria-label="미리보기" className="mt-4 rounded-xl border border-gray-100 px-3 py-2.5 text-sm">
          {current ? (
            <>
              <dl className="flex flex-col gap-1.5">
                {previewLines(current).map((line) => (
                  <div key={line.label} className="flex gap-3">
                    <dt className="w-28 shrink-0 font-semibold">
                      {line.label} {line.total}개
                    </dt>
                    <dd className="min-w-0 flex-1 break-keep text-gray-500">{line.detail}</dd>
                  </div>
                ))}
              </dl>
              {current.mode === 'merge' && (
                <p className="mt-2 text-xs break-keep text-gray-500">
                  유지: 이 기기에 같거나 더 최근에 고친 것이 있어서 그대로 두는 항목이에요.
                </p>
              )}
              {current.movedToInbox > 0 && (
                <p className="mt-2 break-keep text-gray-600">
                  여행 기간 밖에 놓이는 일정 {current.movedToInbox}개는 보관함으로 옮겨요.
                </p>
              )}
            </>
          ) : previewFailed === mode ? (
            <p role="alert" className="text-red-500">
              미리보기를 만들지 못했어요.
            </p>
          ) : (
            <p role="status" className="text-gray-500">
              미리 보는 중…
            </p>
          )}
        </section>

        {error && (
          <p role="alert" className="mt-3 text-sm text-red-500">
            {error}
          </p>
        )}
        <div className="mt-5 grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            취소
          </Button>
          <Button
            variant={mode === 'overwrite' ? 'danger' : 'primary'}
            onClick={() => void run()}
            disabled={busy || current === null}
          >
            {mode === 'overwrite' ? '덮어쓰기' : '병합하기'}
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
}
