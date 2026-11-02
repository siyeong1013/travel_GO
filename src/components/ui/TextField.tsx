import { type InputHTMLAttributes, useId } from 'react';

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

/** Labeled input. 16px text so iOS Safari does not zoom in on focus. */
export function TextField({ label, error, id, className, ...props }: TextFieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const errorId = `${inputId}-error`;

  return (
    <div className={`flex min-w-0 flex-col gap-1.5 ${className ?? ''}`}>
      <label htmlFor={inputId} className="text-sm font-semibold text-gray-700">
        {label}
      </label>
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className="h-12 w-full min-w-0 rounded-xl border border-gray-200 bg-white px-4 text-base outline-none placeholder:text-gray-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 aria-[invalid=true]:border-red-400 aria-[invalid=true]:focus:ring-red-100"
        {...props}
      />
      {error && (
        <p id={errorId} className="text-sm text-red-500">
          {error}
        </p>
      )}
    </div>
  );
}
