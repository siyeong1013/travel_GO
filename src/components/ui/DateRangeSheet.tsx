import { useLayoutEffect, useRef, useState } from 'react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import type { LocalDate } from '@/data/models';
import {
  addMonths,
  type DatePick,
  dayName,
  monthOf,
  monthsBetween,
  monthTitle,
  monthWeeks,
  tapDate,
  type YearMonth,
} from '@/lib/calendar';
import { formatDate, formatDateRange, formatTripLength } from '@/lib/format';

interface DateRangeSheetProps {
  open: boolean;
  title: string;
  /** What was picked before, if anything: shown picked, and the calendar opens at its month. */
  start: LocalDate | null;
  end: LocalDate | null;
  today: LocalDate;
  onClose: () => void;
  onDone: (start: LocalDate, end: LocalDate) => void;
}

/**
 * Picks a start and an end on one calendar: the months one under another, scrolled through. A tap
 * for the start and one for the end (the same day again: a day trip).
 */
export function DateRangeSheet({ open, title, onClose, ...props }: DateRangeSheetProps) {
  return (
    <BottomSheet open={open} onClose={onClose} title={title}>
      <RangeCalendar {...props} />
    </BottomSheet>
  );
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
/** Months before the one the calendar opens at, and how far it goes after today. */
const MONTHS_BEFORE = 2;
const MONTHS_AFTER_TODAY = 24;
/** Months added at a time above the first one. */
const EARLIER_MONTHS = 12;

function RangeCalendar({ start, end, today, onDone }: Omit<DateRangeSheetProps, 'open' | 'title' | 'onClose'>) {
  const [pick, setPick] = useState<DatePick>({ start, end });
  const [message, setMessage] = useState<string | null>(null);
  const opening = monthOf(start ?? today);
  const [first, setFirst] = useState(() =>
    addMonths(opening < monthOf(today) ? opening : monthOf(today), -MONTHS_BEFORE),
  );
  const lastNeeded = addMonths(monthOf(end ?? start ?? today), 3);
  const lastByToday = addMonths(monthOf(today), MONTHS_AFTER_TODAY);
  const months = monthsBetween(first, lastNeeded > lastByToday ? lastNeeded : lastByToday);

  const list = useRef<HTMLDivElement>(null);
  const sections = useRef(new Map<YearMonth, HTMLElement>());
  // Opens at the picked month, or this one.
  useLayoutEffect(() => {
    const section = sections.current.get(opening);
    if (list.current && section) list.current.scrollTop = section.offsetTop;
  }, [opening]);

  // Months added above keep the ones in view where they were.
  const fromBottom = useRef<number | null>(null);
  useLayoutEffect(() => {
    const element = list.current;
    if (!element || fromBottom.current === null) return;
    element.scrollTop = element.scrollHeight - fromBottom.current;
    fromBottom.current = null;
  }, [first]);

  function showEarlier() {
    const element = list.current;
    if (element) fromBottom.current = element.scrollHeight - element.scrollTop;
    setFirst((month) => addMonths(month, -EARLIER_MONTHS));
  }

  const summary = !pick.start
    ? '시작일을 골라 주세요.'
    : !pick.end
      ? `${formatDate(pick.start)} – 종료일을 골라 주세요.`
      : `${formatDateRange(pick.start, pick.end, today)} · ${formatTripLength(pick.start, pick.end)}`;

  return (
    <div className="flex h-[70dvh] flex-col">
      <p aria-live="polite" className="px-3 pb-3 text-[15px] font-semibold text-brand-600">
        {summary}
      </p>
      <div
        aria-hidden="true"
        className="grid grid-cols-7 border-b border-gray-100 px-1 pb-2 text-center text-xs font-semibold text-gray-500"
      >
        {WEEKDAYS.map((name, column) => (
          <span key={name} className={column === 0 ? 'text-red-500' : column === 6 ? 'text-blue-500' : ''}>
            {name}
          </span>
        ))}
      </div>
      <div ref={list} className="relative flex-1 overflow-y-auto px-1">
        <button
          type="button"
          onClick={showEarlier}
          className="mx-auto mt-3 flex h-11 items-center rounded-full px-4 text-sm font-semibold text-gray-500 active:bg-gray-100"
        >
          이전 달 더 보기
        </button>
        {months.map((month) => (
          <section
            key={month}
            ref={(element) => {
              if (element) sections.current.set(month, element);
              else sections.current.delete(month);
            }}
            aria-label={monthTitle(month)}
            className="pt-4"
          >
            <h3 className="px-2 pb-2 text-base font-bold">{monthTitle(month)}</h3>
            {monthWeeks(month).map((week) => (
              <div key={week.find(Boolean)} className="grid grid-cols-7">
                {week.map((date, column) =>
                  date ? (
                    <Day
                      key={date}
                      date={date}
                      column={column}
                      pick={pick}
                      today={today}
                      onTap={() => {
                        setPick((current) => tapDate(current, date));
                        setMessage(null);
                      }}
                    />
                  ) : (
                    <span key={`blank-${column}`} />
                  ),
                )}
              </div>
            ))}
          </section>
        ))}
      </div>
      <div className="px-1 pt-3 pb-2">
        {message && (
          <p role="alert" className="mb-2 text-center text-sm text-red-500">
            {message}
          </p>
        )}
        <Button
          block
          onClick={() => {
            if (pick.start) onDone(pick.start, pick.end ?? pick.start);
            else setMessage('날짜를 눌러 기간을 골라 주세요.');
          }}
        >
          선택
        </Button>
      </div>
    </div>
  );
}

interface DayProps {
  date: LocalDate;
  /** Its place in the week: 0 for Sunday. */
  column: number;
  pick: DatePick;
  today: LocalDate;
  onTap: () => void;
}

function Day({ date, column, pick, today, onTap }: DayProps) {
  const { start, end } = pick;
  const picked = date === start || date === end;
  // The band from the start to the end, under the days between and half of each end.
  const band =
    start && end && start !== end
      ? date > start && date < end
        ? 'inset-x-0'
        : date === start
          ? 'left-1/2 right-0'
          : date === end
            ? 'left-0 right-1/2'
            : null
      : null;
  const tone = picked
    ? 'bg-brand-600 font-bold text-white'
    : date === today
      ? 'font-bold text-brand-600'
      : column === 0
        ? 'text-red-500'
        : column === 6
          ? 'text-blue-500'
          : 'text-gray-900';
  return (
    <div className="relative flex h-11 items-center justify-center">
      {band && <span aria-hidden="true" className={`absolute inset-y-1 bg-brand-50 ${band}`} />}
      <button
        type="button"
        aria-label={dayName(date)}
        aria-pressed={picked}
        aria-current={date === today ? 'date' : undefined}
        onClick={onTap}
        className={`relative flex size-10 items-center justify-center rounded-full text-[15px] ${tone}`}
      >
        {Number(date.slice(8))}
      </button>
    </div>
  );
}
