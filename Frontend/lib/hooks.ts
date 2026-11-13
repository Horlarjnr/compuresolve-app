'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from './api';

type Options = { query?: Record<string, any>; interval?: number; enabled?: boolean };

// Small data hook: loading / error / data / meta + refetch, optional silent polling.
export function useFetch<T = any>(path: string | null, options: Options = {}) {
  const { query, interval, enabled = true } = options;
  const [data, setData] = useState<T | null>(null);
  const [meta, setMeta] = useState<any>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);
  const key = JSON.stringify([path, query, enabled]);

  const run = useCallback(
    async (silent = false) => {
      if (!path || !enabled) return;
      const mine = ++seq.current;
      if (!silent) setLoading(true);
      try {
        const res = await api<T>(path, { query });
        if (mine !== seq.current) return;
        setData(res.data);
        setMeta(res.meta ?? null);
        setError(null);
      } catch (e) {
        if (mine !== seq.current) return;
        setError(e instanceof ApiError ? e : new ApiError('Something went wrong', 500));
      } finally {
        if (mine === seq.current && !silent) setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );

  useEffect(() => {
    run(false);
  }, [run]);

  useEffect(() => {
    if (!interval || !path || !enabled) return;
    const id = setInterval(() => run(true), interval);
    return () => clearInterval(id);
  }, [interval, run, path, enabled]);

  return { data, meta, error, loading, refetch: () => run(false), silentRefetch: () => run(true) };
}

export function useDebounced<T>(value: T, ms = 350) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}
