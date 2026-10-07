import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { Button, Spinner } from '../../ui';
import { resetDemoCacheOnce } from './resetCache';

export function DemoResetGate({ tripId }: { tripId: string }) {
  const running = useRef(false);
  const [error, setError] = useState('');
  const reset = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setError('');
    try {
      const result = await api.post<{ tripId: string }>('demo/reset', {}, { tripId });
      try {
        resetDemoCacheOnce(localStorage, sessionStorage);
      } catch {
        // A fresh trip id also leaves the old guide progress behind when storage is blocked.
      }
      window.location.replace(`/t/${result.tripId}`);
    } catch (cause) {
      running.current = false;
      setError(cause instanceof Error ? cause.message : 'Could not refresh the demo trip.');
    }
  }, [tripId]);

  useEffect(() => { void reset(); }, [reset]);

  return (
    <main className="min-h-dvh flex flex-col items-center justify-center gap-4 px-5 text-center bg-[#FAF8F5]">
      {error ? (
        <>
          <p className="text-sm text-[#B3261E]">{error}</p>
          <Button onClick={() => void reset()}>Try again</Button>
        </>
      ) : <Spinner label="Preparing a fresh demo trip..." />}
    </main>
  );
}
