import type { ButtonHTMLAttributes } from 'react';
import { buttonClass, type ButtonVariant } from '@/components/ui/buttonClass';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  block?: boolean;
}

export function Button({ variant = 'primary', block = false, className, ...props }: ButtonProps) {
  return (
    <button
      type="button"
      className={`${buttonClass(variant, block)} ${className ?? ''}`}
      {...props}
    />
  );
}
