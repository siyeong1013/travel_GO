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
  /** Equal-width columns; without it the options wrap at their own width. */
  columns?: number;
  /**
   * `chips`: a bordered box around each label. `pills`: small round ones, the choice filled in.
   * `segmented`: the options side by side in one track, the choice raised in it.
   */
  appearance?: 'chips' | 'pills' | 'segmented';
  /** Small control at the end of the legend row. */
  action?: ReactNode;
}

/** The label: the 44px target. Pills and segments draw their face inside it. */
const OPTION_CLASS = {
  chips:
    'h-11 justify-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3.5 font-medium text-gray-700 transition-colors active:bg-gray-50 has-checked:border-brand-500 has-checked:bg-brand-50 has-checked:font-semibold has-checked:text-brand-700 has-focus-visible:ring-2 has-focus-visible:ring-brand-100',
  pills: 'h-11 justify-center',
  segmented: 'h-12 justify-center p-1',
};

const FACE_CLASS = {
  pills:
    'flex h-9 w-full items-center justify-center rounded-full bg-gray-100 font-medium text-gray-600 transition-colors peer-checked:bg-brand-500 peer-checked:font-semibold peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-brand-100',
  segmented:
    'flex h-full w-full items-center justify-center rounded-lg px-2 font-medium text-gray-500 transition-colors peer-checked:bg-white peer-checked:font-semibold peer-checked:text-gray-900 peer-checked:shadow-sm peer-focus-visible:ring-2 peer-focus-visible:ring-brand-100',
};

/** Native radios drawn as chips, pills or segments: arrow keys move the choice, and the group is a fieldset. */
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
  // A pill in columns is as wide as its column; wrapping, as its label.
  const face =
    appearance === 'pills'
      ? `${FACE_CLASS.pills} ${columns ? 'px-1' : 'px-3.5'}`
      : FACE_CLASS.segmented;
  const layout =
    appearance === 'segmented'
      ? 'clear-left grid auto-cols-fr grid-flow-col rounded-xl bg-gray-100'
      : columns
        ? `clear-left grid ${appearance === 'pills' ? 'gap-x-1.5' : 'gap-2'}`
        : `clear-left flex flex-wrap ${appearance === 'pills' ? 'gap-x-1.5' : 'gap-2'}`;

  return (
    <fieldset className="relative flex min-w-0 flex-col" aria-describedby={error ? errorId : undefined}>
      <legend className="float-left mb-1.5 min-h-5 text-sm font-semibold text-gray-700">{legend}</legend>
      {action && <div className="absolute top-0 right-0">{action}</div>}
      <div
        className={layout}
        style={columns ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` } : undefined}
      >
        {options.map((option) => (
          <label
            key={option.value}
            className={`flex min-w-0 cursor-pointer items-center text-[15px] whitespace-nowrap select-none ${OPTION_CLASS[appearance]}`}
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
            {appearance === 'chips' ? (
              option.label
            ) : (
              <span className={face}>{option.label}</span>
            )}
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
