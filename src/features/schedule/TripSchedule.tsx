import { useId, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { BottomActionBar } from '@/components/ui/BottomActionBar';
import { Button } from '@/components/ui/Button';
import { ConfirmSheet } from '@/components/ui/ConfirmSheet';
import { EmptyState } from '@/components/ui/EmptyState';
import { PlaneIcon, PlusIcon, TrashIcon } from '@/components/ui/icons';
import { Snackbar } from '@/components/ui/Snackbar';
import type { ID, LocalDate, ScheduleItem, Trip } from '@/data/models';
import { itemsOn } from '@/data/rules/schedule';
import { DayMap } from '@/features/map/DayMap';
import { useMapFocus } from '@/features/map/mapFocus';
import { inboxPins, routeStops } from '@/features/map/route';
import { GoogleMapsAttribution } from '@/features/places/GoogleMapsAttribution';
import { searchBias } from '@/features/places/placeSearch';
import { type AddedFlight, AddFlightSheet } from '@/features/schedule/AddFlightSheet';
import { AddPlaceSheet } from '@/features/schedule/AddPlaceSheet';
import { DayTabs } from '@/features/schedule/DayTabs';
import {
  buildDayTabs,
  dateOf,
  type GroupKey,
  keyOf,
  resolveDayKey,
  tabElementId,
} from '@/features/schedule/dayTabs';
import { EditItemSheet } from '@/features/schedule/EditItemSheet';
import { FlightDataCredit } from '@/features/schedule/FlightResults';
import { ScheduleBoard } from '@/features/schedule/ScheduleBoard';
import { useScheduleStore } from '@/features/schedule/scheduleStore';
import { useSchedule } from '@/features/schedule/useSchedule';
import { editingOf, withEditing } from '@/features/trips/tripView';
import { errorMessage } from '@/lib/errorMessage';
import { josa } from '@/lib/format';

interface Notice {
  id: number;
  message: string;
  undo?: () => Promise<void>;
}

/**
 * Day tabs + the selected day's (or inbox's) items + "add place" and "add flight". The map (the
 * day's route, or the inbox's places as plain pins) is pinned at the top with the tabs, and the
 * list scrolls under it, the map following the places as they go by (`useMapFocus`).
 *
 * The edit mode (`?edit=1`, from the header's pencil or a long press on an item) picks items to
 * delete together, and drags them by their handles; a tap on an item picks it there.
 */
export function TripSchedule({ trip, today }: { trip: Trip; today: LocalDate }) {
  const { items, status, error, reload } = useSchedule(trip.id);
  const move = useScheduleStore((state) => state.move);
  const removeMany = useScheduleStore((state) => state.removeMany);
  const [params, setParams] = useSearchParams();
  const editMode = editingOf(params);
  /**
   * The sheet open: a place for a day it chooses, the selected one to begin with, or flights for
   * their own days (`typed`: a flight number typed as a place, and the day chosen there).
   */
  const [adding, setAdding] = useState<
    { flight: false } | { flight: true; typed?: { number: string; date: LocalDate | null } } | null
  >(null);
  const [editingId, setEditingId] = useState<ID | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const noticeCount = useRef(0);
  const pinnedRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const idPrefix = useId();
  const panelId = `${idPrefix}-panel`;

  const selected = resolveDayKey(params.get('day'), trip, today);
  const tabs = buildDayTabs(trip, items);
  const selectedTab = tabs.find((tab) => tab.key === selected)!;
  const selectedDate = dateOf(selected);
  const groupItems = itemsOn(items, selectedDate);
  // Where their data shows, Google and the flight data ask to be named.
  const hasGooglePlaces = groupItems.some((item) => item.place.placeId);
  const hasFlights = groupItems.some((item) => item.flight);
  const editing = items.find((item) => item.id === editingId);
  const bias = searchBias(trip, items);
  // Picked in the edit mode: of the group shown when they were (another tab starts afresh).
  const [picks, setPicks] = useState<{ group: GroupKey; ids: ID[] }>({ group: selected, ids: [] });
  const [wasEditing, setWasEditing] = useState(editMode);
  if (wasEditing !== editMode) {
    setWasEditing(editMode);
    if (!editMode) setPicks({ group: selected, ids: [] });
  }
  const picked =
    editMode && picks.group === selected
      ? groupItems.filter((item) => picks.ids.includes(item.id))
      : [];
  const allPicked = groupItems.length > 0 && picked.length === groupItems.length;
  const [deleting, setDeleting] = useState<{ busy: boolean; error: string | null } | null>(null);
  // The inbox has no order: its map has pins, without numbers or a route.
  const ordered = selectedDate !== null;
  const mapShown = status !== 'error' && groupItems.length > 0;
  const pins = !mapShown ? [] : ordered ? routeStops(groupItems) : inboxPins(groupItems);
  const focusedId = useMapFocus(
    { pinned: pinnedRef, list: listRef, bar: barRef },
    pins.map((pin) => pin.id),
  );

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

  /** Into the edit mode with `ids` picked (a long-pressed item), or out of it. */
  function setEditMode(on: boolean, ids: ID[] = []) {
    setParams((current) => withEditing(current, on), { replace: true });
    setPicks({ group: selected, ids });
  }

  function pick(item: ScheduleItem) {
    const ids = picked.map((i) => i.id);
    setPicks({
      group: selected,
      ids: ids.includes(item.id) ? ids.filter((id) => id !== item.id) : [...ids, item.id],
    });
  }

  async function deletePicked() {
    const ids = picked.map((item) => item.id);
    setDeleting({ busy: true, error: null });
    try {
      await removeMany(ids);
      setDeleting(null);
      setPicks({ group: selected, ids: [] });
      notify(`${josa(`일정 ${ids.length}개`, '을/를')} 삭제했어요.`);
    } catch (err) {
      console.error(err);
      setDeleting({ busy: false, error: errorMessage(err) });
    }
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

  /** Which days the flights went to, in the trip's order: `KE955를 Day 1에, …`. */
  function flightsAdded(flights: AddedFlight[]) {
    const tabOf = (date: LocalDate | null) => tabs.findIndex((tab) => tab.date === date);
    const where = [...flights]
      .sort((a, b) => tabOf(a.date) - tabOf(b.date))
      .map(({ number, date }) => `${josa(number, '을/를')} ${tabs[tabOf(date)]!.title}에`);
    if (where.length > 0) notify(`${where.join(', ')} 넣었어요.`);
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
      <>
        <div ref={listRef}>
          <ScheduleBoard
            items={groupItems}
            numbered={selectedTab.date !== null}
            focusedId={focusedId}
            targets={tabs.filter((tab) => tab.key !== selected)}
            picked={editMode ? new Set(picked.map((item) => item.id)) : null}
            onPick={pick}
            onLongPress={(item) => {
              if (!editMode) setEditMode(true, [item.id]);
            }}
            onSelect={(item) => setEditingId(item.id)}
            onDragStart={() => setNotice(null)}
            onReorder={(item, index) => dropItem(item, item.date, index)}
            onMoveToGroup={(item, target) => dropItem(item, target.date)}
          />
        </div>
        {editMode && (
          <div className="px-4 pb-4">
            <Button
              variant="secondary"
              block
              onClick={() =>
                setPicks({ group: selected, ids: allPicked ? [] : groupItems.map((i) => i.id) })
              }
            >
              {selectedTab.title} {allPicked ? '전체 해제' : '전체 선택'}
            </Button>
          </div>
        )}
        {(hasGooglePlaces || hasFlights) && (
          <div className="-mt-2 flex flex-col items-end gap-1 px-4 pb-4">
            {hasGooglePlaces && <GoogleMapsAttribution />}
            {hasFlights && <FlightDataCredit />}
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <div
        ref={pinnedRef}
        className="sticky top-[calc(3.5rem_+_env(safe-area-inset-top))] z-10 border-b border-gray-100 bg-white"
      >
        <DayTabs
          tabs={tabs}
          selected={selected}
          onSelect={select}
          idPrefix={idPrefix}
          panelId={panelId}
        />
        {mapShown && <DayMap items={groupItems} ordered={ordered} focusedId={focusedId} />}
      </div>
      <section
        id={panelId}
        role="tabpanel"
        aria-labelledby={tabElementId(idPrefix, selected)}
        className="flex flex-1 flex-col"
      >
        {content}
      </section>

      <BottomActionBar ref={barRef}>
        {editMode ? (
          <Button
            variant="danger"
            block
            disabled={picked.length === 0}
            onClick={() => setDeleting({ busy: false, error: null })}
          >
            <TrashIcon width={20} height={20} className="shrink-0" />
            {picked.length > 0 ? `일정 ${picked.length}개 삭제` : '삭제'}
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button block className="min-w-0" onClick={() => setAdding({ flight: false })}>
              <PlusIcon width={20} height={20} className="shrink-0" />
              <span className="truncate">장소 추가</span>
            </Button>
            <Button
              variant="secondary"
              aria-label="항공편 추가"
              className="shrink-0 px-4"
              onClick={() => setAdding({ flight: true })}
            >
              <PlaneIcon width={20} height={20} />
              항공편
            </Button>
          </div>
        )}
      </BottomActionBar>
      <ConfirmSheet
        open={deleting !== null}
        title={
          picked.length === 1
            ? `'${picked[0]!.place.name}' 일정을 삭제할까요?`
            : `${josa(`일정 ${picked.length}개`, '을/를')} 삭제할까요?`
        }
        description={
          picked.length > 1 ? `${namesOf(picked)}. 되돌릴 수 없어요.` : '되돌릴 수 없어요.'
        }
        confirmLabel="삭제"
        tone="danger"
        busy={deleting?.busy}
        error={deleting?.error}
        onConfirm={() => void deletePicked()}
        onClose={() => setDeleting(null)}
      />

      {adding?.flight === false && (
        <AddPlaceSheet
          tripId={trip.id}
          tabs={tabs}
          day={selected}
          bias={bias}
          onFlight={(number, date) => setAdding({ flight: true, typed: { number, date } })}
          onAdded={(date) => {
            // Another day: shown there, as if its tab was tapped (the next place starts there too).
            if (keyOf(date) !== selected) select(keyOf(date));
          }}
          onClose={() => setAdding(null)}
        />
      )}
      {adding?.flight && (
        <AddFlightSheet
          trip={trip}
          typed={adding.typed}
          onAdded={flightsAdded}
          onClose={() => setAdding(null)}
        />
      )}
      {editing && (
        <EditItemSheet
          key={editing.id}
          trip={trip}
          item={editing}
          tabs={tabs}
          bias={bias}
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

/** The items' names, the first three and how many more: `오사카성, 도톤보리, 쿠로몬 시장 외 2개`. */
function namesOf(items: ScheduleItem[]): string {
  const names = items.slice(0, 3).map((item) => item.place.name).join(', ');
  return items.length > 3 ? `${names} 외 ${items.length - 3}개` : names;
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
