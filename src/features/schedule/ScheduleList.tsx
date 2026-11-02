import type { ScheduleItem } from '@/data/models';
import { ScheduleItemCard } from '@/features/schedule/ScheduleItemCard';

interface ScheduleListProps {
  items: ScheduleItem[];
  /** Number the items (days); the inbox is unnumbered. */
  numbered: boolean;
  onSelect: (item: ScheduleItem) => void;
}

export function ScheduleList({ items, numbered, onSelect }: ScheduleListProps) {
  return (
    <ol className="flex flex-col gap-2.5 px-4 py-4">
      {items.map((item, index) => (
        <li key={item.id}>
          <ScheduleItemCard
            item={item}
            number={numbered ? index + 1 : null}
            onClick={() => onSelect(item)}
          />
        </li>
      ))}
    </ol>
  );
}
