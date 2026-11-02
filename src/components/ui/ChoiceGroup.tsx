import { type ReactNode, useId } from 'react';

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
  /** Small control at the end of the legend row. */
  action?: ReactNode;
}

/** Native radios drawn as chips: arrow keys move the choice, and the group is a fieldset. */
export function ChoiceGroup<T extends string>({
  legend,
  name,
  options,
  value,
  onChange,
  error,
  columns,
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
            className="flex h-11 min-w-0 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3.5 text-[15px] font-medium whitespace-nowrap text-gray-700 transition-colors select-none active:bg-gray-50 has-checked:border-brand-500 has-checked:bg-brand-50 has-checked:font-semibold has-checked:text-brand-700 has-focus-visible:ring-2 has-focus-visible:ring-brand-100"
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              aria-invalid={error ? true : undefined}
              className="sr-only"
            />
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
