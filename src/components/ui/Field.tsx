import {
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  useId,
} from 'react';
import { ChevronDownIcon } from '@/components/ui/icons';

// 16px text everywhere so iOS Safari does not zoom in on focus.
const controlClass =
  'w-full min-w-0 rounded-xl border border-gray-200 bg-white px-4 text-base outline-none placeholder:text-gray-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 aria-[invalid=true]:border-red-400 aria-[invalid=true]:focus:ring-red-100';

interface FieldProps {
  label: string;
  error?: string;
  /** Small control shown at the end of the label row, e.g. a "clear" button. */
  action?: ReactNode;
  className?: string;
  id?: string;
}

interface ControlA11y {
  id: string;
  'aria-invalid'?: true;
  'aria-describedby'?: string;
}

function FieldShell({
  label,
  error,
  action,
  className,
  id,
  children,
}: FieldProps & { children: (a11y: ControlA11y) => ReactNode }) {
  const autoId = useId();
  const controlId = id ?? autoId;
  const errorId = `${controlId}-error`;

  return (
    <div className={`flex min-w-0 flex-col gap-1.5 ${className ?? ''}`}>
      <div className="flex min-h-5 items-center justify-between gap-2">
        <label htmlFor={controlId} className="text-sm font-semibold text-gray-700">
          {label}
        </label>
        {action}
      </div>
      {children({
        id: controlId,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': error ? errorId : undefined,
      })}
      {error && (
        <p id={errorId} className="text-sm text-red-500">
          {error}
        </p>
      )}
    </div>
  );
}

type TextFieldProps = FieldProps & Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'className'>;

export function TextField({ label, error, action, className, id, ...props }: TextFieldProps) {
  return (
    <FieldShell label={label} error={error} action={action} className={className} id={id}>
      {(a11y) => <input {...a11y} className={`h-12 ${controlClass}`} {...props} />}
    </FieldShell>
  );
}

type TextAreaFieldProps = FieldProps &
  Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id' | 'className'>;

export function TextAreaField({ label, error, action, className, id, ...props }: TextAreaFieldProps) {
  return (
    <FieldShell label={label} error={error} action={action} className={className} id={id}>
      {(a11y) => <textarea {...a11y} className={`resize-none py-3 ${controlClass}`} {...props} />}
    </FieldShell>
  );
}

type SelectFieldProps = FieldProps & Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id' | 'className'>;

/** Native select (wheel picker on iOS, list dialog on Android). */
export function SelectField({ label, error, action, className, id, ...props }: SelectFieldProps) {
  return (
    <FieldShell label={label} error={error} action={action} className={className} id={id}>
      {(a11y) => (
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
