import { useId, useRef } from 'react';
import { Button } from '@/components/ui/Button';
import { ImageIcon } from '@/components/ui/icons';
import type { CoverPhoto } from '@/data/models';
import { coverStyle } from '@/features/trips/tripCover';

interface CoverPhotoFieldProps {
  cover: CoverPhoto | null;
  /** The trip as typed so far: without a photo, its cover is the gradient of this city. */
  trip: { title: string; city: { name: string } };
  /** A picked photo is being made smaller. */
  preparing: boolean;
  error: string | null;
  onPick: (file: File) => void;
  onRemove: () => void;
}

/**
 * The trip's cover in the form: the photo, or the city's gradient (tapping it picks a photo).
 * Photos come from the device's library or camera.
 */
export function CoverPhotoField({
  cover,
  trip,
  preparing,
  error,
  onPick,
  onRemove,
}: CoverPhotoFieldProps) {
  const labelId = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const choose = () => fileInput.current?.click();

  return (
    <div role="group" aria-labelledby={labelId} className="flex min-w-0 flex-col gap-1.5">
      <p id={labelId} className="flex min-h-5 items-center text-sm font-semibold text-gray-700">
        표지 사진
      </p>
      {cover ? (
        <>
          <img
            src={cover.image}
            alt="고른 표지 사진"
            className="h-36 w-full rounded-2xl object-cover ring-1 ring-black/5"
          />
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" block disabled={preparing} onClick={choose}>
              {preparing ? '사진 준비 중…' : '다른 사진 고르기'}
            </Button>
            <Button variant="secondary" block disabled={preparing} onClick={onRemove}>
              사진 빼기
            </Button>
          </div>
        </>
      ) : (
        <button
          type="button"
          disabled={preparing}
          onClick={choose}
          style={coverStyle(trip)}
          className="flex h-36 w-full flex-col items-center justify-center gap-1.5 rounded-2xl font-semibold text-white transition-opacity active:opacity-90 disabled:opacity-70"
        >
          <ImageIcon width={28} height={28} className={preparing ? 'animate-pulse' : undefined} />
          {preparing ? '사진 준비 중…' : '사진 고르기'}
        </button>
      )}
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        aria-label="표지 사진 파일"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Picking the same photo again (after removing it) must fire another change.
          event.target.value = '';
          if (file) onPick(file);
        }}
      />
      {error ? (
        <p role="alert" className="text-sm text-red-500">
          {error}
        </p>
      ) : (
        !cover && <p className="text-sm text-gray-500">고르지 않으면 이 색으로 꾸며요.</p>
      )}
    </div>
  );
}
