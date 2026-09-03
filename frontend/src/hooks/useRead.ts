import { useCallback, useEffect, useState } from "react";
import { IS_CONFIGURED } from "../lib/config";

export interface ReadState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  /** The contract is not deployed/configured yet - not the same as "empty". */
  unconfigured: boolean;
  /** Unix seconds of the last successful read, or null. */
  loadedAt: number | null;
  reload: () => void;
}

interface Result<T> {
  key: string;
  data: T | null;
  error: string | null;
  loadedAt: number | null;
}

/**
 * Run a contract read with explicit loading, error and unconfigured states.
 *
 * State is only ever set from the async resolution, never synchronously in the
 * effect body: `loading` is derived by comparing the key of the settled result
 * against the current key. That avoids cascading renders and, more usefully,
 * means data from a previous key can never be shown as though it were current.
 */
export function useRead<T>(
  loader: () => Promise<T>,
  deps: unknown[] = [],
  options: { skip?: boolean } = {},
): ReadState<T> {
  const [nonce, setNonce] = useState(0);
  const [result, setResult] = useState<Result<T>>({
    key: "",
    data: null,
    error: null,
    loadedAt: null,
  });

  // Computed every render rather than memoized: it is a cheap stringify, and
  // a string key keeps the effect dependency stable by value.
  const key = JSON.stringify([deps, nonce, options.skip ?? false]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  const active = !options.skip && IS_CONFIGURED;

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    loader()
      .then((value) => {
        if (!cancelled) {
          setResult({
            key,
            data: value,
            error: null,
            loadedAt: Math.floor(Date.now() / 1000),
          });
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setResult({
            key,
            data: null,
            error: err instanceof Error ? err.message : String(err),
            loadedAt: null,
          });
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, active]);

  const settled = result.key === key;

  return {
    data: settled ? result.data : null,
    loading: active && !settled,
    error: settled ? result.error : null,
    unconfigured: !IS_CONFIGURED,
    loadedAt: settled ? result.loadedAt : null,
    reload,
  };
}
