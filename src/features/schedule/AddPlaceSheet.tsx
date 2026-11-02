import { type FormEvent, useState } from 'react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Field';
import type { ID } from '@/data/models';
import { type DayTab, tabLabel } from '@/features/schedule/dayTabs';
import { useScheduleStore } from '@/features/schedule/scheduleStore';
import { errorMessage } from '@/lib/errorMessage';

interface AddPlaceSheetProps {
  tripId: ID;
  /** Day (or inbox) the place is added to, at the end. */
  target: DayTab;
  onClose: () => void;
}

/**
 * Adds a place by typing its name. Place search (step 6) will sit on top of this,
 * and this form stays as the "enter manually" fallback.
 */
export function AddPlaceSheet({ tripId, target, onClose }: AddPlaceSheetProps) {
  const add = useScheduleStore((state) => state.add);
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string>();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError('장소 이름을 입력해 주세요.');
      return;
    }
    setSaving(true);
    setSubmitError(null);
    try {
      await add({
        tripId,
        date: target.date,
        place: { placeId: null, name: trimmed, address: null, location: null },
      });
      onClose();
    } catch (error) {
      console.error(error);
      setSubmitError(errorMessage(error));
      setSaving(false);
    }
  }

  return (
    <BottomSheet open onClose={onClose} title="장소 추가">
      <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4 px-3 pb-2">
        <p className="-mt-1 text-sm text-gray-500">{tabLabel(target)}에 추가돼요.</p>
        <TextField
          label="장소 이름"
          name="name"
          placeholder="예: 오사카성"
          autoComplete="off"
          enterKeyHint="done"
          maxLength={100}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setNameError(undefined);
          }}
          error={nameError}
        />
        {submitError && (
          <p role="alert" className="text-sm text-red-500">
            {submitError}
          </p>
        )}
        <Button type="submit" block disabled={saving}>
          추가
        </Button>
      </form>
    </BottomSheet>
  );
}
