import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { controlClass } from '@/components/ui/fieldClass';

interface CopyTextSheetProps {
  title: string;
  text: string;
  onClose: () => void;
}

/**
 * The text to select and copy by hand, when neither the clipboard nor the share sheet works
 * (outside secure contexts such as http://<LAN IP>, or refused).
 */
export function CopyTextSheet({ title, text, onClose }: CopyTextSheetProps) {
  return (
    <BottomSheet open onClose={onClose} title={title}>
      <div className="flex flex-col gap-3 px-3 pb-2">
        <p className="-mt-1 text-sm break-keep text-gray-500">
          여기서는 바로 복사할 수 없어요. 아래 글을 길게 눌러 전체 선택한 뒤 복사해 주세요.
        </p>
        {/* Focused first when the sheet opens: everything is selected, ready to copy. */}
        <textarea
          readOnly
          aria-label={title}
          rows={10}
          value={text}
          onFocus={(e) => e.currentTarget.select()}
          className={`resize-none py-3 ${controlClass}`}
        />
        <Button variant="secondary" block onClick={onClose}>
          닫기
        </Button>
      </div>
    </BottomSheet>
  );
}
