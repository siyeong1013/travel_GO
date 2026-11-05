import {
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  useId,
} from 'react';
import { controlClass } from '@/components/ui/fieldClass';
import { ChevronDownIcon } from '@/components/ui/icons';

interface FieldProps {
  label: string;
  error?: string;
  /** Small control shown at the end of the label row, e.g. a "clear" button. */
  action?: ReactNode;
  /** Help text under the control; the error takes its place when there is one. */
  hint?: ReactNode;
  className?: string;
  id?: string;
}

interface ControlA11y {
  id: string;
  'aria-invalid'?: true;
  'aria-describedby'?: string;
  /** The label's own id (a control named by more than the label points at it). */
  labelId: string;
}

function FieldShell({
  label,
  error,
  action,
  hint,
  className,
  id,
  children,
}: FieldProps & { children: (a11y: ControlA11y) => ReactNode }) {
  const autoId = useId();
  const controlId = id ?? autoId;
  const errorId = `${controlId}-error`;
  const hintId = `${controlId}-hint`;
  const labelId = `${controlId}-label`;

  return (
    <div className={`flex min-w-0 flex-col gap-1.5 ${className ?? ''}`}>
      <div className="flex min-h-5 items-center justify-between gap-2">
        <label id={labelId} htmlFor={controlId} className="text-sm font-semibold text-gray-700">
          {label}
        </label>
        {action}
      </div>
      {children({
        id: controlId,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': error ? errorId : hint ? hintId : undefined,
        labelId,
      })}
      {error ? (
        <p id={errorId} className="text-sm text-red-500">
          {error}
        </p>
      ) : (
        hint && (
          <p id={hintId} className="text-sm text-gray-500">
            {hint}
          </p>
        )
      )}
    </div>
  );
}

type TextFieldProps = FieldProps & Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'className'>;

export function TextField({ label, error, action, hint, className, id, ...props }: TextFieldProps) {
  return (
    <FieldShell {...{ label, error, action, hint, className, id }}>
      {({ labelId, ...a11y }) => <input {...a11y} className={`h-12 ${controlClass}`} {...props} />}
    </FieldShell>
  );
}

type ButtonFieldProps = FieldProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'id' | 'className' | 'children' | 'value'> & {
    /** What the field holds, or a placeholder (`placeholder`) while it holds nothing. */
    value: string | null;
    placeholder: string;
  };

/**
 * A field that opens a picker (a sheet) instead of taking typing; it looks like an input. Named by
 * its label and what it holds: "여행 기간 12.1 (화) – 12.3 (목)".
 */
export function ButtonField({
  label,
  error,
  action,
  hint,
  className,
  id,
  value,
  placeholder,
  ...props
}: ButtonFieldProps) {
  const valueId = useId();
  return (
    <FieldShell {...{ label, error, action, hint, className, id }}>
      {({ labelId, ...a11y }) => (
        <button
          type="button"
          {...a11y}
          aria-labelledby={`${labelId} ${valueId}`}
          className={`flex h-12 items-center text-left ${controlClass}`}
          {...props}
        >
          <span id={valueId} className={`truncate ${value ? '' : 'text-gray-400'}`}>
            {value ?? placeholder}
          </span>
        </button>
      )}
    </FieldShell>
  );
}

type TextAreaFieldProps = FieldProps &
  Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id' | 'className'>;

export function TextAreaField({
  label,
  error,
  action,
  hint,
  className,
  id,
  ...props
}: TextAreaFieldProps) {
  return (
    <FieldShell {...{ label, error, action, hint, className, id }}>
      {({ labelId, ...a11y }) => <textarea {...a11y} className={`resize-none py-3 ${controlClass}`} {...props} />}
    </FieldShell>
  );
}

type SelectFieldProps = FieldProps & Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id' | 'className'>;

/** Native select (wheel picker on iOS, list dialog on Android). */
export function SelectField({ label, error, action, hint, className, id, ...props }: SelectFieldProps) {
  return (
    <FieldShell {...{ label, error, action, hint, className, id }}>
      {({ labelId, ...a11y }) => (
        <div className="relative">
          <select {...a11y} className={`h-12 appearance-none pr-10 ${controlClass}`} {...props} />
          <ChevronDownIcon
            width={20}
            height={20}
            className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-gray-400"
          />
        </div>
      )}
    </FieldShell>
  );
}
