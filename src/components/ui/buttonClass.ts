export type ButtonVariant = 'primary' | 'secondary' | 'danger';

const variantClass: Record<ButtonVariant, string> = {
  primary: 'bg-brand-500 text-white active:bg-brand-600 disabled:bg-gray-300',
  secondary: 'bg-gray-100 text-gray-900 active:bg-gray-200 disabled:text-gray-400',
  danger: 'bg-red-500 text-white active:bg-red-600 disabled:bg-gray-300',
};

/** Shared button styles, also used for `<Link>`s that look like buttons. */
export const buttonClass = (variant: ButtonVariant = 'primary', block = false) =>
  [
    'inline-flex h-12 items-center justify-center gap-1.5 rounded-xl px-5 text-base font-semibold transition-colors',
    variantClass[variant],
    block ? 'w-full' : '',
  ].join(' ');
