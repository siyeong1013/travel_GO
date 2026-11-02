import { useId, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { BottomActionBar } from '@/components/ui/BottomActionBar';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { PlusIcon } from '@/components/ui/icons';
import { Snackbar } from '@/components/ui/Snackbar';
import type { ID, LocalDate, ScheduleItem, Trip } from '@/data/models';
import { itemsOn } from '@/data/rules/schedule';
import { AddPlaceSheet } from '@/features/schedule/AddPlaceSheet';
import { DayTabs } from '@/features/schedule/DayTabs';
import {
  buildDayTabs,
  dateOf,
  type GroupKey,
  resolveDayKey,
  tabElementId,
} from '@/features/schedule/dayTabs';
import { EditItemSheet } from '@/features/schedule/EditItemSheet';
import { ScheduleBoard } from '@/features/schedule/ScheduleBoard';
import { useScheduleStore } from '@/features/schedule/scheduleStore';
import { useSchedule } from '@/features/schedule/useSchedule';
import { josa } from '@/lib/format';

interface Notice {
  id: number;
  message: string;
  undo?: () => Promise<void>;
}

/** Day tabs + the selected day's (or inbox's) items + "add place". */
export function TripSchedule({ trip, today }: { trip: Trip; today: LocalDate }) {
  const { items, status, error, reload } = useSchedule(trip.id);
  const move = useScheduleStore((state) => state.move);
  const [params, setParams] = useSearchParams();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<ID | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const noticeCount = useRef(0);
  const idPrefix = useId();
  const panelId = `${idPrefix}-panel`;

  const selected = resolveDayKey(params.get('day'), trip, today);
  const tabs = buildDayTabs(trip, items);
  const selectedTab = tabs.find((tab) => tab.key === selected)!;
  const groupItems = itemsOn(items, dateOf(selected));
  const editing = items.find((item) => item.id === editingId);

  function select(key: GroupKey) {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.set('day', key);
        return next;
      },
      { replace: true },
    );
  }

  function notify(message: string, undo?: () => Promise<void>) {
    noticeCount.current += 1;
    setNotice({ id: noticeCount.current, message, undo });
  }

  /** Within the item's group (at `index`) or to the end of another one, with undo for the latter. */
  async function moveItem(
    item: ScheduleItem,
    date: LocalDate | null,
    index = itemsOn(items, date).length,
  ) {
    const from = {
      date: item.date,
      index: itemsOn(items, item.date).findIndex((i) => i.id === item.id),
    };
    await move(item.id, { date, index });
    if (date === item.date) return;
    const target = tabs.find((tab) => tab.date === date)!;
    notify(`${josa(item.place.name, '을/를')} ${josa(target.title, '으로/로')} 옮겼어요.`, () =>
      move(item.id, from),
    );
  }

  /** For drag and drop, where nobody awaits the move: failures become a notice. */
  function dropItem(item: ScheduleItem, date: LocalDate | null, index?: number) {
    moveItem(item, date, index).catch((err: unknown) => {
      console.error(err);
      notify('옮기지 못했어요. 다시 시도해 주세요.');
    });
  }

  function undo(action: () => Promise<void>) {
    setNotice(null);
    action().catch((err: unknown) => {
      console.error(err);
      notify('되돌리지 못했어요.');
    });
  }

  let content;
  if (status === 'error') {
    content = (
      <div className="flex flex-1 flex-col items-center">
        <EmptyState title="일정을 불러오지 못했어요" description={error ?? undefined} />
        <Button variant="secondary" onClick={() => void reload()}>
          다시 시도
        </Button>
      </div>
    );
  } else if (status !== 'ready' && items.length === 0) {
    content = <ListSkeleton />;
  } else if (groupItems.length === 0) {
    content =
      selectedTab.date === null ? (
        <EmptyState
          title="보관함이 비어 있어요"
          description="날짜를 아직 정하지 않은 장소를 모아 두는 곳이에요."
        />
      ) : (
        <EmptyState title="아직 일정이 없어요" description="아래 버튼으로 장소를 추가해 보세요." />
      );
  } else {
    content = (
      <ScheduleBoard
        items={groupItems}
        numbered={selectedTab.date !== null}
        targets={tabs.filter((tab) => tab.key !== selected)}
        onSelect={(item) => setEditingId(item.id)}
        onDragStart={() => setNotice(null)}
        onReorder={(item, index) => dropItem(item, item.date, index)}
        onMoveToGroup={(item, target) => dropItem(item, target.date)}
      />
    );
  }

  return (
    <>
      <div className="sticky top-[calc(3.5rem_+_env(safe-area-inset-top))] z-10 border-b border-gray-100 bg-white">
        <DayTabs
          tabs={tabs}
          selected={selected}
          onSelect={select}
          idPrefix={idPrefix}
          panelId={panelId}
        />
      </div>
      <section
        id={panelId}
        role="tabpanel"
        aria-labelledby={tabElementId(idPrefix, selected)}
        className="flex flex-1 flex-col"
      >
        {content}
      </section>

      <BottomActionBar>
        <Button block onClick={() => setAdding(true)}>
          <PlusIcon width={20} height={20} />
          {selectedTab.title}에 장소 추가
        </Button>
      </BottomActionBar>

      {adding && (
        <AddPlaceSheet tripId={trip.id} target={selectedTab} onClose={() => setAdding(false)} />
      )}
      {editing && (
        <EditItemSheet
          key={editing.id}
          item={editing}
          tabs={tabs}
          onMove={(item, date) => moveItem(item, date)}
          onClose={() => setEditingId(null)}
        />
      )}
      {notice && (
        <Snackbar
          key={notice.id}
          message={notice.message}
          actionLabel={notice.undo ? '되돌리기' : undefined}
          onAction={notice.undo && (() => undo(notice.undo!))}
          onClose={() => setNotice(null)}
        />
      )}
    </>
  );
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-2.5 px-4 py-4" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-[60px] animate-pulse rounded-2xl bg-gray-100" />
      ))}
    </div>
  );
}
