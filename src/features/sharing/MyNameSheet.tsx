import { type FormEvent, useState } from 'react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Field';
import type { Companion } from '@/data/models';
import { COMPANION_NAME_MAX_LENGTH, isCompanionNameTaken, ME_NAME } from '@/data/rules/companion';

interface MyNameSheetProps {
  /** The owner's companion, still called "나". */
  me: Companion;
  companions: Companion[];
  /** A name to start from: the account's. */
  suggested: string;
  busy: boolean;
  error: string | null;
  onSave: (name: string) => void;
  onClose: () => void;
}

/**
 * Before the first invite: "나" in the ledger becomes the owner's name, since friends would see
 * "나" as themselves.
 */
export function MyNameSheet({
  me,
  companions,
  suggested,
  busy,
  error,
  onSave,
  onClose,
}: MyNameSheetProps) {
  const [name, setName] = useState(suggested);
  const [nameError, setNameError] = useState<string>();

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return setNameError('이름을 입력해 주세요.');
    if (trimmed === ME_NAME) return setNameError('친구들도 알아볼 수 있는 이름을 써 주세요.');
    const others = companions.filter((c) => c.id !== me.id);
    if (isCompanionNameTaken(trimmed, others)) return setNameError('이미 있는 이름이에요.');
    onSave(trimmed);
  }

  return (
    <BottomSheet open onClose={busy ? () => {} : onClose} title="친구들에게 보일 내 이름">
      <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-3 px-3 pb-2">
        <p className="-mt-1 text-sm break-keep text-gray-500">
          가계부의 ‘나’가 이 이름으로 바뀌어요. 친구들은 이 이름으로 봐요.
        </p>
        <TextField
          label="이름"
          name="ownerName"
          value={name}
          maxLength={COMPANION_NAME_MAX_LENGTH}
          autoComplete="off"
          enterKeyHint="done"
          error={nameError}
          onChange={(e) => {
            setName(e.target.value);
            setNameError(undefined);
          }}
        />
        {error && (
          <p role="alert" className="text-sm text-red-500">
            {error}
          </p>
        )}
        <Button type="submit" block disabled={busy}>
          저장하고 초대 링크 만들기
        </Button>
      </form>
    </BottomSheet>
  );
}
