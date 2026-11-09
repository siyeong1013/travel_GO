import {
  type Announcements,
  closestCenter,
  type CollisionDetection,
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  type Modifier,
  MouseSensor,
  TouchSensor,
  type UniqueIdentifier,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS, getEventCoordinates } from '@dnd-kit/utilities';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { GripIcon, PlaneIcon } from '@/components/ui/icons';
import type { ID, ScheduleItem } from '@/data/models';
import { itemNumbers, legsAbove, type RouteLeg } from '@/features/map/route';
import type { DayTab, GroupKey } from '@/features/schedule/dayTabs';
import { isFlightItem } from '@/features/schedule/flightItem';
import { MoveDock } from '@/features/schedule/MoveDock';
import { ScheduleItemCard } from '@/features/schedule/ScheduleItemCard';
import { josa } from '@/lib/format';

interface ScheduleBoardProps {
  /** The shown group (a day or the inbox), in display order. */
  items: ScheduleItem[];
  numbered: boolean;
  /** Other groups, offered as drop targets while dragging. */
  targets: DayTab[];
  onSelect: (item: ScheduleItem) => void;
  onDragStart?: () => void;
  /** Same group, final position `index`. */
  onReorder: (item: ScheduleItem, index: number) => void;
  /** Dropped on another group: goes to its end. */
  onMoveToGroup: (item: ScheduleItem, target: DayTab) => void;
}

interface Point {
  x: number;
  y: number;
}

function contains(element: Element | null | undefined, point: Point | null) {
  if (!element || !point) return false;
  const rect = element.getBoundingClientRect();
  return point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom;
}

const PREVIEW_MARGIN = 8;

/**
 * Centers the drag preview just above the finger, so it never covers the drop target,
 * and keeps it on screen (the handle sits at the right edge).
 */
const liftAboveCursor: Modifier = ({ activatorEvent, draggingNodeRect, transform }) => {
  const start = activatorEvent && getEventCoordinates(activatorEvent);
  if (!start || !draggingNodeRect) return transform;
  const { left, top, width, height } = draggingNodeRect;
  const maxLeft = window.innerWidth - width - PREVIEW_MARGIN;
  const x = Math.min(Math.max(start.x + transform.x - width / 2, PREVIEW_MARGIN), maxLeft);
  const y = Math.max(start.y + transform.y - height - 16, PREVIEW_MARGIN);
  return { ...transform, x: x - left, y: y - top };
};

const screenReaderInstructions = {
  draggable:
    '스페이스 키로 일정을 들고, 위아래 화살표 키로 옮긴 다음 스페이스 키로 내려놓으세요. Esc 키를 누르면 취소돼요.',
};

/**
 * Sortable list of one group. Drag by the handle: mouse right away, touch after a 200ms
 * hold (a quick swipe still scrolls), keyboard with Space + arrows. While a pointer drag is
 * active, `MoveDock` offers the other days and the inbox.
 */
export function ScheduleBoard({
  items,
  numbered,
  targets,
  onSelect,
  onDragStart,
  onReorder,
  onMoveToGroup,
}: ScheduleBoardProps) {
  const [active, setActive] = useState<{ id: ID; byPointer: boolean } | null>(null);
  const [hovered, setHovered] = useState<GroupKey | null>(null);
  const pointer = useRef<Point | null>(null);
  const dockRef = useRef<HTMLDivElement>(null);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // The real on-screen pointer. dnd-kit's deltas include page scroll, but the dock is fixed.
  const trackingPointer = active?.byPointer ?? false;
  useEffect(() => {
    if (!trackingPointer) return;
    const track = (event: PointerEvent | TouchEvent) => {
      const point = 'touches' in event ? event.touches[0] : event;
      if (point) pointer.current = { x: point.clientX, y: point.clientY };
    };
    window.addEventListener('pointermove', track, { passive: true });
    window.addEventListener('touchmove', track, { passive: true });
    return () => {
      window.removeEventListener('pointermove', track);
      window.removeEventListener('touchmove', track);
    };
  }, [trackingPointer]);

  function targetAt(point: Point | null): DayTab | null {
    const dock = dockRef.current;
    if (!dock || !contains(dock, point)) return null;
    const cell = [...dock.querySelectorAll<HTMLElement>('[data-drop-group]')].find((el) =>
      contains(el, point),
    );
    return targets.find((target) => target.key === cell?.dataset.dropGroup) ?? null;
  }

  // Over the dock nothing in the list is a target, so the list stops making room.
  const collisionDetection: CollisionDetection = (args) =>
    contains(dockRef.current, pointer.current) ? [] : closestCenter(args);

  function handleDragStart({ active: dragged, activatorEvent }: DragStartEvent) {
    pointer.current = getEventCoordinates(activatorEvent);
    setActive({ id: String(dragged.id), byPointer: pointer.current !== null });
    navigator.vibrate?.(10);
    onDragStart?.();
  }

  function finish() {
    setActive(null);
    setHovered(null);
    pointer.current = null;
  }

  function handleDragEnd({ active: dragged, over }: DragEndEvent) {
    const item = items.find((i) => i.id === dragged.id);
    const target = targetAt(pointer.current);
    finish();
    if (!item) return;
    if (target) {
      onMoveToGroup(item, target);
    } else if (over && over.id !== dragged.id) {
      const index = items.findIndex((i) => i.id === over.id);
      if (index !== -1) onReorder(item, index);
    }
  }

  const nameOf = (id: UniqueIdentifier) =>
    items.find((item) => item.id === id)?.place.name ?? '일정';
  const positionOf = (id: UniqueIdentifier) => items.findIndex((item) => item.id === id) + 1;
  const announcements: Announcements = {
    onDragStart: ({ active: dragged }) =>
      `${josa(nameOf(dragged.id), '을/를')} 들었어요. 지금 ${positionOf(dragged.id)}번째예요.`,
    onDragOver: ({ over }) => (over ? `${positionOf(over.id)}번째 자리예요.` : undefined),
    onDragEnd: ({ active: dragged, over }) =>
      over
        ? `${josa(nameOf(dragged.id), '을/를')} ${positionOf(over.id)}번째에 내려놓았어요.`
        : `${josa(nameOf(dragged.id), '을/를')} 내려놓았어요.`,
    onDragCancel: ({ active: dragged }) =>
      `이동을 취소했어요. ${josa(nameOf(dragged.id), '은/는')} 제자리에 있어요.`,
  };

  const activeIndex = active ? items.findIndex((item) => item.id === active.id) : -1;
  const activeItem = items[activeIndex];
  const numbers = numbered ? itemNumbers(items) : null;
  const legs = numbered ? legsAbove(items) : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      accessibility={{ announcements, screenReaderInstructions }}
      onDragStart={handleDragStart}
      onDragMove={() => setHovered(targetAt(pointer.current)?.key ?? null)}
      onDragEnd={handleDragEnd}
      onDragCancel={finish}
    >
      <SortableContext items={items.map((item) => item.id)} strategy={verticalListSortingStrategy}>
        {/* No gaps: each item's part of the timeline line reaches the next one. */}
        <ol className="flex flex-col px-4 pt-4 pb-1">
          {items.map((item, index) => (
            <SortableItem
              key={item.id}
              item={item}
              number={numbers?.[index] ?? null}
              joinedAbove={numbered && index > 0}
              joinedBelow={numbered && index < items.length - 1}
              leg={legs?.get(item.id)}
              legHidden={active !== null}
              onSelect={() => onSelect(item)}
            />
          ))}
        </ol>
      </SortableContext>

      {active?.byPointer && targets.length > 0 && (
        <MoveDock ref={dockRef} targets={targets} hovered={hovered} />
      )}

      {createPortal(
        <DragOverlay
          modifiers={[liftAboveCursor]}
          dropAnimation={null}
          // Size to the compact preview instead of the dragged card.
          style={{ width: 'auto', height: 'auto' }}
        >
          {activeItem && (
            <DragPreview item={activeItem} number={numbers?.[activeIndex] ?? null} />
          )}
        </DragOverlay>,
        document.body,
      )}
    </DndContext>
  );
}

function SortableItem({
  item,
  number,
  joinedAbove,
  joinedBelow,
  leg,
  legHidden,
  onSelect,
}: {
  item: ScheduleItem;
  number: number | null;
  joinedAbove: boolean;
  joinedBelow: boolean;
  leg: RouteLeg | undefined;
  legHidden: boolean;
  onSelect: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id, attributes: { roleDescription: '순서 바꾸기' } });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={isDragging ? 'opacity-40' : undefined}
    >
      <ScheduleItemCard
        item={item}
        number={number}
        joinedAbove={joinedAbove}
        joinedBelow={joinedBelow}
        leg={leg}
        legHidden={legHidden}
        onClick={onSelect}
        handle={
          <button
            ref={setActivatorNodeRef}
            type="button"
            aria-label={`${item.place.name} 순서 바꾸기`}
            // `manipulation`, not `none`: a quick swipe on the handle should still scroll.
            className="flex w-11 shrink-0 cursor-grab touch-manipulation items-center justify-center rounded-r-2xl text-gray-300 select-none [-webkit-touch-callout:none] active:cursor-grabbing active:text-gray-500"
            {...attributes}
            {...listeners}
          >
            <GripIcon width={20} height={20} />
          </button>
        }
      />
    </li>
  );
}

function DragPreview({ item, number }: { item: ScheduleItem; number: number | null }) {
  return (
    <div className="pointer-events-none flex max-w-[240px] items-center gap-2 rounded-full bg-gray-900/90 py-2 pr-4 pl-2 text-sm font-semibold text-white shadow-xl">
      {isFlightItem(item) ? (
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-500">
          <PlaneIcon width={13} height={13} />
        </span>
      ) : number !== null ? (
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-500 text-xs">
          {number}
        </span>
      ) : (
        <span className="mx-1.5 size-2.5 shrink-0 rounded-full bg-gray-400" />
      )}
      <span className="truncate">{item.place.name}</span>
    </div>
  );
}
