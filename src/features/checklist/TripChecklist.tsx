import { type FormEvent, useEffect, useState } from 'react';
import { BottomActionBar } from '@/components/ui/BottomActionBar';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { SelectField, TextField } from '@/components/ui/Field';
import { CheckIcon, PlusIcon } from '@/components/ui/icons';
import { Snackbar } from '@/components/ui/Snackbar';
import type { ChecklistItem, Companion, ID, Trip } from '@/data/models';
import { DEFAULT_CHECKLIST, MAX_CHECKLIST_TEXT } from '@/data/rules/checklist';
import { useChecklistStore } from '@/features/checklist/checklistStore';
import { checklistProgress, splitChecklistInput } from '@/features/checklist/checklistDisplay';
import { useChecklist } from '@/features/checklist/useChecklist';
import { useExpenses } from '@/features/expenses/useExpenses';
import { useMyCompanion } from '@/features/sharing/useMyCompanion';
import { useTrips } from '@/features/trips/useTrips';
import { errorMessage } from '@/lib/errorMessage';
import { josa } from '@/lib/format';

interface Notice {
  id: number;
  message: string;
  undo?: () => void;
}

/**
 * The checklist part of the trip page (준비물): one list for everyone on the trip, what is left
 * to pack first, then what is packed. Who brings an item can be set (a hair dryer one person
 * packs), and "내 담당만" shows only the person's own.
 */
export function TripChecklist({ trip }: { trip: Trip }) {
  const { items, status, error, reload } = useChecklist(trip.id);
  // The trip page loads the ledger anyway; its companions are who can bring things.
  const { companions } = useExpenses(trip.id);
  const me = useMyCompanion(trip.id, companions);
  const update = useChecklistStore((state) => state.update);
  const remove = useChecklistStore((state) => state.remove);
  const restore = useChecklistStore((state) => state.restore);
  const add = useChecklistStore((state) => state.add);
  const [sheet, setSheet] = useState<'add' | 'import' | { edit: ID } | null>(null);
  const [mineOnly, setMineOnly] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  function notify(message: string, undo?: () => void) {
    setNotice((current) => ({ id: (current?.id ?? 0) + 1, message, undo }));
  }

  async function run(action: () => Promise<unknown>) {
    try {
      await action();
    } catch (err) {
      console.error(err);
      notify(errorMessage(err));
    }
  }

  async function deleteItem(id: ID) {
    const removed = await remove(id);
    if (removed) {
      notify(`${josa(removed.text, '을/를')} 삭제했어요.`, () => void run(() => restore(removed)));
    }
  }

  const nameOf = (id: ID | null) => (id ? companions.find((c) => c.id === id)?.name : undefined);
  const canFilter = me !== undefined && items.some((item) => item.assigneeId !== null);
  const shown = canFilter && mineOnly ? items.filter((item) => item.assigneeId === me.id) : items;
  const toPack = shown.filter((item) => !item.checked);
  const packed = shown.filter((item) => item.checked);
  const progress = checklistProgress(items);
  const editing = sheet && typeof sheet === 'object' ? items.find((i) => i.id === sheet.edit) : undefined;

  const row = (item: ChecklistItem) => (
    <ChecklistRow
      key={item.id}
      item={item}
      assignee={nameOf(item.assigneeId)}
      onCheck={(checked) => void run(() => update(item.id, { checked }))}
      onOpen={() => setSheet({ edit: item.id })}
    />
  );

  let content;
  if (status === 'error') {
    content = (
      <div className="flex flex-1 flex-col items-center">
        <EmptyState title="준비물을 불러오지 못했어요" description={error ?? undefined} />
        <Button variant="secondary" onClick={() => void reload()}>
          다시 시도
        </Button>
      </div>
    );
  } else if (status !== 'ready' && items.length === 0) {
    content = (
      <div className="flex flex-col gap-2.5 px-4 py-5" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-12 animate-pulse rounded-xl bg-gray-100" />
        ))}
      </div>
    );
  } else if (items.length === 0) {
    content = (
      <div className="flex flex-1 flex-col items-center pb-8">
        <EmptyState
          title="아직 준비물이 없어요"
          description="챙길 것을 적어 두고 하나씩 체크해 보세요. 함께하는 사람과 같은 목록을 써요."
        />
        <div className="flex w-full max-w-xs flex-col gap-2 px-4">
          <Button
            variant="secondary"
            block
            onClick={() =>
              void run(async () => {
                await add(trip.id, [...DEFAULT_CHECKLIST]);
                notify(`기본 준비물 ${DEFAULT_CHECKLIST.length}개를 넣었어요.`);
              })
            }
          >
            기본 목록으로 시작
          </Button>
          <ImportButton tripId={trip.id} onOpen={() => setSheet('import')} />
        </div>
      </div>
    );
  } else {
    content = (
      <>
        <section aria-label="준비 상황" className="px-4 pt-3">
          <div className="flex min-h-11 items-center gap-3">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100" aria-hidden="true">
              <div
                className="h-full rounded-full bg-brand-500 transition-[width]"
                style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
              />
            </div>
            {canFilter && (
              <button
                type="button"
                aria-pressed={mineOnly}
                onClick={() => setMineOnly((on) => !on)}
                className={`-my-2 flex h-11 shrink-0 items-center rounded-full px-3 text-sm font-semibold ${
                  mineOnly ? 'text-brand-600' : 'text-gray-500'
                }`}
              >
                <span
                  className={`rounded-full px-3 py-1 ${mineOnly ? 'bg-brand-50' : 'bg-gray-100'}`}
                >
                  내 담당만
                </span>
              </button>
            )}
          </div>
        </section>

        <section aria-label="챙길 것" className="px-4 pt-3">
          {toPack.length > 0 ? (
            <ul className="divide-y divide-gray-100">{toPack.map(row)}</ul>
          ) : (
            <p className="py-4 text-sm text-gray-500">
              {mineOnly ? '내가 챙길 것은 다 챙겼어요.' : '챙길 것을 다 챙겼어요.'}
            </p>
          )}
        </section>

        {packed.length > 0 && (
          <section aria-labelledby="checklist-packed" className="px-4 pt-4 pb-6">
            <h3 id="checklist-packed" className="text-sm font-semibold text-gray-500">
              챙긴 것 {packed.length}
            </h3>
            <ul className="divide-y divide-gray-100">{packed.map(row)}</ul>
          </section>
        )}
      </>
    );
  }

  return (
    <>
      <div className="flex flex-1 flex-col">{content}</div>

      <BottomActionBar>
        <Button block onClick={() => setSheet('add')}>
          <PlusIcon width={20} height={20} />
          준비물 추가
        </Button>
      </BottomActionBar>

      {sheet === 'add' && (
        <AddSheet
          tripId={trip.id}
          onAdded={(texts) => notify(addedText(texts))}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === 'import' && (
        <ImportSheet
          trip={trip}
          onImported={(count) => notify(`준비물 ${count}개를 가져왔어요.`)}
          onClose={() => setSheet(null)}
        />
      )}
      {editing && (
        <EditSheet
          item={editing}
          companions={companions}
          onDelete={() => {
            setSheet(null);
            void run(() => deleteItem(editing.id));
          }}
          onClose={() => setSheet(null)}
        />
      )}
      {notice && (
        <Snackbar
          key={notice.id}
          message={notice.message}
          actionLabel={notice.undo ? '되돌리기' : undefined}
          onAction={() => {
            notice.undo?.();
            setNotice(null);
          }}
          onClose={() => setNotice(null)}
        />
      )}
    </>
  );
}

const addedText = (texts: string[]) =>
  texts.length === 1 ? `${josa(texts[0]!, '을/를')} 넣었어요.` : `준비물 ${texts.length}개를 넣었어요.`;

interface ChecklistRowProps {
  item: ChecklistItem;
  assignee: string | undefined;
  onCheck: (checked: boolean) => void;
  onOpen: () => void;
}

/** A checkbox (its name is the item's) and the item, which opens its sheet. */
function ChecklistRow({ item, assignee, onCheck, onOpen }: ChecklistRowProps) {
  const labelId = `checklist-${item.id}`;
  return (
    <li className="flex min-h-12 items-center gap-1">
      <label className="relative -ml-2.5 flex size-11 shrink-0 cursor-pointer items-center justify-center">
        <input
          type="checkbox"
          aria-labelledby={labelId}
          checked={item.checked}
          onChange={(event) => onCheck(event.target.checked)}
          className="peer size-[22px] cursor-pointer appearance-none rounded-full border-2 border-gray-300 bg-white checked:border-brand-500 checked:bg-brand-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
        />
        <CheckIcon
          width={14}
          height={14}
          strokeWidth={3.5}
          className="pointer-events-none absolute hidden text-white peer-checked:block"
        />
      </label>
      <button
        type="button"
        onClick={onOpen}
        className="flex min-h-12 min-w-0 flex-1 items-center gap-2 py-2 text-left"
      >
        <span
          id={labelId}
          className={`min-w-0 flex-1 text-[15px] break-words ${
            item.checked ? 'text-gray-400 line-through' : 'text-gray-900'
          }`}
        >
          {item.text}
        </span>
        {assignee && (
          <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600">
            {assignee}
          </span>
        )}
      </button>
    </li>
  );
}

/** "지난 여행에서 가져오기", when another trip has a checklist. */
function ImportButton({ tripId, onOpen }: { tripId: ID; onOpen: () => void }) {
  const countByTrip = useChecklistStore((state) => state.countByTrip);
  const [hasOthers, setHasOthers] = useState(false);

  useEffect(() => {
    let current = true;
    countByTrip()
      .then((counts) => {
        if (current) setHasOthers(Object.keys(counts).some((id) => id !== tripId));
      })
      .catch((error: unknown) => console.error(error));
    return () => {
      current = false;
    };
  }, [countByTrip, tripId]);

  if (!hasOthers) return null;
  return (
    <Button variant="secondary" block onClick={onOpen}>
      지난 여행에서 가져오기
    </Button>
  );
}

interface AddSheetProps {
  tripId: ID;
  onAdded: (texts: string[]) => void;
  onClose: () => void;
}

const ADD_FIELD_ID = 'checklist-add-text';

/** Adds one item at a time (or several, comma-separated), staying open for the next. */
function AddSheet({ tripId, onAdded, onClose }: AddSheetProps) {
  const add = useChecklistStore((state) => state.add);
  const [text, setText] = useState('');
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const texts = splitChecklistInput(text);
    if (texts.length === 0) return setError('준비물 이름을 입력해 주세요.');
    if (texts.some((t) => t.length > MAX_CHECKLIST_TEXT)) {
      return setError(`${MAX_CHECKLIST_TEXT}자까지 쓸 수 있어요.`);
    }
    setSaving(true);
    try {
      await add(tripId, texts);
      setText('');
      setError(undefined);
      onAdded(texts);
    } catch (err) {
      console.error(err);
      setError(errorMessage(err));
    } finally {
      setSaving(false);
      // The button took the focus: back to the field for the next one.
      document.getElementById(ADD_FIELD_ID)?.focus();
    }
  }

  return (
    <BottomSheet open onClose={onClose} title="준비물 추가">
      <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4 px-3 pb-2">
        <TextField
          id={ADD_FIELD_ID}
          label="준비물"
          name="checklistText"
          autoComplete="off"
          enterKeyHint="done"
          placeholder="예: 여권, 선크림"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setError(undefined);
          }}
          error={error}
          hint="쉼표로 나눠 여러 개를 한 번에 넣을 수 있어요."
        />
        <Button type="submit" block disabled={saving}>
          추가
        </Button>
      </form>
    </BottomSheet>
  );
}

interface EditSheetProps {
  item: ChecklistItem;
  companions: Companion[];
  onDelete: () => void;
  onClose: () => void;
}

/** The item's name and who brings it; deleting asks nothing ("되돌리기" afterwards). */
function EditSheet({ item, companions, onDelete, onClose }: EditSheetProps) {
  const update = useChecklistStore((state) => state.update);
  const [text, setText] = useState(item.text);
  const [assigneeId, setAssigneeId] = useState<ID | ''>(item.assigneeId ?? '');
  const [textError, setTextError] = useState<string>();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return setTextError('준비물 이름을 입력해 주세요.');
    const nextAssignee = assigneeId || null;
    if (trimmed === item.text && nextAssignee === item.assigneeId) return onClose();
    setSaving(true);
    setError(null);
    try {
      await update(item.id, { text: trimmed, assigneeId: nextAssignee });
      onClose();
    } catch (err) {
      console.error(err);
      setError(errorMessage(err));
      setSaving(false);
    }
  }

  return (
    <BottomSheet open onClose={onClose} title="준비물">
      <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4 px-3 pb-2">
        <TextField
          label="이름"
          name="checklistText"
          autoComplete="off"
          enterKeyHint="done"
          maxLength={MAX_CHECKLIST_TEXT}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setTextError(undefined);
          }}
          error={textError}
        />
        {companions.length > 1 && (
          <SelectField
            label="챙길 사람"
            value={assigneeId}
            onChange={(e) => setAssigneeId(e.target.value)}
          >
            <option value="">정하지 않음</option>
            {companions.map((companion) => (
              <option key={companion.id} value={companion.id}>
                {companion.name}
              </option>
            ))}
          </SelectField>
        )}
        {error && (
          <p role="alert" className="text-sm text-red-500">
            {error}
          </p>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={onDelete} disabled={saving} className="text-red-500">
            삭제
          </Button>
          <Button type="submit" disabled={saving}>
            저장
          </Button>
        </div>
      </form>
    </BottomSheet>
  );
}

interface ImportSheetProps {
  trip: Trip;
  onImported: (count: number) => void;
  onClose: () => void;
}

/** The other trips with a checklist, latest first; one tap copies its items here. */
function ImportSheet({ trip, onImported, onClose }: ImportSheetProps) {
  const { trips } = useTrips();
  const countByTrip = useChecklistStore((state) => state.countByTrip);
  const copyFrom = useChecklistStore((state) => state.copyFrom);
  const [counts, setCounts] = useState<Record<ID, number> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let current = true;
    countByTrip()
      .then((result) => current && setCounts(result))
      .catch((err: unknown) => {
        console.error(err);
        if (current) setError(errorMessage(err));
      });
    return () => {
      current = false;
    };
  }, [countByTrip]);

  const others = trips
    .filter((other) => other.id !== trip.id && (counts?.[other.id] ?? 0) > 0)
    .sort((a, b) => (a.startDate < b.startDate ? 1 : a.startDate > b.startDate ? -1 : 0));

  async function pick(fromId: ID) {
    setBusy(true);
    setError(null);
    try {
      const added = await copyFrom(fromId, trip.id);
      onImported(added.length);
      onClose();
    } catch (err) {
      console.error(err);
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <BottomSheet open onClose={onClose} title="지난 여행에서 가져오기">
      <div className="px-3 pb-2">
        <p className="text-sm break-keep text-gray-500">
          고른 여행의 준비물을 체크를 푼 채로 넣어요.
        </p>
        <ul className="mt-2 flex flex-col">
          {others.map((other) => (
            <li key={other.id}>
              <button
                type="button"
                disabled={busy}
                onClick={() => void pick(other.id)}
                className="flex min-h-12 w-full items-center gap-3 rounded-xl px-1 py-2 text-left active:bg-gray-50"
              >
                <span className="min-w-0 flex-1 truncate font-semibold">{other.title}</span>
                <span className="shrink-0 text-sm text-gray-500">{counts?.[other.id]}개</span>
              </button>
            </li>
          ))}
        </ul>
        {error && (
          <p role="alert" className="mt-2 text-sm text-red-500">
            {error}
          </p>
        )}
      </div>
    </BottomSheet>
  );
}
