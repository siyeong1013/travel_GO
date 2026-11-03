import { type ReactNode, useId } from 'react';
import { CheckIcon } from '@/components/ui/icons';

interface ChoiceGroupProps<T extends string> {
  legend: string;
  /** The radios' `name` (also used to focus the group when it's invalid). */
  name: string;
  options: readonly { value: T; label: ReactNode }[];
  /** Null: nothing chosen yet. */
  value: T | null;
  onChange: (value: T) => void;
  error?: string;
  /** Equal-width columns; without it the chips wrap at their own width. */
  columns?: number;
  /** `checks`: a round check before each label instead of a chip around it. */
  appearance?: 'chips' | 'checks';
  /** Small control at the end of the legend row. */
  action?: ReactNode;
}

const OPTION_CLASS = {
  chips:
    'justify-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3.5 font-medium text-gray-700 transition-colors active:bg-gray-50 has-checked:border-brand-500 has-checked:bg-brand-50 has-checked:font-semibold has-checked:text-brand-700 has-focus-visible:ring-2 has-focus-visible:ring-brand-100',
  checks: 'gap-2.5 text-gray-700 has-checked:font-semibold has-checked:text-gray-900',
};

/** Native radios drawn as chips or round checks: arrow keys move the choice, and the group is a fieldset. */
export function ChoiceGroup<T extends string>({
  legend,
  name,
  options,
  value,
  onChange,
  error,
  columns,
  appearance = 'chips',
  action,
}: ChoiceGroupProps<T>) {
  const errorId = useId();

  return (
    <fieldset className="relative flex min-w-0 flex-col" aria-describedby={error ? errorId : undefined}>
      <legend className="float-left mb-1.5 min-h-5 text-sm font-semibold text-gray-700">{legend}</legend>
      {action && <div className="absolute top-0 right-0">{action}</div>}
      <div
        className={columns ? 'clear-left grid gap-2' : 'clear-left flex flex-wrap gap-2'}
        style={columns ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` } : undefined}
      >
        {options.map((option) => (
          <label
            key={option.value}
            className={`flex h-11 min-w-0 cursor-pointer items-center text-[15px] whitespace-nowrap select-none ${OPTION_CLASS[appearance]}`}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              aria-invalid={error ? true : undefined}
              className="peer sr-only"
            />
            {appearance === 'checks' && (
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full border-2 border-gray-300 bg-white text-transparent transition-colors peer-checked:border-brand-500 peer-checked:bg-brand-500 peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-brand-100">
                <CheckIcon width={14} height={14} strokeWidth={3.5} />
              </span>
            )}
            {option.label}
          </label>
        ))}
      </div>
      {error && (
        <p id={errorId} className="mt-1.5 text-sm text-red-500">
          {error}
        </p>
      )}
    </fieldset>
  );
}
