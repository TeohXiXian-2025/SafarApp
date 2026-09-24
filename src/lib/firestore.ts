// Realtime Firestore hooks. Every snapshot is validated against a domain
// schema, so the UI never renders data that doesn't match the model.
import { collection, doc, onSnapshot, type Query } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import type { z } from 'zod';
import { db } from '../firebase/config';

export interface Live<T> {
  data: T;
  loading: boolean;
  error: Error | null;
}

function parseOrWarn<S extends z.ZodType>(schema: S, value: unknown, where: string): z.infer<S> | null {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  console.warn(`[Safar] Ignoring invalid document at ${where}`, parsed.error.issues);
  return null;
}

/** Live single document. Pass `null` to skip (e.g. while ids are unknown). */
export function useDoc<S extends z.ZodType>(path: string | null, schema: S): Live<z.infer<S> | null> {
  const [state, setState] = useState<Live<z.infer<S> | null>>({ data: null, loading: !!path, error: null });

  useEffect(() => {
    if (!path) return setState({ data: null, loading: false, error: null });
    setState((s) => ({ ...s, loading: true }));
    return onSnapshot(
      doc(db, path),
      (snap) =>
        setState({ data: snap.exists() ? parseOrWarn(schema, snap.data(), path) : null, loading: false, error: null }),
      (error) => setState({ data: null, loading: false, error }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- schema is a module constant
  }, [path]);

  return state;
}

/**
 * Live collection or query. `key` must change whenever the query changes
 * (queries aren't comparable, so we key the subscription on a string).
 */
export function useQuery<S extends z.ZodType>(
  key: string | null,
  build: () => Query | string,
  schema: S,
): Live<z.infer<S>[]> {
  const [state, setState] = useState<Live<z.infer<S>[]>>({ data: [], loading: !!key, error: null });

  useEffect(() => {
    if (!key) return setState({ data: [], loading: false, error: null });
    setState((s) => ({ ...s, loading: true }));
    const q = build();
    const ref = typeof q === 'string' ? collection(db, q) : q;
    return onSnapshot(
      ref,
      (snap) =>
        setState({
          data: snap.docs.map((d) => parseOrWarn(schema, d.data(), d.ref.path)).filter((x): x is z.infer<S> => x !== null),
          loading: false,
          error: null,
        }),
      (error) => setState({ data: [], loading: false, error }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by `key`
  }, [key]);

  return state;
}
