import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Tracks whether an async action is in flight so a form can disable itself while
 * waiting on the network. `run` resolves/rejects exactly like the action it wraps.
 */
export function usePending() {
  const [pending, setPending] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const run = useCallback(async <T,>(action: () => Promise<T> | T): Promise<T> => {
    setPending(true);
    try {
      return await action();
    } finally {
      // The modal usually unmounts right after a successful action.
      if (mounted.current) setPending(false);
    }
  }, []);

  return { pending, run };
}
