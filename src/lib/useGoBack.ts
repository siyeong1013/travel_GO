import { useNavigate } from 'react-router';

/**
 * Goes back in history when the previous entry is ours; otherwise (opened by link or
 * reload) replaces the current entry with `fallback`.
 */
export function useGoBack(fallback = '/') {
  const navigate = useNavigate();
  return () => {
    const index = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (index > 0) void navigate(-1);
    else void navigate(fallback, { replace: true });
  };
}
