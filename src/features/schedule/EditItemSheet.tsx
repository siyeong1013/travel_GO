import { type FormEvent, useState } from 'react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { ConfirmSheet } from '@/components/ui/ConfirmSheet';
import { SelectField, TextAreaField, TextField } from '@/components/ui/Field';
import { MapPinIcon, TrashIcon } from '@/components/ui/icons';
import type { GeoPoint, LocalDate, PlaceSnapshot, ScheduleItem } from '@/data/models';
import { GoogleMapsAttribution } from '@/features/places/GoogleMapsAttribution';
import { PlaceSearchSheet } from '@/features/places/PlaceSearchSheet';
import { useSearchAvailability } from '@/features/places/usePlaceSearch';
import { type DayTab, dateOf, type GroupKey, keyOf, tabLabel } from '@/features/schedule/dayTabs';
import { useScheduleStore } from '@/features/schedule/scheduleStore';
import { errorMessage } from '@/lib/errorMessage';

interface EditItemSheetProps {
  item: ScheduleItem;
  /** Days and the inbox, for the "move to" select. */
  tabs: DayTab[];
  /** Where place search looks first when the item has no location (`searchBias`). */
  bias: GeoPoint | null;
  /** Moves the item to the end of another day or the inbox. */
  onMove: (item: ScheduleItem, date: LocalDate | null) => Promise<void>;
  onClose: () => void;
}

/**
 * Name, place (found by search: address and location), day (moves to the end of another day or
 * the inbox), time, memo, delete.
 */
export function EditItemSheet({ item, tabs, bias, onMove, onClose }: EditItemSheetProps) {
  const update = useScheduleStore((state) => state.update);
  const remove = useScheduleStore((state) => state.remove);
  const searchAvailability = useSearchAvailability();

  const [name, setName] = useState(item.place.name);
  const [place, setPlace] = useState(item.place);
  /** The name before a found place replaced it, to switch back. */
  const [nameBeforePick, setNameBeforePick] = useState<string | null>(null);
  const [groupKey, setGroupKey] = useState<GroupKey>(keyOf(item.date));
  const [time, setTime] = useState(item.time ?? '');
  const [memo, setMemo] = useState(item.memo);
  const [nameError, setNameError] = useState<string>();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [findingPlace, setFindingPlace] = useState(false);
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

  function pickPlace(picked: PlaceSnapshot) {
    setPlace(picked);
    if (picked.name === name.trim()) return;
    setNameBeforePick((before) => before ?? name);
    setName(picked.name);
    setNameError(undefined);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError('장소 이름을 입력해 주세요.');
      return;
    }
    void run(async () => {
      await update(item.id, { place: { ...place, name: trimmed }, time: time || null, memo });
      const date = dateOf(groupKey);
      if (date !== item.date) await onMove(item, date);
    });
  }

  return (
    <>
      <BottomSheet open onClose={onClose} title="일정 편집">
        <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4 px-3 pb-2">
          <div className="flex flex-col gap-2">
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
              action={
                nameBeforePick !== null && name !== nameBeforePick ? (
                  <button
                    type="button"
                    onClick={() => setName(nameBeforePick)}
                    className="-my-3 -mr-2 h-11 shrink-0 rounded-lg px-2 text-sm font-semibold text-gray-500 active:bg-gray-100"
                  >
                    이전 이름으로
                  </button>
                ) : undefined
              }
            />
            <PlaceRow
              place={place}
              onFind={searchAvailability === 'ready' ? () => setFindingPlace(true) : undefined}
            />
          </div>
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
                  className="-my-3 -mr-2 h-11 shrink-0 rounded-lg px-2 text-sm font-semibold text-gray-500 active:bg-gray-100"
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

      {/* Stack on top of the edit sheet, so closing them keeps unsaved edits. */}
      {findingPlace && (
        <PlaceSearchSheet
          initialText={name.trim() || item.place.name}
          bias={place.location ?? bias}
          onPick={pickPlace}
          onClose={() => setFindingPlace(false)}
        />
      )}
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

/** The item's address (or that it has none), and a way to find its place when search works. */
function PlaceRow({ place, onFind }: { place: PlaceSnapshot; onFind?: () => void }) {
  const description =
    place.address ?? (place.location ? '위치만 저장돼 있어요.' : '주소와 위치가 없어요.');
  return (
    <div className="flex items-center gap-3 rounded-xl bg-gray-50 py-1.5 pr-1.5 pl-3">
      <MapPinIcon
        width={18}
        height={18}
        className={`shrink-0 ${place.location ? 'text-brand-500' : 'text-gray-300'}`}
      />
      <div className="min-w-0 flex-1 py-1">
        <p className="text-sm break-keep text-gray-600">{description}</p>
        {place.placeId && <GoogleMapsAttribution className="mt-0.5" />}
      </div>
      {onFind && (
        <button
          type="button"
          onClick={onFind}
          aria-label={place.placeId ? '장소 다시 찾기' : '장소 찾기'}
          className="flex min-h-11 shrink-0 items-center rounded-lg px-2.5 text-sm font-semibold text-brand-600 active:bg-gray-100"
        >
          {place.placeId ? '다시 찾기' : '장소 찾기'}
        </button>
      )}
    </div>
  );
}
