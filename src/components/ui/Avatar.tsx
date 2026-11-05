import { useState } from 'react';

interface AvatarProps {
  name: string;
  /** A profile photo; the name's first letter without one (or when it doesn't load). */
  url: string | null;
  /** Tailwind size and text classes, e.g. `size-10 text-base`. */
  className?: string;
}

/** A person's profile photo, or the first letter of their name. Decorative: the name is beside it. */
export function Avatar({ name, url, className = 'size-10 text-base' }: AvatarProps) {
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null);
  const shape = `${className} shrink-0 rounded-full`;
  if (url && url !== brokenUrl) {
    return (
      <img
        src={url}
        alt=""
        referrerPolicy="no-referrer"
        onError={() => setBrokenUrl(url)}
        className={`${shape} bg-gray-100 object-cover ring-1 ring-black/5`}
      />
    );
  }
  return (
    <div
      aria-hidden="true"
      className={`${shape} flex items-center justify-center bg-brand-50 font-bold text-brand-600`}
    >
      {Array.from(name)[0] ?? ''}
    </div>
  );
}
