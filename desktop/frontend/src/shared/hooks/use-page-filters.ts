import { useSearchParams } from 'react-router';

export function usePageFilters() {
  const [params, setParams] = useSearchParams();
  const update = (patch: Record<string, string | undefined>) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        for (const [key, value] of Object.entries(patch)) {
          if (value) next.set(key, value);
          else next.delete(key);
        }
        return next;
      },
      { replace: true },
    );
  return { params, update };
}
