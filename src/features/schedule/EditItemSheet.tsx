import { type FormEvent, useState } from 'react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { ConfirmSheet } from '@/components/ui/ConfirmSheet';
import { SelectField, TextAreaField, TextField } from '@/components/ui/Field';
import { TrashIcon } from '@/components/ui/icons';
import type { ScheduleItem } from '@/data/models';
import { itemsOn } from '@/data/rules/schedule';
import { type DayTab, dateOf, type GroupKey, keyOf, tabLabel } from '@/features/schedule/dayTabs';
import { useScheduleStore } from '@/features/schedule/scheduleStore';
import { errorMessage } from '@/lib/errorMessage';

interface EditItemSheetProps {
  item: ScheduleItem;
  /** Days and the inbox, for the "move to" select. */
  tabs: DayTab[];
  onClose: () => void;
}

/** Name, day (moves to the end of another day or the inbox), time, memo, delete. */
export function EditItemSheet({ item, tabs, onClose }: EditItemSheetProps) {
  const items = useScheduleStore((state) => state.items);
  const update = useScheduleStore((state) => state.update);
  const move = useScheduleStore((state) => state.move);
  const remove = useScheduleStore((state) => state.remove);

  const [name, setName] = useState(item.place.name);
  const [groupKey, setGroupKey] = useState<GroupKey>(keyOf(item.date));
  const [time, setTime] = useState(item.time ?? '');
  const [memo, setMemo] = useState(item.memo);
  const [nameError, setNameError] = useState<string>();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      onClose();
    } catch (err) {
      console.error(err);
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError('장소 이름을 입력해 주세요.');
      return;
    }
    void run(async () => {
      await update(item.id, { place: { ...item.place, name: trimmed }, time: time || null, memo });
      const date = dateOf(groupKey);
      if (date !== item.date) {
        await move(item.id, { date, index: itemsOn(items, date).length });
      }
    });
  }

  return (
    <>
      <BottomSheet open onClose={onClose} title="일정 편집">
        <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4 px-3 pb-2">
          <TextField
            label="장소 이름"
            name="name"
            autoComplete="off"
            maxLength={100}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setNameError(undefined);
            }}
            error={nameError}
          />
          <SelectField
            label="날짜"
            name="day"
            value={groupKey}
            onChange={(e) => setGroupKey(e.target.value)}
          >
            {tabs.map((tab) => (
              <option key={tab.key} value={tab.key}>
                {tabLabel(tab)}
              </option>
            ))}
          </SelectField>
          <TextField
            label="시간"
            name="time"
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            action={
              time ? (
                <button
                  type="button"
                  onClick={() => setTime('')}
                  className="text-sm font-semibold text-gray-500 active:text-gray-700"
                >
                  시간 지우기
                </button>
              ) : undefined
            }
          />
          <TextAreaField
            label="메모"
            name="memo"
            rows={3}
            maxLength={500}
            placeholder="예약 번호, 가는 방법 등"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
          />
          {error && (
            <p role="alert" className="text-sm text-red-500">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <Button
              variant="secondary"
              aria-label="일정 삭제"
              className="shrink-0 px-4 text-red-500"
              disabled={busy}
              onClick={() => setConfirmingDelete(true)}
            >
              <TrashIcon width={20} height={20} />
            </Button>
            <Button type="submit" block disabled={busy}>
              저장
            </Button>
          </div>
        </form>
      </BottomSheet>

      {/* Stacks on top of the edit sheet, so cancelling keeps unsaved edits. */}
      <ConfirmSheet
        open={confirmingDelete}
        title={`'${item.place.name}' 일정을 삭제할까요?`}
        description="되돌릴 수 없어요."
        confirmLabel="삭제"
        tone="danger"
        busy={busy}
        error={error}
        onConfirm={() => void run(() => remove(item.id))}
        onClose={() => setConfirmingDelete(false)}
      />
    </>
  );
}
