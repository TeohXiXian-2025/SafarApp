// Realtime Firestore hooks. Every snapshot is validated against a domain
// schema, so the UI never renders data that doesn't match the model.
import { collection, doc, onSnapshot, type Query, type SnapshotMetadata } from 'firebase/firestore';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import type { z } from 'zod';
import { db } from '../firebase/config';

export interface Live<T> {
  data: T;
  loading: boolean;
  error: Error | null;
  /** True while the data shown is only the device's cached copy (server not heard from yet). */
  fromCache: boolean;
}

function parseOrWarn<S extends z.ZodType>(schema: S, value: unknown, where: string): z.infer<S> | null {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  console.warn(`[Safar] Ignoring invalid document at ${where}`, parsed.error.issues);
  return null;
}

/**
 * With the offline cache on, the first snapshot comes from the device cache.
 * For data this device has never seen, that first answer is "missing/empty" —
 * which would briefly flash "not found". While online, treat a cache-only miss
 * as still loading and wait for the server's answer.
 */
const cacheMiss = (missing: boolean, meta: SnapshotMetadata) => missing && meta.fromCache && navigator.onLine;

/** Live single document. Pass `null` to skip (e.g. while ids are unknown). */
export function useDoc<S extends z.ZodType>(path: string | null, schema: S): Live<z.infer<S> | null> {
  const [state, setState] = useState<Live<z.infer<S> | null>>({ data: null, loading: !!path, error: null, fromCache: true });

  useEffect(() => {
    if (!path) return setState({ data: null, loading: false, error: null, fromCache: false });
    setState((s) => ({ ...s, loading: true }));
    return onSnapshot(
      doc(db, path),
      // Metadata changes too, so "confirmed missing by the server" still arrives.
      { includeMetadataChanges: true },
      (snap) => {
        if (cacheMiss(!snap.exists(), snap.metadata)) return;
        setState({
          data: snap.exists() ? parseOrWarn(schema, snap.data(), path) : null,
          loading: false,
          error: null,
          fromCache: snap.metadata.fromCache,
        });
      },
      (error) => setState({ data: null, loading: false, error, fromCache: false }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- schema is a module constant
  }, [path]);

  return state;
}

/**
 * One Firestore listener per query key, shared by every component that asks
 * for it: the Plan page, the Ideas page and the "needs you" strip all read the
 * same `ideas:<trip>` listener instead of each opening (and paying for) their
 * own. When the last user goes, the listener stays a little while, so going
 * back and forth between tabs doesn't read the whole collection again.
 */
const KEEP_MS = 60_000;

interface Shared {
  state: Live<unknown[]>;
  subs: Set<() => void>;
  stop?: () => void;
  timer?: ReturnType<typeof setTimeout>;
}
const shared = new Map<string, Shared>();
const NONE: Live<never[]> = { data: [], loading: false, error: null, fromCache: false };
const STARTING: Live<never[]> = { data: [], loading: true, error: null, fromCache: true };

function listen(key: string, build: () => Query | string, schema: z.ZodType, onChange: () => void): () => void {
  let e = shared.get(key);
  if (!e) {
    e = { state: STARTING, subs: new Set() };
    shared.set(key, e);
  }
  const entry = e;
  clearTimeout(entry.timer);
  entry.subs.add(onChange);
  if (!entry.stop) {
    const q = build();
    const ref = typeof q === 'string' ? collection(db, q) : q;
    const set = (state: Live<unknown[]>) => {
      entry.state = state;
      entry.subs.forEach((f) => f());
    };
    entry.stop = onSnapshot(
      ref,
      { includeMetadataChanges: true },
      (snap) => {
        if (cacheMiss(snap.empty, snap.metadata)) return;
        set({
          data: snap.docs.map((d) => parseOrWarn(schema, d.data(), d.ref.path)).filter((x) => x !== null),
          loading: false,
          error: null,
          fromCache: snap.metadata.fromCache,
        });
      },
      (error) => {
        // Firestore ends a listener after an error: the next subscriber starts a fresh one.
        entry.stop = undefined;
        set({ data: [], loading: false, error, fromCache: false });
      },
    );
  }
  return () => {
    entry.subs.delete(onChange);
    if (entry.subs.size) return;
    entry.timer = setTimeout(() => {
      if (entry.subs.size) return;
      entry.stop?.();
      shared.delete(key);
    }, KEEP_MS);
  };
}

/**
 * Live collection or query. `key` must change whenever the query changes
 * (queries aren't comparable, so we key the subscription on a string), and
 * the same key must always mean the same query and schema — it is shared.
 */
export function useQuery<S extends z.ZodType>(
  key: string | null,
  build: () => Query | string,
  schema: S,
): Live<z.infer<S>[]> {
  const subscribe = useCallback(
    (onChange: () => void) => (key ? listen(key, build, schema, onChange) : () => {}),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by `key`
    [key],
  );
  const snapshot = () => (key ? (shared.get(key)?.state ?? STARTING) : NONE);
  return useSyncExternalStore(subscribe, snapshot) as Live<z.infer<S>[]>;
}
