import { useMemo } from 'react';

// Once the real list finishes loading, an empty organization would otherwise
// render a bare "nothing here yet" screen — this swaps in generated sample
// data instead (flagged via `isSample`) so every list/board/chart always has
// something to show. Real data always wins the moment any exists.
export function useFallbackData<T>(real: T[] | null, generator: () => T[]): { data: T[]; isSample: boolean; loading: boolean } {
  const sample = useMemo(generator, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (real === null) return { data: [], isSample: false, loading: true };
  if (real.length === 0) return { data: sample, isSample: true, loading: false };
  return { data: real, isSample: false, loading: false };
}
