import { type FormEvent, useState } from 'react';
import { useNavigate } from 'react-router';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { ConfirmSheet } from '@/components/ui/ConfirmSheet';
import { SelectField, TextAreaField, TextField } from '@/components/ui/Field';
import { MapPinIcon, PlaneIcon, TrashIcon } from '@/components/ui/icons';
import type {
  GeoPoint,
  LocalDate,
  LocalTime,
  PlaceSnapshot,
  ScheduleFlight,
  ScheduleItem,
  Trip,
} from '@/data/models';
import { itemsOn } from '@/data/rules/schedule';
import { ItemExpenses } from '@/features/expenses/ItemExpenses';
import { GoogleMapsAttribution } from '@/features/places/GoogleMapsAttribution';
import { PlaceSearchSheet } from '@/features/places/PlaceSearchSheet';
import { useSearchAvailability } from '@/features/places/usePlaceSearch';
import { type DayTab, dateOf, type GroupKey, keyOf, tabLabel } from '@/features/schedule/dayTabs';
import {
  airlineName,
  type FlightItem,
  flightHeading,
  flightItems,
  flightNumberOf,
  flightWay,
  withoutFlightMemo,
} from '@/features/schedule/flightItem';
import { lookUpFlight } from '@/features/schedule/flightLookup';
import {
  FlightDataCredit,
  type FlightSearch,
  FlightResults,
} from '@/features/schedule/FlightResults';
import { scheduleStore, useScheduleStore } from '@/features/schedule/scheduleStore';
import { errorMessage } from '@/lib/errorMessage';
import type { FlightLeg } from '@/lib/flights';

interface EditItemSheetProps {
  trip: Trip;
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
 * the inbox), time, memo, the expenses spent there, delete. A flight shows what was looked up
 * instead of a name and place, and can be looked up again. A flight known by its number only (as
 * one not found goes in, or one filled in before airports came along) is filled in from the flight
 * leaving on its day instead of a place: saving puts the airports it leaves from and lands at
 * right before and after it (`flightItems`).
 */
export function EditItemSheet({ trip, item, tabs, bias, onMove, onClose }: EditItemSheetProps) {
  const update = useScheduleStore((state) => state.update);
  const remove = useScheduleStore((state) => state.remove);
  const add = useScheduleStore((state) => state.add);
  const move = useScheduleStore((state) => state.move);
  const searchAvailability = useSearchAvailability();
  const navigate = useNavigate();

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
  const [flight, setFlight] = useState(item.flight);
  const [search, setSearch] = useState<(FlightSearch & { date: LocalDate }) | null>(null);
  /**
   * The airports of a flight filled in: to go before and after it, when it had no data yet; or,
   * looked up again, their new times for the airport items around it.
   */
  const [airports, setAirports] = useState<[departure: FlightItem, arrival: FlightItem] | null>(
    null,
  );

  // A flight (named by its number, or filled in before its airport came along) isn't a place to
  // search for (each search is billed): it is looked up instead.
  const flightNumber =
    flight?.number ?? (!place.placeId && !place.location ? flightNumberOf(name) : null);
  const selectedDate = dateOf(groupKey);
  const shownSearch =
    search && search.number === flightNumber && search.date === selectedDate ? search : null;

  async function run(action: () => Promise<void>, after?: () => void) {
    setBusy(true);
    setError(null);
    try {
      await action();
      onClose();
      after?.();
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

  function findFlight(number: string, date: LocalDate) {
    setSearch({ number, date, result: null });
    void lookUpFlight(number, date).then((result) =>
      setSearch((current) =>
        current?.number === number && current.date === date ? { number, date, result } : current,
      ),
    );
  }

  /**
   * From a found flight: its name, departure time and data, saved with the rest along with its
   * airports (`saveAirports`). What the memo said about it, as the app wrote it before, gives way.
   */
  function fillFlight(leg: FlightLeg) {
    const [departure, filled, arrival] = flightItems(leg);
    setName(filled.place.name);
    setPlace(filled.place);
    setNameError(undefined);
    if (filled.time) setTime(filled.time);
    setFlight(filled.flight);
    setMemo((current) => withoutFlightMemo(current, leg));
    setAirports([departure, arrival]);
    setSearch(null);
  }

  /**
   * A flight filled in that had no data yet gets its airports right before and after it. One
   * looked up again sets their times in the airport items around it (unless they were taken out).
   */
  async function saveAirports(
    date: LocalDate | null,
    [departure, arrival]: [FlightItem, FlightItem],
  ) {
    if (!item.flight) {
      await addBeside(date, departure, 'before');
      await addBeside(date, arrival, 'after');
      return;
    }
    const group = itemsOn(scheduleStore.getState().items, date);
    const at = group.findIndex((other) => other.id === item.id);
    if (at < 0) return;
    const beside = [
      [group[at - 1], departure],
      [group[at + 1], arrival],
    ] as const;
    for (const [other, airport] of beside) {
      if (other?.place.name === airport.place.name && other.time !== airport.time) {
        await update(other.id, { time: airport.time });
      }
    }
  }

  /** An airport of a flight filled in: added, then moved right before or after the flight. */
  async function addBeside(date: LocalDate | null, airport: FlightItem, side: 'before' | 'after') {
    const added = await add({ tripId: trip.id, date, ...airport });
    const group = itemsOn(scheduleStore.getState().items, date);
    const at = group.findIndex((other) => other.id === item.id);
    if (at < 0) return;
    const index = side === 'before' ? at : at + 1;
    if (group[index]?.id !== added.id) await move(added.id, { date, index });
  }

  /** Saves the edits and closes, then does `after`. */
  function save(after?: () => void) {
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError('장소 이름을 입력해 주세요.');
      return;
    }
    void run(async () => {
      await update(item.id, {
        place: { ...place, name: trimmed },
        time: time || null,
        memo,
        flight,
      });
      const date = dateOf(groupKey);
      if (date !== item.date) await onMove(item, date);
      if (airports) await saveAirports(date, airports);
    }, after);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    save();
  }

  const edited =
    name.trim() !== item.place.name ||
    !samePlace(place, item.place) ||
    dateOf(groupKey) !== item.date ||
    (time || null) !== item.time ||
    memo !== item.memo ||
    flight !== item.flight;

  /** To an expense's screen. Edits here would be lost on the way, so they're saved first. */
  function openExpense(path: string) {
    if (busy) return;
    if (edited) save(() => void navigate(path));
    else void navigate(path);
  }

  return (
    <>
      <BottomSheet open onClose={onClose} title="일정 편집">
        <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4 px-3 pb-2">
          <div className="flex flex-col gap-2">
            {flight ? (
              <FlightSummary flight={flight} time={time || null} />
            ) : (
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
            )}
            {flightNumber ? (
              <FlightRow
                number={flightNumber}
                again={item.flight !== null}
                day={tabs.find((tab) => tab.key === groupKey) ?? null}
                search={shownSearch}
                disabled={busy}
                onFind={(date) => findFlight(flightNumber, date)}
                onPick={fillFlight}
              />
            ) : (
              <PlaceRow
                place={place}
                onFind={searchAvailability === 'ready' ? () => setFindingPlace(true) : undefined}
              />
            )}
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
          <ItemExpenses trip={trip} item={item} onOpen={openExpense} />
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

/** Whether a place still is the one the item has (its name is compared on its own). */
const samePlace = (a: PlaceSnapshot, b: PlaceSnapshot) =>
  a.placeId === b.placeId &&
  a.address === b.address &&
  a.location?.lat === b.location?.lat &&
  a.location?.lng === b.location?.lng &&
  a.fetchedAt === b.fetchedAt;

/** The flight the item is: where and when it leaves and lands, by whom, and the terminals. */
function FlightSummary({ flight, time }: { flight: ScheduleFlight; time: LocalTime | null }) {
  return (
    <div className="flex gap-3 rounded-xl bg-gray-50 px-3 py-3">
      <PlaneIcon width={18} height={18} className="mt-0.5 shrink-0 text-brand-600" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold tabular-nums">{flightHeading(flight, time)}</p>
        <p className="text-sm text-gray-600">
          {[airlineName(flight), flight.number].filter(Boolean).join(' · ')}
        </p>
        <p className="text-sm break-keep text-gray-500">{flightWay(flight)}</p>
        <FlightDataCredit className="mt-1" />
      </div>
    </div>
  );
}

interface FlightRowProps {
  number: string;
  /** Whether the item is a flight looked up before (its airports are around it already). */
  again: boolean;
  /** The day picked in the sheet, which the flight leaves on. */
  day: DayTab | null;
  search: FlightSearch | null;
  disabled: boolean;
  onFind: (date: LocalDate) => void;
  onPick: (leg: FlightLeg) => void;
}

/** Looks the item's flight up on its day (the inbox has none), to fill the item in with it. */
function FlightRow({ number, again, day, search, disabled, onFind, onPick }: FlightRowProps) {
  if (!day?.date) {
    return (
      <div className="flex items-center gap-3 rounded-xl bg-gray-50 px-3 py-3">
        <PlaneIcon width={18} height={18} className="shrink-0 text-gray-300" />
        <p className="text-sm break-keep text-gray-600">
          날짜를 고르면 {number} 항공편 정보를 불러올 수 있어요.
        </p>
      </div>
    );
  }
  const date = day.date;
  if (search) {
    return (
      <FlightResults
        search={search}
        adding={null}
        disabled={disabled}
        pickLabel="이 항공편으로 채우기"
        onPick={onPick}
        onRetry={() => onFind(date)}
      />
    );
  }
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onFind(date)}
      className="flex min-h-14 w-full items-center gap-3 rounded-xl bg-gray-50 px-3 py-2.5 text-left active:bg-gray-100 disabled:text-gray-400"
    >
      <PlaneIcon width={18} height={18} className="shrink-0 text-brand-600" />
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">
          {number} 항공편 정보 {again ? '다시 불러오기' : '불러오기'}
        </span>
        <span className="block text-sm break-keep text-gray-500">
          {again
            ? `${tabLabel(day)}에 출발하는 편을 찾아 시간과 항공편 정보를 새로 채우고, 앞뒤 공항의 시간도 맞춰요`
            : `${tabLabel(day)}에 출발하는 편을 찾아 시간과 항공편 정보를 채우고, 출발 공항과 도착 공항을 앞뒤 일정으로 넣어요`}
        </span>
      </span>
    </button>
  );
}

/** The item's address (or that it has none), and a way to find its place when search works. */
function PlaceRow({ place, onFind }: { place: PlaceSnapshot; onFind?: () => void }) {
  const description =
    place.address ??
    (place.location
      ? // Without a place ID: the flight data's airport.
        place.placeId
        ? '위치만 저장돼 있어요.'
        : '항공편 정보의 공항 위치예요.'
      : place.placeId
        ? '주소와 위치는 온라인일 때 다시 불러와요.'
        : '주소와 위치가 없어요.');
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
