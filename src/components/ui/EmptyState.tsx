import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
}

export function EmptyState({ icon, title, description }: EmptyStateProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-8 py-16 text-center">
      {icon && <div className="mb-2 text-gray-300">{icon}</div>}
      <p className="text-base font-semibold text-gray-700">{title}</p>
      {description && <p className="text-sm break-keep text-gray-500">{description}</p>}
    </div>
  );
}
